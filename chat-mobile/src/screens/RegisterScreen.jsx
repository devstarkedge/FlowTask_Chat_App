import React, { useState } from 'react';
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
} from 'react-native';
import { Eye, EyeOff, MessageCircle, ArrowRight, Lock, Check } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../stores/authStore';

// Password strength calculator
function getStrength(pass) {
  if (!pass) return { pct: 0, color: '#e5e7eb', label: '' };
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/\d/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  const map = [
    { pct: 25, color: '#ef4444', label: 'Weak' },
    { pct: 50, color: '#f59e0b', label: 'Fair' },
    { pct: 75, color: '#3b82f6', label: 'Good' },
    { pct: 100, color: '#10b981', label: 'Strong' },
  ];
  return map[Math.min(score - 1, 3)] ?? map[0];
}

const RegisterScreen = ({ navigation }) => {
  const { register, isLoading, error, clearError } = useAuthStore();

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
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <View style={styles.logoIcon}>
              <MessageCircle size={20} color="white" />
            </View>
            <Text style={styles.logoText}>FlowTask Chat</Text>
          </View>
        </View>

        <View style={styles.successContainer}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Check size={32} color="white" strokeWidth={3} />
            </View>
            <Text style={styles.successHeading}>Account created!</Text>
            <Text style={styles.successText}>
              We've sent a verification email to {' '}
              <Text style={styles.successEmail}>{form.email}.</Text>
              Please verify your email to sign in.
            </Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.85}
            >
              <Text style={styles.successButtonText}>Go to Sign In</Text>
              <ArrowRight size={16} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

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
          <View style={styles.header}>
            <View style={styles.logo}>
              <View style={styles.logoIcon}>
                <MessageCircle size={20} color="white" />
              </View>
              <Text style={styles.logoText}>FlowTask Chat</Text>
            </View>
          </View>

          <View style={styles.introSection}>
            <Text style={styles.heading}>Create your account</Text>
            <Text style={styles.subheading}>
              Join teams already using FlowTask Chat to communicate faster
            </Text>
          </View>

          <View style={styles.card}>
            {!!error && (
              <View style={styles.errorBox}>
                <Lock size={14} color="#dc2626" style={{ marginRight: 8 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                placeholderTextColor="#d1d5db"
                value={form.name}
                onChangeText={(text) => updateField('name', text)}
                maxLength={30}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="you@company.com"
                placeholderTextColor="#d1d5db"
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
                  style={styles.passwordInput}
                  placeholder="Create a strong password"
                  placeholderTextColor="#d1d5db"
                  secureTextEntry={!showPassword}
                  value={form.password}
                  onChangeText={(text) => updateField('password', text)}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} color="#9ca3af" /> : <Eye size={18} color="#9ca3af" />}
                </TouchableOpacity>
              </View>

              {form.password ? (
                <View style={styles.strengthBar}>
                  <View
                    style={[
                      styles.strengthFill,
                      {
                        width: `${strength.pct}%`,
                        backgroundColor: strength.color,
                      },
                    ]}
                  />
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
                  ]}
                  placeholder="Confirm password"
                  placeholderTextColor="#d1d5db"
                  secureTextEntry={!showConfirm}
                  value={form.confirmPassword}
                  onChangeText={(text) => updateField('confirmPassword', text)}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowConfirm(!showConfirm)}
                >
                  {showConfirm ? <EyeOff size={18} color="#9ca3af" /> : <Eye size={18} color="#9ca3af" />}
                </TouchableOpacity>
              </View>
            </View>

            {form.password ? (
              <View style={styles.checksContainer}>
                {passwordChecks.map(({ label, ok }) => (
                  <View key={label} style={[styles.checkItem, ok && styles.checkItemOk]}>
                    <View style={[styles.checkCircle, ok && styles.checkCircleOk]}>
                      {ok && <Check size={10} color="white" strokeWidth={3} />}
                    </View>
                    <Text style={[styles.checkLabel, ok && styles.checkLabelOk]}>{label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.submitButton, (isLoading || !allChecks) && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading || !allChecks}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Create account</Text>
                  <ArrowRight size={16} color="white" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f7f4',
  },
  scrollContent: {
    flexGrow: 1,
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
  inputError: {
    borderColor: 'rgba(220, 38, 38, 0.4)',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -9 }],
    padding: 8,
  },
  strengthBar: {
    height: 3,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  strengthFill: {
    height: '100%',
    borderRadius: 3,
  },
  checksContainer: {
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    borderRadius: 10,
    padding: 12,
    marginVertical: 12,
    gap: 8,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkItemOk: {
    opacity: 1,
  },
  checkCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircleOk: {
    backgroundColor: '#10b981',
  },
  checkLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#a1a1aa',
  },
  checkLabelOk: {
    color: '#059669',
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
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  successCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    padding: 32,
    alignItems: 'center',
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  successText: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  successEmail: {
    color: '#6366f1',
    fontWeight: '600',
  },
  successButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: '#6366f1',
    marginTop: 20,
  },
  successButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
    letterSpacing: -0.3,
  },
});

export default RegisterScreen;