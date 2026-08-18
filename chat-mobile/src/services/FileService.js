import { Platform, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import FileSystemAdapter from './FileSystemAdapter';
import { getFileKind } from '../utils/mediaUtils';
import logger from '../utils/logger';

// Concurrent downloads registry to prevent duplicate network requests
const activeDownloads = new Map();

export const FileService = {
  // Configurable size threshold for image copying (5MB default)
  IMAGE_COPY_SIZE_LIMIT: 5 * 1024 * 1024,

  /**
   * Auth headers for internal chat-file URLs (workspace-scoped).
   */
  getAuthHeaders(url = '') {
    const headers = {};
    const isInternal = !url || url.includes('/api/chat') || url.includes('/messages/files/');
    if (!isInternal) return headers;
    try {
      const { useAuthStore } = require('../stores/authStore');
      const { useWorkspaceStore } = require('../stores/workspaceStore');
      const token = useAuthStore.getState().accessToken;
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      if (token) headers.Authorization = `Bearer ${token}`;
      if (workspaceId) headers['X-Workspace-Id'] = workspaceId;
    } catch (err) {
      logger.warn('file.headers_failed', { error: err.message });
    }
    return headers;
  },

  /**
   * Helper to construct a safe cache-friendly local path
   */
  getCachePath(file) {
    const fileId = file.id || file._id || 'temp';
    const version = file.updatedAt || file.uploadedAt || '1';
    const cleanVer = String(version).replace(/[^a-zA-Z0-9]/g, '_');
    const safeName = (file.originalFileName || file.fileName || file.name || 'download').replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${FileSystemAdapter.cacheDirectory}file_cache_${fileId}_${cleanVer}_${safeName}`;
  },

  /**
   * Check if a file is already cached locally
   */
  async getCachedFile(file) {
    const localUri = this.getCachePath(file);
    const exists = await FileSystemAdapter.exists(localUri);
    return exists ? localUri : null;
  },

  /**
   * Download file to local cache with progress tracking and deduplication
   */
  async downloadFile(file, onProgress) {
    const fileId = file.id || file._id || String(Math.random());
    const cacheKey = `${fileId}_${file.updatedAt || file.uploadedAt || '1'}`;

    if (activeDownloads.has(cacheKey)) {
      logger.info('file.download.coalesced', { fileId });
      return activeDownloads.get(cacheKey);
    }

    const downloadPromise = (async () => {
      try {
        logger.info('file.download.started', { fileId, name: file.originalFileName || file.fileName });
        const localUri = this.getCachePath(file);
        const exists = await FileSystemAdapter.exists(localUri);
        if (exists) {
          logger.info('file.download.cache_hit', { fileId });
          return localUri;
        }

        const url = file.url || file.secureUrl;
        if (!url) throw new Error('No download URL available');

        const headers = this.getAuthHeaders(url);
        const result = await FileSystemAdapter.download(url, localUri, headers);
        if (!result || result.status !== 200) {
          throw new Error(`Download status ${result?.status || 'failed'}`);
        }

        logger.info('file.download.success', { fileId });
        return result.uri;
      } catch (err) {
        logger.error('file.download.failed', { fileId, error: err.message });
        throw err;
      } finally {
        activeDownloads.delete(cacheKey);
      }
    })();

    activeDownloads.set(cacheKey, downloadPromise);
    return downloadPromise;
  },

  /**
   * Platform-specific file save routine
   */
  async saveFile(file, localUri) {
    const fileId = file.id || file._id || 'temp';
    const filename = file.originalFileName || file.fileName || file.name || 'file';
    const mimeType = file.mimeType || '';
    const kind = getFileKind(mimeType, filename, file.url);

    try {
      logger.info('file.save.started', { fileId, kind });
      if (kind === 'image' || kind === 'video') {
        await FileSystemAdapter.saveToGallery(localUri);
        Toast.show({
          type: 'success',
          text1: 'Saved to Gallery',
          text2: `${filename} has been saved to your Photos.`,
        });
        logger.info('file.save.gallery_success', { fileId });
        return true;
      }

      if (Platform.OS === 'android') {
        const sharingAvailable = await FileSystemAdapter.isSharingAvailable();
        if (sharingAvailable) {
          await FileSystemAdapter.share(localUri, mimeType);
          logger.info('file.save.android_share_success', { fileId });
          return true;
        }
      }

      const sharingAvailable = await FileSystemAdapter.isSharingAvailable();
      if (sharingAvailable) {
        await FileSystemAdapter.share(localUri, mimeType);
        logger.info('file.save.ios_share_success', { fileId });
        return true;
      }

      Toast.show({
        type: 'success',
        text1: 'Download Complete',
        text2: `${filename} is downloaded locally.`,
      });
      return true;
    } catch (err) {
      logger.error('file.save.failed', { fileId, error: err.message });
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: err.message || 'Could not save file.',
      });
      return false;
    }
  },

  /**
   * Copy image to clipboard with bounds and validation checks
   */
  async copyImage(file) {
    const fileId = file.id || file._id || 'temp';
    const name = file.originalFileName || file.fileName || file.name || 'image.png';
    const size = file.fileSize || file.size || 0;

    logger.info('file.copy.started', { fileId, size });
    if (size > this.IMAGE_COPY_SIZE_LIMIT) {
      Toast.show({
        type: 'error',
        text1: 'Copy Failed',
        text2: 'This image is too large to copy.',
      });
      logger.info('file.copy.too_large', { fileId });
      return;
    }

    let localUri = null;
    try {
      localUri = await this.downloadFile(file);
      const base64 = await FileSystemAdapter.readAsBase64(localUri);
      await Clipboard.setImageAsync(base64);
      Toast.show({ type: 'success', text1: 'Image copied to clipboard' });
      logger.info('file.copy.success', { fileId });
    } catch (err) {
      logger.error('file.copy.failed', { fileId, error: err.message });
      Toast.show({
        type: 'error',
        text1: 'Copy Failed',
        text2: size > this.IMAGE_COPY_SIZE_LIMIT ? 'This image is too large to copy.' : 'Could not copy image.',
      });
    } finally {
      if (localUri) {
        FileSystemAdapter.delete(localUri).catch(() => {});
      }
    }
  },

  /**
   * Preview a file
   */
  async previewFile(file, navigation, onImagePreview) {
    const fileId = file.id || file._id || 'temp';
    const url = file.url || file.secureUrl;
    const name = file.originalFileName || file.fileName || file.name || 'file';
    const mime = file.mimeType || '';

    logger.info('file.preview.started', { fileId });
    const kind = getFileKind(mime, name, url);

    if (kind === 'image') {
      if (onImagePreview) {
        onImagePreview({ type: 'image', src: url, file });
        logger.info('file.preview.image_modal', { fileId });
      }
      return;
    }

    try {
      if (url) {
        logger.info('file.preview.downloading', { fileId });
        const localUri = await FileService.downloadFile(file);
        const sharingAvailable = await FileSystemAdapter.isSharingAvailable();
        if (sharingAvailable) {
          await FileSystemAdapter.share(localUri, mime);
          logger.info('file.preview.shared_preview', { fileId });
        } else {
          Linking.openURL(url).catch((err) => {
            logger.error('file.preview.link_error', { fileId, error: err.message });
            Toast.show({ type: 'error', text1: 'Cannot open preview' });
          });
        }
      } else {
        Toast.show({ type: 'error', text1: 'No URL available for preview' });
      }
    } catch (err) {
      logger.error('file.preview.failed', { fileId, error: err.message });
      Toast.show({ type: 'error', text1: 'Preview failed', text2: 'Unable to open file.' });
    }
  },

  /**
   * Clear cache files
   */
  async clearCache() {
    try {
      logger.info('file.cache.clear_started');
      // For legacy simplicity, clear cache directory files starting with 'file_cache_'
      // Implement if full cache cleanup policy needed.
    } catch (err) {
      logger.error('file.cache.clear_failed', { error: err.message });
    }
  }
};

export default FileService;
