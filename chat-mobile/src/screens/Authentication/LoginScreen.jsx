import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import ScreenContainer from '../../components/common/ScreenContainer';
import AppScreen from '../../components/common/AppScreen';
import { Eye, EyeOff, CircleChevronRight, Lock, Shield, Zap } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

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
      <AppScreen edges={['top', 'bottom']} style={styles.container}>
        <ScreenContainer style={styles.container}>
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>Signing in from FlowTask…</Text>
          </View>
        </ScreenContainer>
      </AppScreen>
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
      Toast.show({ type: 'success', text1: 'TryChat login successful!', position: 'top' });
    } catch {
      // handled by store
    }
  };

  return (
    <AppScreen edges={['top', 'bottom']} style={styles.container}>
    <ScreenContainer style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.introSection}>
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={[styles.subheading, { color: colors.textSecondary }]}>Sign in to your workspace and continue collaborating</Text>
        </View>

        <View style={styles.card}>
          {flowtaskEnabled && (
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'flowtask' && styles.tabActive]}
                onPress={() => { setActiveTab('flowtask'); clearError(); }}
              >
                <Text style={[styles.tabText, activeTab === 'flowtask' && styles.tabTextActive]}>FlowTask SSO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'native' && styles.tabActive]}
                onPress={() => { setActiveTab('native'); clearError(); }}
              >
                <Text style={[styles.tabText, activeTab === 'native' && styles.tabTextActive]}>Email</Text>
              </TouchableOpacity>
            </View>
          )}

          {!!error && (
            <View style={styles.errorBox}>
              <Lock size={14} color={colors.error} style={{ marginRight: scale(8) }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {activeTab === 'flowtask' && (
            <View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>FlowTask JWT Token</Text>
                <TextInput
                  style={styles.tokenInput}
                  placeholder="Paste your JWT token…"
                  placeholderTextColor={colors.inputPlaceholder}
                  value={flowtaskToken}
                  onChangeText={setFlowtaskToken}
                  multiline
                  numberOfLines={3}
                />
                <Text style={styles.hint}>Get your token from FlowTask → Settings → API Access</Text>
              </View>

              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleFlowTaskLogin}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={colors.messageTextSent} />
                ) : (
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
                <TextInput
                  style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
                  placeholder="you@company.com"
                  placeholderTextColor={colors.inputPlaceholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={(text) => setEmail(text.toLowerCase())}
                />
              </View>

              <View style={styles.formGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Password</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                    <Text style={styles.forgotLink}>Forgot?</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.passwordWrapper, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.inputText }]}
                    placeholder="Enter password"
                    placeholderTextColor={colors.inputPlaceholder}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                    {showPassword
                      ? <EyeOff size={18} color={colors.textTertiary} />
                      : <Eye size={18} color={colors.textTertiary} />}
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
                  <ActivityIndicator size="small" color={colors.messageTextSent} />
                ) : (
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
    </ScreenContainer>
    </AppScreen>
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
      fontSize: moderateScale(14),
      color: colors.textSecondary,
      fontWeight: '500',
    },
    introSection: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(24),
    },
    heading: {
      fontSize: moderateScale(28),
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: verticalScale(8),
      letterSpacing: -0.6,
    },
    subheading: {
      fontSize: moderateScale(14),
      lineHeight: 22,
    },
    card: {
      marginHorizontal: scale(20),
      backgroundColor: colors.card,
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderColor: colors.border,
      padding: moderateScale(20),
      marginBottom: verticalScale(20),
    },
    tabs: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      marginBottom: verticalScale(20),
      gap: 8,
    },
    tab: {
      flex: 1,
      paddingVertical: verticalScale(12),
      paddingHorizontal: scale(16),
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: moderateScale(13),
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
      borderRadius: moderateScale(10),
      paddingVertical: verticalScale(12),
      paddingHorizontal: scale(14),
      marginBottom: verticalScale(16),
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    errorText: {
      fontSize: moderateScale(13),
      color: colors.error,
      lineHeight: 20,
      flex: 1,
    },
    formGroup: {
      marginBottom: verticalScale(16),
    },
    label: {
      fontSize: moderateScale(11),
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: colors.textTertiary,
      marginBottom: verticalScale(6),
    },
    input: {
      borderWidth: 1,
      borderRadius: moderateScale(10),
      paddingVertical: verticalScale(12),
      paddingHorizontal: scale(14),
      fontSize: moderateScale(15),
    },
    tokenInput: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: moderateScale(10),
      paddingVertical: verticalScale(12),
      paddingHorizontal: scale(14),
      fontSize: moderateScale(12),
      color: colors.inputText,
      fontFamily: 'Courier New',
      minHeight: verticalScale(80),
      textAlignVertical: 'top',
    },
    hint: {
      fontSize: moderateScale(12),
      color: colors.textTertiary,
      marginTop: verticalScale(6),
    },
    passwordWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: moderateScale(10),
    },
    passwordInput: {
      flex: 1,
      paddingVertical: verticalScale(12),
      paddingHorizontal: scale(14),
      fontSize: moderateScale(15),
    },
    eyeButton: {
      paddingHorizontal: scale(12),
      justifyContent: 'center',
      alignItems: 'center',
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: verticalScale(6),
    },
    forgotLink: {
      fontSize: moderateScale(12),
      fontWeight: '600',
      color: colors.primary,
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: verticalScale(14),
      paddingHorizontal: scale(18),
      borderRadius: moderateScale(11),
      backgroundColor: colors.primary,
      marginBottom: verticalScale(12),
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: moderateScale(15),
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
      fontSize: moderateScale(13),
      color: colors.textSecondary,
    },
    linkText: {
      fontSize: moderateScale(13),
      fontWeight: '600',
      color: colors.primary,
    },
    featuresSection: {
      paddingHorizontal: scale(20),
      paddingBottom: verticalScale(20),
      gap: 12,
    },
    feature: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.card,
      borderRadius: moderateScale(12),
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: moderateScale(14),
      gap: 12,
    },
    featureIcon: {
      marginTop: verticalScale(2),
    },
    featureTitle: {
      fontSize: moderateScale(13),
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: verticalScale(2),
    },
    featureDesc: {
      fontSize: moderateScale(12),
      color: colors.textSecondary,
      lineHeight: 18,
    },
  });

export default LoginScreen;
