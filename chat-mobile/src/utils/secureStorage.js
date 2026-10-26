/**
 * Native credentials must use secure storage. AsyncStorage is web-only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

let SecureStore = null;
if (Platform.OS !== 'web') {
  try {
    SecureStore = require('expo-secure-store');
  } catch (_) {
    // Native operations below fail closed rather than storing tokens in plaintext.
  }
}

const isNative = Platform.OS !== 'web';
function nativeStorage() {
  if (!SecureStore?.setItemAsync || !SecureStore?.getItemAsync || !SecureStore?.deleteItemAsync) {
    throw new Error('Secure storage is unavailable. Reinstall a supported TaskChat build.');
  }
  return SecureStore;
}

const OPTIONS = {
  keychainAccessible: SecureStore?.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureSet = async (key, value) => {
  if (isNative) {
    const storage = nativeStorage();
    await storage.setItemAsync(key, value, OPTIONS);
    await AsyncStorage.removeItem(key);
  } else {
    await AsyncStorage.setItem(key, value);
  }
};

export const secureGet = async (key) => {
  if (isNative) {
    const storage = nativeStorage();
    await AsyncStorage.removeItem(key);
    return storage.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
};

export const secureDelete = async (key) => {
  if (isNative) {
    const storage = nativeStorage();
    await Promise.all([storage.deleteItemAsync(key), AsyncStorage.removeItem(key)]);
  } else {
    await AsyncStorage.removeItem(key);
  }
};

export const secureMultiRemove = async (keys) => {
  await Promise.all(keys.map(secureDelete));
};
