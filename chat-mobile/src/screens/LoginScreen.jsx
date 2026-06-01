import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Eye, EyeOff, MessageCircle, ArrowRight, Lock, Shield, Zap } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../stores/authStore';

const LoginScreen = ({ navigation, route }) => {
  const { loginNative, loginFlowTask, isLoading, error, clearError, flowtaskEnabled } = useAuthStore();

  const [activeTab, setActiveTab] = useState(flowtaskEnabled ? 'flowtask' : 'native');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [flowtaskToken, setFlowtaskToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);
  const [autoLoginInProgress, setAutoLoginInProgress] = useState(false);

  // Auto-login from FlowTask redirect
  useEffect(() => {
    if (autoLoginAttempted) return;
    const token = route?.params?.token;
    const source = route?.params?.source;
    
    if (token && source === 'flowtask') {
      setAutoLoginAttempted(true);
      setAutoLoginInProgress(true);
      loginFlowTask(token)
        .then(() => {
          Toast.show({
            type: 'success',
            text1: 'Welcome from FlowTask!',
            position: 'top',
          });
          setAutoLoginInProgress(false);
        })
        .catch(() => {
          Toast.show({
            type: 'error',
            text1: 'FlowTask auto-login failed',
            text2: 'Please try again',
            position: 'top',
          });
          setAutoLoginInProgress(false);
        });
    }
  }, [route?.params?.token, route?.params?.source, autoLoginAttempted, loginFlowTask]);

  if (autoLoginInProgress) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loaderText}>Signing in from FlowTask…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleNativeLogin = async () => {
    clearError();
    if (!email.trim() || !password.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Please enter email and password',
        position: 'top',
      });
      return;
    }

    try {
      await loginNative({ email: email.toLowerCase(), password });
      Toast.show({
        type: 'success',
        text1: 'Welcome back!',
        position: 'top',
      });
    } catch {
      // Error handled by store
    }
  };

  const handleFlowTaskLogin = async () => {
    clearError();
    if (!flowtaskToken.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Please enter your FlowTask token',
        position: 'top',
      });
      return;
    }

    try {
      await loginFlowTask(flowtaskToken.trim());
      Toast.show({
        type: 'success',
        text1: 'FlowTask login successful!',
        position: 'top',
      });
    } catch {
      // Error handled by store
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logo}>
              <View style={styles.logoIcon}>
                <MessageCircle size={20} color="white" />
              </View>
              <Text style={styles.logoText}>FlowTask Chat</Text>
            </View>
          </View>

          {/* Intro Section */}
          <View style={styles.introSection}>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>
              Sign in to your workspace and continue collaborating
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Tabs */}
            {flowtaskEnabled && (
              <View style={styles.tabs}>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'flowtask' && styles.tabActive]}
                  onPress={() => {
                    setActiveTab('flowtask');
                    clearError();
                  }}
                >
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === 'flowtask' && styles.tabTextActive,
                    ]}
                  >
                    FlowTask SSO
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'native' && styles.tabActive]}
                  onPress={() => {
                    setActiveTab('native');
                    clearError();
                  }}
                >
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === 'native' && styles.tabTextActive,
                    ]}
                  >
                    Email
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Error Message */}
            {error && (
              <View style={styles.errorBox}>
                <Lock size={14} color="#dc2626" style={{ marginRight: 8 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* FlowTask Form */}
            {activeTab === 'flowtask' && (
              <View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>FlowTask JWT Token</Text>
                  <TextInput
                    style={styles.tokenInput}
                    placeholder="Paste your JWT token…"
                    placeholderTextColor="#d1d5db"
                    value={flowtaskToken}
                    onChangeText={setFlowtaskToken}
                    multiline
                    numberOfLines={3}
                  />
                  <Text style={styles.hint}>
                    Get your token from FlowTask → Settings → API Access
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                  onPress={handleFlowTaskLogin}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Text style={styles.submitButtonText}>Sign in with FlowTask</Text>
                      <ArrowRight size={16} color="white" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Native Form */}
            {activeTab === 'native' && (
              <View>
                {/* Email Field */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@company.com"
                    placeholderTextColor="#d1d5db"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={(text) => setEmail(text.toLowerCase())}
                  />
                </View>

                {/* Password Field */}
                <View style={styles.formGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Password</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                      <Text style={styles.forgotLink}>Forgot?</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.passwordWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Enter password"
                      placeholderTextColor="#d1d5db"
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color="#9ca3af" />
                      ) : (
                        <Eye size={18} color="#9ca3af" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                  onPress={handleNativeLogin}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Text style={styles.submitButtonText}>Sign in</Text>
                      <ArrowRight size={16} color="white" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Footer Link */}
            <View style={styles.footerLink}>
              <Text style={styles.footerText}>New here? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.linkText}>Create account</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Features */}
          <View style={styles.featuresSection}>
            <View style={styles.feature}>
              <Zap size={20} color="#d97706" style={styles.featureIcon} />
              <View>
                <Text style={styles.featureTitle}>Real-Time Messaging</Text>
                <Text style={styles.featureDesc}>Instant delivery with WebSocket</Text>
              </View>
            </View>

            <View style={styles.feature}>
              <Shield size={20} color="#6366f1" style={styles.featureIcon} />
              <View>
                <Text style={styles.featureTitle}>Enterprise Security</Text>
                <Text style={styles.featureDesc}>JWT auth and RBAC protection</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f7f4',
  },
  scrollContent: {
    flexGrow: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loaderText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.04)',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    letterSpacing: -0.5,
  },
  introSection: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
    letterSpacing: -0.6,
  },
  subheading: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
  },
  card: {
    marginHorizontal: 20,
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    padding: 20,
    marginBottom: 20,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
    marginBottom: 20,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#6366f1',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#6366f1',
  },
  errorBox: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    lineHeight: 20,
    flex: 1,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#9ca3af',
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1f2937',
  },
  tokenInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 12,
    color: '#1f2937',
    fontFamily: 'Courier New',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 6,
  },
  passwordWrapper: {
    position: 'relative',
  },
  passwordInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingRight: 44,
    fontSize: 15,
    color: '#1f2937',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -9 }],
    padding: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  forgotLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 11,
    backgroundColor: '#6366f1',
    marginBottom: 12,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'white',
    letterSpacing: -0.3,
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#6b7280',
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366f1',
  },
  featuresSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    padding: 14,
    gap: 12,
  },
  featureIcon: {
    marginTop: 2,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
});

export default LoginScreen;