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
  Image,
} from 'react-native';
import { Eye, EyeOff, MessageCircle, CircleChevronRight, Lock, Shield, Zap } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';

const LoginScreen = ({ navigation, route }) => {
  const { loginNative, loginFlowTask, isLoading, error, clearError, flowtaskEnabled } = useAuthStore();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  const [activeTab, setActiveTab] = useState(flowtaskEnabled ? 'flowtask' : 'native');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [flowtaskToken, setFlowtaskToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);
  const [autoLoginInProgress, setAutoLoginInProgress] = useState(false);

  useEffect(() => {
    if (autoLoginAttempted) return;
    const token = route?.params?.token;
    const source = route?.params?.source;

    if (token && source === 'flowtask') {
      setAutoLoginAttempted(true);
      setAutoLoginInProgress(true);
      loginFlowTask(token)
        .then(() => {
          Toast.show({ type: 'success', text1: 'Welcome from FlowTask!', position: 'top' });
          setAutoLoginInProgress(false);
        })
        .catch(() => {
          Toast.show({ type: 'error', text1: 'FlowTask auto-login failed', text2: 'Please try again', position: 'top' });
          setAutoLoginInProgress(false);
        });
    }
  }, [route?.params?.token, route?.params?.source, autoLoginAttempted, loginFlowTask]);

  if (autoLoginInProgress) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}> 
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>Signing in from FlowTask…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleNativeLogin = async () => {
    clearError();
    if (!email.trim() || !password.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter email and password', position: 'top' });
      return;
    }

    try {
      await loginNative({ email: email.toLowerCase(), password });
      Toast.show({ type: 'success', text1: 'Welcome back!', position: 'top' });
    } catch {
      // handled by store
    }
  };

  const handleFlowTaskLogin = async () => {
    clearError();
    if (!flowtaskToken.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter your FlowTask token', position: 'top' });
      return;
    }

    try {
      await loginFlowTask(flowtaskToken.trim());
      Toast.show({ type: 'success', text1: 'FlowTask login successful!', position: 'top' });
    } catch {
      // handled by store
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}> 
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={[styles.header, { borderBottomColor: colors.borderLight }]}> 
            <View style={styles.logo}>
              <Image source={require('../../../assets/logo.png')} style={styles.logoIcon} />
              <Text style={[styles.logoText, { color: colors.textPrimary }]}>FlowTask-Chat</Text>
            </View>
          </View>

          <View style={styles.introSection}>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>Sign in to your workspace and continue collaborating</Text>
          </View>

          <View style={styles.card}>
            {flowtaskEnabled && (
              <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tab, activeTab === 'flowtask' && styles.tabActive]} onPress={() => { setActiveTab('flowtask'); clearError(); }}>
                  <Text style={[styles.tabText, activeTab === 'flowtask' && styles.tabTextActive]}>FlowTask SSO</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'native' && styles.tabActive]} onPress={() => { setActiveTab('native'); clearError(); }}>
                  <Text style={[styles.tabText, activeTab === 'native' && styles.tabTextActive]}>Email</Text>
                </TouchableOpacity>
              </View>
            )}

            {!!error && (
              <View style={styles.errorBox}>
                <Lock size={14} color={colors.error} style={{ marginRight: 8 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {activeTab === 'flowtask' && (
              <View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>FlowTask JWT Token</Text>
                  <TextInput style={styles.tokenInput} placeholder="Paste your JWT token…" placeholderTextColor={colors.inputPlaceholder} value={flowtaskToken} onChangeText={setFlowtaskToken} multiline numberOfLines={3} />
                  <Text style={styles.hint}>Get your token from FlowTask → Settings → API Access</Text>
                </View>

                <TouchableOpacity style={[styles.submitButton, isLoading && styles.submitButtonDisabled]} onPress={handleFlowTaskLogin} disabled={isLoading} activeOpacity={0.85}>
                  {isLoading ? <ActivityIndicator size="small" color={colors.messageTextSent} /> : (
                    <>
                      <Text style={styles.submitButtonText}>Sign in with FlowTask</Text>
                      <CircleChevronRight size={16} color={colors.messageTextSent} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {activeTab === 'native' && (
              <View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput style={styles.input} placeholder="you@company.com" placeholderTextColor={colors.inputPlaceholder} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={(text) => setEmail(text.toLowerCase())} />
                </View>

                <View style={styles.formGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Password</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                      <Text style={styles.forgotLink}>Forgot?</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.passwordWrapper}>
                    <TextInput style={styles.passwordInput} placeholder="Enter password" placeholderTextColor={colors.inputPlaceholder} secureTextEntry={!showPassword} value={password} onChangeText={setPassword} />
                    <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff size={18} color={colors.textTertiary} /> : <Eye size={18} color={colors.textTertiary} />}
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={[styles.submitButton, isLoading && styles.submitButtonDisabled]} onPress={handleNativeLogin} disabled={isLoading} activeOpacity={0.85}>
                  {isLoading ? <ActivityIndicator size="small" color={colors.messageTextSent} /> : (
                    <>
                      <Text style={styles.submitButtonText}>Sign in</Text>
                      <CircleChevronRight size={16} color={colors.messageTextSent} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.footerLink}>
              <Text style={styles.footerText}>New here? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.linkText}>Create account</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.featuresSection}>
            <View style={styles.feature}>
              <Zap size={20} color={colors.warning} style={styles.featureIcon} />
              <View>
                <Text style={styles.featureTitle}>Real-Time Messaging</Text>
                <Text style={styles.featureDesc}>Instant delivery with WebSocket</Text>
              </View>
            </View>

            <View style={styles.feature}>
              <Shield size={20} color={colors.primary} style={styles.featureIcon} />
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

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      color: colors.textSecondary,
      fontWeight: '500',
    },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      backgroundColor: colors.card,
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
    },
    logoText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    introSection: {
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    heading: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
      letterSpacing: -0.6,
    },
    subheading: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    card: {
      marginHorizontal: 20,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: 20,
    },
    tabs: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
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
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textTertiary,
      textAlign: 'center',
    },
    tabTextActive: {
      color: colors.primary,
    },
    errorBox: {
      backgroundColor: `${colors.error}14`,
      borderWidth: 1,
      borderColor: `${colors.error}33`,
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
      color: colors.error,
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
      color: colors.textTertiary,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 15,
      color: colors.inputText,
    },
    tokenInput: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 12,
      color: colors.inputText,
      fontFamily: 'Courier New',
      minHeight: 80,
      textAlignVertical: 'top',
    },
    hint: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 6,
    },
    passwordWrapper: {
      position: 'relative',
    },
    passwordInput: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      paddingRight: 44,
      fontSize: 15,
      color: colors.inputText,
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
      color: colors.primary,
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderRadius: 11,
      backgroundColor: colors.primary,
      marginBottom: 12,
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.messageTextSent,
      letterSpacing: -0.3,
    },
    footerLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    linkText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    featuresSection: {
      paddingHorizontal: 20,
      paddingBottom: 20,
      gap: 12,
    },
    feature: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: 14,
      gap: 12,
    },
    featureIcon: {
      marginTop: 2,
    },
    featureTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    featureDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
  });

export default LoginScreen;
