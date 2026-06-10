import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff, MessageCircle, CircleChevronRight, Lock, Check } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';

// Password strength calculator (colors will be mapped at render time)
function getStrength(pass) {
  if (!pass) return { pct: 0, colorKey: null, label: '' };
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/\d/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  const map = [
    { pct: 25, colorKey: 'error', label: 'Weak' },
    { pct: 50, colorKey: 'warning', label: 'Fair' },
    { pct: 75, colorKey: 'primary', label: 'Good' },
    { pct: 100, colorKey: 'success', label: 'Strong' },
  ];
  return map[Math.min(score - 1, 3)] ?? map[0];
}

const RegisterScreen = ({ navigation }) => {
  const { register, isLoading, error, clearError } = useAuthStore();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);

  const updateField = (field, value) => {
    let newValue = value;
    if (field === 'name') newValue = value.replace(/\s{2,}/g, ' ');
    if (field === 'email') newValue = value.replace(/\s/g, '').toLowerCase();
    if (field === 'password' || field === 'confirmPassword') newValue = value.replace(/\s/g, '');
    setForm((f) => ({ ...f, [field]: newValue }));
    if (error) clearError();
  };

  const passwordChecks = [
    { label: 'At least 8 characters', ok: form.password.length >= 8 },
    { label: 'Contains uppercase', ok: /[A-Z]/.test(form.password) },
    { label: 'Contains lowercase', ok: /[a-z]/.test(form.password) },
    { label: 'Contains number', ok: /\d/.test(form.password) },
    {
      label: 'Passwords match',
      ok:
        !!form.password &&
        !!form.confirmPassword &&
        form.password === form.confirmPassword,
    },
  ];
  const allChecks = passwordChecks.every((c) => c.ok);
  const strength = getStrength(form.password);

  const handleSubmit = async () => {
    if (error) clearError();
    if (!form.name.trim() || !form.email.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Please fill in all fields',
      });
      return;
    }
    if (!allChecks) {
      Toast.show({
        type: 'error',
        text1: 'Please fix password requirements',
      });
      return;
    }

    try {
      await register({
        name: form.name,
        email: form.email.toLowerCase(),
        password: form.password,
      });
      setSuccess(true);
      Toast.show({
        type: 'success',
        text1: 'Account created!',
        text2: 'Check your email for verification',
      });
    } catch {
      // Error handled by store
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}> 
        <View style={[styles.header, { borderBottomColor: colors.borderLight }]}> 
          <View style={styles.logo}>
            <Image source={require('../../../assets/logo.png')} style={styles.logoIcon} />
            <Text style={[styles.logoText, { color: colors.textPrimary }]}>FlowTask-Chat</Text>
          </View>
        </View>
        
        <View style={styles.successContainer}>
          <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={[styles.successIcon, { backgroundColor: colors.success }]}>
              <Check size={32} color={colors.messageTextSent} strokeWidth={3} />
            </View>
            <Text style={[styles.successHeading, { color: colors.textPrimary }]}>Account created!</Text>
            <Text style={[styles.successText, { color: colors.textSecondary }]}> 
              We've sent a verification email to {' '}
              <Text style={[styles.successEmail, { color: colors.primary }]}>{form.email}.</Text>
              Please verify your email to sign in.
            </Text>
            <TouchableOpacity
              style={[styles.successButton, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.85}
            >
              <Text style={[styles.successButtonText, { color: colors.messageTextSent }]}>Go to Sign In</Text>
              <CircleChevronRight size={16} color={colors.messageTextSent} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}> 
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={[styles.header, { borderBottomColor: colors.borderLight }]}> 
            <View style={styles.logo}>
              <Image source={require('../../../assets/logo.png')} style={styles.logoIcon} />
              <Text style={[styles.logoText, { color: colors.textPrimary }]}>FlowTask-Chat</Text>
            </View>
          </View>

          <View style={styles.introSection}>
            <Text style={styles.heading}>Create your account</Text>
            <Text style={styles.subheading}>
              Join teams already using FlowTask-Chat to communicate faster
            </Text>
          </View>

          <View style={styles.card}>
            {!!error && (
              <View style={[styles.errorBox, { backgroundColor: `${colors.error}14`, borderColor: `${colors.error}33` }]}>
                <Lock size={14} color={colors.error} style={{ marginRight: 8 }} />
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Full Name</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
                    placeholder="John Doe"
                    placeholderTextColor={colors.inputPlaceholder}
                    value={form.name}
                    onChangeText={(text) => updateField('name', text)}
                    maxLength={30}
                  />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
                    placeholder="you@company.com"
                    placeholderTextColor={colors.inputPlaceholder}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={form.email}
                    onChangeText={(text) => updateField('email', text)}
                  />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrapper}>
                  <TextInput
                    style={[styles.passwordInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
                    placeholder="Create a strong password"
                    placeholderTextColor={colors.inputPlaceholder}
                    secureTextEntry={!showPassword}
                    value={form.password}
                    onChangeText={(text) => updateField('password', text)}
                  />
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} color={colors.textTertiary} /> : <Eye size={18} color={colors.textTertiary} />}
                </TouchableOpacity>
              </View>

              {form.password ? (
                <View style={[styles.strengthBar, { backgroundColor: colors.border }]}> 
                  <View style={[styles.strengthFill, { width: `${strength.pct}%`, backgroundColor: colors[strength.colorKey] || colors.primary }]} />
                </View>
              ) : null}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordWrapper}>
                  <TextInput
                    style={[
                      styles.passwordInput,
                      form.confirmPassword &&
                        form.confirmPassword !== form.password &&
                        styles.inputError,
                      { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }
                    ]}
                    placeholder="Confirm password"
                    placeholderTextColor={colors.inputPlaceholder}
                    secureTextEntry={!showConfirm}
                    value={form.confirmPassword}
                    onChangeText={(text) => updateField('confirmPassword', text)}
                  />
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirm(!showConfirm)}>
                  {showConfirm ? <EyeOff size={18} color={colors.textTertiary} /> : <Eye size={18} color={colors.textTertiary} />}
                </TouchableOpacity>
              </View>
            </View>

            {form.password ? (
              <View style={styles.checksContainer}>
                {passwordChecks.map(({ label, ok }) => (
                  <View key={label} style={[styles.checkItem, ok && styles.checkItemOk]}>
                    <View style={[styles.checkCircle, ok && { backgroundColor: colors.success }]}>
                      {ok && <Check size={10} color={colors.messageTextSent} strokeWidth={3} />}
                    </View>
                    <Text style={[styles.checkLabel, ok && { color: colors.primary }]}>{label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.submitButton, (isLoading || !allChecks) && styles.submitButtonDisabled, { backgroundColor: colors.primary }]}
              onPress={handleSubmit}
              disabled={isLoading || !allChecks}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.messageTextSent} />
              ) : (
                <>
                  <Text style={[styles.submitButtonText, { color: colors.messageTextSent }]}>Create account</Text>
                  <CircleChevronRight size={16} color={colors.messageTextSent} />
                </>
              )}
            </TouchableOpacity>

            <View style={styles.footerLink}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.linkText}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { flexGrow: 1 },
    header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
    logo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logoIcon: { width: 32, height: 32, borderRadius: 8 },
    logoText: { fontSize: 15, fontWeight: '700', letterSpacing: -0.5 },
    introSection: { paddingHorizontal: 20, paddingVertical: 24 },
    heading: { fontSize: 28, fontWeight: '800', marginBottom: 8, letterSpacing: -0.6, color: colors.textPrimary },
    subheading: { fontSize: 14, lineHeight: 22, color: colors.textSecondary },
    card: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 20, backgroundColor: colors.card },
    errorBox: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    errorText: { fontSize: 13, lineHeight: 20, flex: 1 },
    formGroup: { marginBottom: 16 },
    label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, color: colors.textTertiary },
    input: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText },
    passwordWrapper: { position: 'relative' },
    passwordInput: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, paddingRight: 44, fontSize: 15, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText },
    inputError: { borderColor: `${colors.error}33` },
    eyeButton: { position: 'absolute', right: 12, top: '50%', transform: [{ translateY: -9 }], padding: 8 },
    strengthBar: { height: 3, borderRadius: 3, overflow: 'hidden', marginTop: 8, backgroundColor: colors.border },
    strengthFill: { height: '100%', borderRadius: 3 },
    checksContainer: { borderRadius: 10, padding: 12, marginVertical: 12, gap: 8, backgroundColor: `${colors.primary}08` },
    checkItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkItemOk: { opacity: 1 },
    checkCircle: { width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.border },
    checkLabel: { fontSize: 12, fontWeight: '500', color: colors.textTertiary },
    submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 11, marginBottom: 12, backgroundColor: colors.primary },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3, color: colors.messageTextSent },
    footerLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    footerText: { fontSize: 13, color: colors.textSecondary },
    linkText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
    successCard: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border },
    successIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 20, backgroundColor: colors.success },
    successHeading: { fontSize: 20, fontWeight: '800', marginBottom: 8, letterSpacing: -0.5, color: colors.textPrimary },
    successText: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 8, color: colors.textSecondary },
    successEmail: { fontWeight: '600', color: colors.primary },
    successButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10, marginTop: 20, backgroundColor: colors.primary },
    successButtonText: { fontSize: 14, fontWeight: '700', letterSpacing: -0.3, color: colors.messageTextSent },
  });

export default RegisterScreen;