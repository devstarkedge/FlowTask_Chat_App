import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenLayout from '../../components/common/ScreenLayout';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { usersAPI } from '../../services/api';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import { ArrowLeft, Mail, Phone } from 'lucide-react-native';

const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
const phoneRegex = /^[0-9]{7,15}$/;

const EditContactScreen = () => {
  const navigation = useNavigation();
  const { user, updateUser } = useAuthStore();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isLoading, setIsLoading] = useState(false);

  const onSave = async () => {
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Validation', 'Please enter a valid email address');
      return;
    }
    if (phone.trim() && !phoneRegex.test(phone.trim())) {
      Alert.alert('Validation', 'Phone number should contain only digits (7-15 characters)');
      return;
    }
    setIsLoading(true);
    const payload = { email: email.trim().toLowerCase(), phone: phone.trim() };
    try {
      const userId = user?.id || user?._id;
      if (!userId) {
        throw new Error('User identifier not found');
      }
      await usersAPI.updateUser(userId, payload);
      updateUser(payload);
      navigation.goBack();
    } catch (err) {
      console.error('Failed to update contact', err);
      Alert.alert('Error', 'Unable to save contact information. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenLayout style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Edit Contact Info</Text>
        <View style={{ width: scale(22) }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Form fields card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          
          <View style={styles.fieldContainer}>
            <View style={styles.labelRow}>
              <Mail size={16} color={colors.textSecondary} style={styles.fieldIcon} />
              <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter email"
              placeholderTextColor={colors.inputPlaceholder}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.fieldContainer}>
            <View style={styles.labelRow}>
              <Phone size={16} color={colors.textSecondary} style={styles.fieldIcon} />
              <Text style={[styles.label, { color: colors.textSecondary }]}>Phone (optional)</Text>
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter phone number"
              placeholderTextColor={colors.inputPlaceholder}
              keyboardType="phone-pad"
              maxLength={15}
            />
          </View>

          <TouchableOpacity 
            style={[styles.saveButton, isLoading && styles.saveButtonDisabled, { backgroundColor: colors.primary }]} 
            onPress={onSave}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.messageTextSent} />
            ) : (
              <Text style={[styles.saveButtonText, { color: colors.messageTextSent }]}>Save Changes</Text>
            )}
          </TouchableOpacity>

        </View>
      </ScrollView>
    </ScreenLayout>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(14),
      borderBottomWidth: 1,
    },
    backBtn: {
      padding: moderateScale(4),
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: moderateScale(18),
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    scrollContent: {
      flexGrow: 1,
      padding: scale(20),
    },
    card: {
      borderRadius: moderateScale(16),
      borderWidth: 1,
      padding: moderateScale(20),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    fieldContainer: {
      marginBottom: verticalScale(20),
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: verticalScale(6),
    },
    fieldIcon: {
      marginRight: scale(6),
    },
    label: {
      fontSize: moderateScale(12),
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      borderWidth: 1,
      borderRadius: moderateScale(10),
      paddingVertical: verticalScale(12),
      paddingHorizontal: scale(14),
      fontSize: moderateScale(15),
    },
    saveButton: {
      paddingVertical: verticalScale(14),
      borderRadius: moderateScale(11),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: verticalScale(10),
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      fontSize: moderateScale(15),
      fontWeight: '700',
      letterSpacing: -0.3,
    },
  });

export default EditContactScreen;
