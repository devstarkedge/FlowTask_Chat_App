/**
 * Secure storage wrapper: uses expo-secure-store on native, falls back to
 * AsyncStorage on web (where SecureStore is unavailable).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

let SecureStore = null;
if (Platform.OS !== 'web') {
  try {
    SecureStore = require('expo-secure-store');
  } catch (_) {
    // SecureStore not available — fall through to AsyncStorage
  }
}

const isNative = Platform.OS !== 'web' && SecureStore != null;

const OPTIONS = {
  keychainAccessible: SecureStore?.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureSet = async (key, value) => {
  if (isNative) {
    await SecureStore.setItemAsync(key, value, OPTIONS);
  } else {
    await AsyncStorage.setItem(key, value);
  }
};

export const secureGet = async (key) => {
  if (isNative) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
};

export const secureDelete = async (key) => {
  if (isNative) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
};

export const secureMultiRemove = async (keys) => {
  await Promise.all(keys.map(secureDelete));
};
