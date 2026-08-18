import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import logger from '../utils/logger';

const CLIPBOARD_STORE_KEY = '@flowtask_file_clipboard';
const EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes

const generateId = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

export const FileClipboardService = {
  /**
   * Copies a file reference to the system clipboard securely.
   * Only stores the random ID in the clipboard.
   * The actual metadata is stored locally.
   */
  async copyFile(file) {
    try {
      const auth = useAuthStore.getState();
      const workspace = useWorkspaceStore.getState();
      
      const userId = auth.user?._id || auth.user?.id;
      const workspaceId = workspace.activeWorkspaceId;

      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Generate a temporary ID
      const tempId = generateId();

      // Create record
      const record = {
        id: tempId,
        file: file,
        userId,
        workspaceId,
        createdAt: Date.now(),
        expiresAt: Date.now() + EXPIRATION_MS,
      };

      // Get existing store to allow multiple files (though we mainly care about the latest)
      let store = {};
      try {
        const storedStr = await AsyncStorage.getItem(CLIPBOARD_STORE_KEY);
        if (storedStr) {
          store = JSON.parse(storedStr);
        }
      } catch (e) {
        logger.warn('Failed to parse existing clipboard store', e);
      }

      // Cleanup expired records
      const now = Date.now();
      Object.keys(store).forEach(key => {
        if (store[key].expiresAt < now) {
          delete store[key];
        }
      });

      // Save new record
      store[tempId] = record;
      await AsyncStorage.setItem(CLIPBOARD_STORE_KEY, JSON.stringify(store));

      // Put marker in system clipboard
      const marker = `[flowtask-file:${tempId}]`;
      await Clipboard.setStringAsync(marker);

      logger.info('File copied to internal clipboard', { tempId, fileId: file._id || file.id });
      return true;
    } catch (error) {
      logger.error('FileClipboardService.copyFile failed:', error);
      return false;
    }
  },

  /**
   * Checks if a string contains a valid flowtask-file marker.
   * If valid, resolves the file metadata from local storage.
   */
  async resolveMarker(text) {
    if (!text || typeof text !== 'string') return null;

    const match = text.match(/\[flowtask-file:([a-zA-Z0-9]+)\]/);
    if (!match || !match[1]) return null;

    const tempId = match[1];

    try {
      const storedStr = await AsyncStorage.getItem(CLIPBOARD_STORE_KEY);
      if (!storedStr) return null;

      const store = JSON.parse(storedStr);
      const record = store[tempId];

      if (!record) {
        logger.info('Clipboard marker resolved, but record not found locally (maybe cleared)');
        return null;
      }

      const now = Date.now();
      if (now > record.expiresAt) {
        logger.info('Clipboard record expired');
        return null;
      }

      // Validate security context
      const auth = useAuthStore.getState();
      const workspace = useWorkspaceStore.getState();
      
      const currentUserId = auth.user?._id || auth.user?.id;
      const currentWorkspaceId = workspace.activeWorkspaceId;

      if (record.userId !== currentUserId) {
        logger.warn('Security check failed: Paste attempted across different user accounts.');
        return null;
      }

      // Optional: Prevent pasting across workspaces, if required. Usually it's fine if the file is public, 
      // but since proxy URLs depend on workspace tokens, it's safer to enforce.
      if (record.workspaceId !== currentWorkspaceId) {
        logger.warn('Security check failed: Paste attempted across different workspaces.');
        return null;
      }

      return record.file;
    } catch (error) {
      logger.error('FileClipboardService.resolveMarker failed:', error);
      return null;
    }
  },

  /**
   * Clears the internal clipboard store
   */
  async clear() {
    try {
      await AsyncStorage.removeItem(CLIPBOARD_STORE_KEY);
      logger.info('Internal clipboard cleared');
    } catch (error) {
      logger.error('FileClipboardService.clear failed:', error);
    }
  }
};

export default FileClipboardService;
