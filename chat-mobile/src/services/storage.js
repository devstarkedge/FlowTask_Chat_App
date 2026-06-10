import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureGet, secureSet, secureDelete, secureMultiRemove } from '../utils/secureStorage';

const storage = {
  // AsyncStorage thin wrappers
  getItem: AsyncStorage.getItem,
  setItem: AsyncStorage.setItem,
  removeItem: AsyncStorage.removeItem,
  multiRemove: AsyncStorage.multiRemove,

  // JSON helpers
  async getJson(key) {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  },
  async setJson(key, value) {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  // Secure helpers (expo-secure-store fallback)
  secureGet,
  secureSet,
  secureDelete,
  secureMultiRemove,
};

export default storage;
