import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { usersAPI } from '../../services/api';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

const EditProfileScreen = () => {
  const navigation = useNavigation();
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [title, setTitle] = useState(user?.title || '');

  const onSave = async () => {
    if (!name.trim() || !displayName.trim()) {
      Alert.alert('Validation', 'Name and Display Name cannot be empty');
      return;
    }
    const payload = { name, displayName, title };
    try {
      await usersAPI.updateUser(user.id, payload);
      updateUser(payload);
      navigation.goBack();
    } catch (err) {
      console.error('Failed to update profile', err);
      Alert.alert('Error', 'Unable to save profile. Please try again.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Edit Profile</Text>
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Enter name"
        />
      </View>
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Enter display name"
        />
      </View>
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Title (optional)</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Enter title"
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

export default EditProfileScreen;
