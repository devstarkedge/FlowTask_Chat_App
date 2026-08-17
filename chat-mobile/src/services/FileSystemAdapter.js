import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

export const FileSystemAdapter = {
  cacheDirectory: FileSystem.cacheDirectory,

  async exists(path) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      return info.exists;
    } catch {
      return false;
    }
  },

  async download(url, dest, headers = {}) {
    return await FileSystem.downloadAsync(url, dest, { headers });
  },

  async readAsBase64(path) {
    return await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    });
  },

  async delete(path) {
    return await FileSystem.deleteAsync(path, { idempotent: true });
  },

  async saveToGallery(path) {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (permission.granted) {
        return await MediaLibrary.createAssetAsync(path);
      }
    } catch (err) {
      // Permission request rejected or platform configuration issue
    }

    // Fallback: Use native Share sheet which lets users save files/images directly
    if (await Sharing.isAvailableAsync()) {
      return await Sharing.shareAsync(path);
    }
    throw new Error('Allow photo access to save this image.');
  },

  async isSharingAvailable() {
    return await Sharing.isAvailableAsync();
  },

  async share(path, mimeType) {
    return await Sharing.shareAsync(path, {
      mimeType: mimeType || 'application/octet-stream',
      UTI: mimeType?.startsWith('image/') || mimeType?.startsWith('video/') ? undefined : 'public.data',
    });
  }
};
export default FileSystemAdapter;
