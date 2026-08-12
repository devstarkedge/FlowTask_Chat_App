import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import logger from './logger';

/**
 * Determines if a file is an image or video based on MIME type or extension.
 */
function isMediaFile(mime = '', filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/')) return true;
  return /^(jpg|jpeg|png|gif|webp|bmp|heic|heif|mp4|mov|avi|mkv|webm|m4v|3gp)$/.test(ext);
}

/**
 * Downloads a file from a URL and saves it directly to the device's public Gallery
 * (for photos/videos) or Downloads folder (for documents/files).
 *
 * @param {string} url - Public or authenticated URL of the file
 * @param {string} filename - Original name of the file
 * @param {string} mimeType - Optional MIME type
 */
export async function downloadAndSaveFile(url, filename = 'download', mimeType = '') {
  if (!url) {
    Toast.show({
      type: 'error',
      text1: 'Download Error',
      text2: 'No valid file URL provided.',
    });
    return false;
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tempUri = `${FileSystem.cacheDirectory}${Date.now()}_${safeFilename}`;
  const isMedia = isMediaFile(mimeType, safeFilename);

  try {
    Toast.show({
      type: 'info',
      text1: 'Downloading...',
      text2: `Preparing ${safeFilename}`,
    });

    // 1. Download to temporary cache
    const headers = {};
    const isInternalUrl = url && (url.includes('/api/chat') || url.includes('/messages/files/'));
    if (isInternalUrl) {
      try {
        const { useAuthStore } = require('../stores/authStore');
        const { useWorkspaceStore } = require('../stores/workspaceStore');
        const token = useAuthStore.getState().accessToken;
        const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (workspaceId) headers['X-Workspace-Id'] = workspaceId;
      } catch (err) {
        logger.warn('[FileDownload] Could not fetch auth headers:', err);
      }
    }

    const downloadRes = await FileSystem.downloadAsync(url, tempUri, { headers });
    if (!downloadRes || downloadRes.status !== 200) {
      throw new Error(`Download failed with status ${downloadRes?.status || 'unknown'}`);
    }

    const downloadedUri = downloadRes.uri;

    // 2. Handle Media Files (Images / Videos) -> Save directly to Photo Gallery
    if (isMedia) {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (permission.granted) {
        await MediaLibrary.createAssetAsync(downloadedUri);
        Toast.show({
          type: 'success',
          text1: 'Saved to Gallery',
          text2: `${safeFilename} has been saved to your Photos.`,
        });
        return true;
      }
    }

    // 3. Handle Documents / Files -> Save to Downloads or Files app
    if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const content = await FileSystem.readAsStringAsync(downloadedUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const createdUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            safeFilename,
            mimeType || 'application/octet-stream'
          );
          await FileSystem.writeAsStringAsync(createdUri, content, {
            encoding: FileSystem.EncodingType.Base64,
          });
          Toast.show({
            type: 'success',
            text1: 'Download Complete',
            text2: `${safeFilename} saved to Downloads folder.`,
          });
          return true;
        }
      } catch (safErr) {
        logger.warn('[FileDownload] StorageAccessFramework fallback:', safErr);
      }
    }

    // 4. Fallback on iOS / Android when directory permission isn't granted: Native Share / Save Sheet
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(downloadedUri, {
        mimeType: mimeType || 'application/octet-stream',
        dialogTitle: `Save ${safeFilename}`,
        UTI: isMedia ? undefined : 'public.data',
      });
      Toast.show({
        type: 'success',
        text1: 'File Ready',
        text2: `${safeFilename} ready to save.`,
      });
      return true;
    }

    Toast.show({
      type: 'success',
      text1: 'Downloaded',
      text2: `${safeFilename} downloaded successfully.`,
    });
    return true;

  } catch (err) {
    logger.error('[FileDownload] Error downloading file:', err);
    Toast.show({
      type: 'error',
      text1: 'Download Failed',
      text2: err.message || 'Could not download file.',
    });
    return false;
  }
}
