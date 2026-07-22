import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { usersAPI } from '../../services/api';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
const phoneRegex = /^[0-9]{7,15}$/;

const EditContactScreen = () => {
  const navigation = useNavigation();
  const { user, updateUser } = useAuthStore();
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');

  const onSave = async () => {
    if (!emailRegex.test(email)) {
      Alert.alert('Validation', 'Please enter a valid email address');
      return;
    }
    if (phone && !phoneRegex.test(phone)) {
      Alert.alert('Validation', 'Phone number should contain only digits (7-15 characters)');
      return;
    }
    const payload = { email, phone };
    try {
      await usersAPI.updateUser(user.id, payload);
      updateUser(payload);
      navigation.goBack();
    } catch (err) {
      console.error('Failed to update contact', err);
      Alert.alert('Error', 'Unable to save contact information. Please try again.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Edit Contact Information</Text>
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Enter email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Phone (optional)</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="Enter phone number"
          keyboardType="phone-pad"
        />
      </View>
      <TouchableOpacity style={styles.saveButton} onPress={onSave}>
        <Text style={styles.saveButtonText}>Save</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: scale(20),
    backgroundColor: '#fff',
  },
  header: {
    fontSize: moderateScale(24),
    fontWeight: 'bold',
    marginBottom: verticalScale(20),
    color: '#333',
  },
  fieldContainer: {
    marginBottom: verticalScale(15),
  },
  label: {
    fontSize: moderateScale(14),
    color: '#555',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: scale(10),
    fontSize: moderateScale(16),
    color: '#000',
  },
  saveButton: {
    backgroundColor: '#4A90E2',
    paddingVertical: verticalScale(12),
    borderRadius: 8,
    alignItems: 'center',
    marginTop: verticalScale(20),
  },
  saveButtonText: {
    color: '#fff',
    fontSize: moderateScale(16),
    fontWeight: '600',
  },
});

export default EditContactScreen;
