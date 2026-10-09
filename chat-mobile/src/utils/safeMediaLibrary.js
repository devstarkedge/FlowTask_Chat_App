import logger from './logger';

let MediaLibraryModule = null;
let isAvailable = false;

try {
  // SDK 57's root exports for these function-based asset APIs throw.
  // Keep the existing adapter contract using Expo's supported legacy entrypoint.
  const mod = require('expo-media-library/legacy');
  if (mod && (mod.requestPermissionsAsync || mod.getAssetsAsync)) {
    MediaLibraryModule = mod;
    isAvailable = true;
  }
} catch (e) {
  logger.warn('[SafeMediaLibrary] expo-media-library native module not available:', e?.message);
}

export const isMediaLibraryAvailable = () => isAvailable;
export const getPermissionsAsync = async (writeOnly = false, granularPermissions = ['photo', 'video']) => {
  try { return await MediaLibraryModule?.getPermissionsAsync?.(writeOnly, granularPermissions) || { status: 'undetermined', granted: false }; }
  catch { return { status: 'undetermined', granted: false }; }
};

export const requestPermissionsAsync = async (writeOnly = false, granularPermissions = ['photo', 'video']) => {
  if (isAvailable && MediaLibraryModule?.requestPermissionsAsync) {
    try {
      return await MediaLibraryModule.requestPermissionsAsync(writeOnly, granularPermissions);
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

// Add-only gallery writes must not depend on read access or return a library
// asset. Propagate failures so callers cannot report an unsuccessful save.
export const saveToLibraryAsync = async (uri) => {
  if (!MediaLibraryModule?.saveToLibraryAsync) throw new Error('Saving to the photo library is unavailable.');
  return MediaLibraryModule.saveToLibraryAsync(uri);
};

export const getAssetInfoAsync = async (assetId, options) => {
  if (isAvailable && MediaLibraryModule?.getAssetInfoAsync) {
    try {
      return await MediaLibraryModule.getAssetInfoAsync(assetId, options);
    } catch (e) {
      logger.warn('[SafeMediaLibrary] getAssetInfoAsync failed:', e?.message);
    }
  }
  return null;
};

export const SortBy = MediaLibraryModule?.SortBy || { creationTime: 'creationTime' };

export default {
  getPermissionsAsync,
  isAvailable: isMediaLibraryAvailable,
  requestPermissionsAsync,
  getAssetsAsync,
  createAssetAsync,
  saveToLibraryAsync,
  getAssetInfoAsync,
  SortBy,
};
