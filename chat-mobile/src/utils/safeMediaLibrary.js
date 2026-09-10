import logger from './logger';

let MediaLibraryModule = null;
let isAvailable = false;

try {
  const mod = require('expo-media-library');
  if (mod && (mod.requestPermissionsAsync || mod.getAssetsAsync)) {
    MediaLibraryModule = mod;
    isAvailable = true;
  }
} catch (e) {
  logger.warn('[SafeMediaLibrary] expo-media-library native module not available:', e?.message);
}

export const isMediaLibraryAvailable = () => isAvailable;

export const requestPermissionsAsync = async () => {
  if (isAvailable && MediaLibraryModule?.requestPermissionsAsync) {
    try {
      return await MediaLibraryModule.requestPermissionsAsync();
    } catch (e) {
      logger.warn('[SafeMediaLibrary] requestPermissionsAsync failed:', e?.message);
    }
  }
  return { status: 'denied', granted: false };
};

export const getAssetsAsync = async (options) => {
  if (isAvailable && MediaLibraryModule?.getAssetsAsync) {
    try {
      return await MediaLibraryModule.getAssetsAsync(options);
    } catch (e) {
      logger.warn('[SafeMediaLibrary] getAssetsAsync failed:', e?.message);
    }
  }
  return { assets: [], totalCount: 0 };
};

export const createAssetAsync = async (uri) => {
  if (isAvailable && MediaLibraryModule?.createAssetAsync) {
    try {
      return await MediaLibraryModule.createAssetAsync(uri);
    } catch (e) {
      logger.warn('[SafeMediaLibrary] createAssetAsync failed:', e?.message);
    }
  }
  return null;
};

export const getAssetInfoAsync = async (assetId) => {
  if (isAvailable && MediaLibraryModule?.getAssetInfoAsync) {
    try {
      return await MediaLibraryModule.getAssetInfoAsync(assetId);
    } catch (e) {
      logger.warn('[SafeMediaLibrary] getAssetInfoAsync failed:', e?.message);
    }
  }
  return null;
};

export const SortBy = MediaLibraryModule?.SortBy || { creationTime: 'creationTime' };

export default {
  isAvailable: isMediaLibraryAvailable,
  requestPermissionsAsync,
  getAssetsAsync,
  createAssetAsync,
  getAssetInfoAsync,
  SortBy,
};
