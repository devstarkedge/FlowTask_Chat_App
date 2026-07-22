import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import ScreenLayout from '../../components/common/ScreenLayout';
import { ArrowLeft, CircleChevronRight, Mail } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { authAPI } from '../../services/api';
import { useThemeStore } from '../../stores/themeStore';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

const ForgotPasswordScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Please enter your email address',
      });
      return;
    }

    setIsLoading(true);
    try {
      await authAPI.forgotPassword(email.trim().toLowerCase());
      setSuccess(true);
      Toast.show({
        type: 'success',
        text1: 'Reset link sent!',
        text2: 'Please check your email inbox',
      });
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to send reset link';
      Toast.show({
        type: 'error',
        text1: msg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenLayout style={styles.container}>
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.logo}>
          <Image source={require('../../../assets/logo.png')} style={styles.logoIcon} />
          <Text style={[styles.logoText, { color: colors.textPrimary }]}>FlowTask-Chat</Text>
        </View>
      </View>

      {success ? (
        <View style={styles.successContainer}>
          <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.successIcon, { backgroundColor: colors.success }]}>
              <Mail size={32} color={colors.messageTextSent} strokeWidth={2} />
            </View>
            <Text style={[styles.successHeading, { color: colors.textPrimary }]}>Check your email</Text>
            <Text style={[styles.successText, { color: colors.textSecondary }]}>
              We have sent password reset instructions to{' '}
              <Text style={styles.boldEmail}>{email}</Text>.
            </Text>
            <TouchableOpacity
              style={[styles.successButton, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.85}
            >
              <Text style={[styles.successButtonText, { color: colors.messageTextSent }]}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.formContainer}>
          <View style={styles.introSection}>
            <Text style={styles.heading}>Reset Password</Text>
            <Text style={[styles.subheading, { color: colors.textSecondary }]}>
              Enter your email address and we'll send you a link to reset your password.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
                placeholder="you@company.com"
                placeholderTextColor={colors.inputPlaceholder}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={(text) => setEmail(text.replace(/\s/g, '').toLowerCase())}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled, { backgroundColor: colors.primary }]}
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.messageTextSent} />
              ) : (
                <>
                  <Text style={[styles.submitButtonText, { color: colors.messageTextSent }]}>Send Reset Link</Text>
                  <CircleChevronRight size={16} color={colors.messageTextSent} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScreenLayout>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    backBtn: {
      marginRight: scale(12),
      justifyContent: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(16),
      borderBottomWidth: 1,
    },
    logo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    logoIcon: {
      width: scale(32),
      height: verticalScale(32),
      borderRadius: moderateScale(8),
    },
    logoText: {
      fontSize: moderateScale(15),
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    introSection: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(24),
    },
    heading: {
      fontSize: moderateScale(28),
      fontWeight: '800',
      marginBottom: verticalScale(8),
      letterSpacing: -0.6,
      color: colors.textPrimary,
    },
    subheading: {
      fontSize: moderateScale(14),
      lineHeight: 22,
    },
    card: {
      marginHorizontal: scale(20),
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderColor: colors.border,
      padding: moderateScale(20),
      backgroundColor: colors.card,
    },
    formGroup: {
      marginBottom: verticalScale(20),
    },
    label: {
      fontSize: moderateScale(11),
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: verticalScale(6),
      color: colors.textTertiary,
    },
    input: {
      borderWidth: 1,
      borderRadius: moderateScale(10),
      paddingVertical: verticalScale(12),
      paddingHorizontal: scale(14),
      fontSize: moderateScale(15),
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: verticalScale(14),
      paddingHorizontal: scale(18),
      borderRadius: moderateScale(11),
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: moderateScale(15),
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    successContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: scale(20),
    },
    successCard: {
      borderRadius: moderateScale(16),
      borderWidth: 1,
      padding: moderateScale(32),
      alignItems: 'center',
    },
    successIcon: {
      width: scale(64),
      height: verticalScale(64),
      borderRadius: moderateScale(32),
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: verticalScale(20),
    },
    successHeading: {
      fontSize: moderateScale(20),
      fontWeight: '800',
      marginBottom: verticalScale(8),
      letterSpacing: -0.5,
    },
    successText: {
      fontSize: moderateScale(13),
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: verticalScale(8),
    },
    boldEmail: {
      fontWeight: '700',
    },
    successButton: {
      paddingVertical: verticalScale(12),
      paddingHorizontal: scale(28),
      borderRadius: moderateScale(10),
      marginTop: verticalScale(20),
    },
    successButtonText: {
      fontSize: moderateScale(14),
      fontWeight: '700',
      letterSpacing: -0.3,
    },
  });

export default ForgotPasswordScreen;
