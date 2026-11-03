import { create } from 'zustand';
import {
  checkForUpdates,
  startDownloadUpdate,
  quitAndInstallUpdate,
  getUpdateStatus,
  onUpdateStatusChange,
  getAppVersion,
  isDesktopApp,
} from '../services/desktopService';

export const useUpdateStore = create((set, get) => ({
  status: 'idle', // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  info: null,     // { version, releaseNotes, releaseDate }
  progress: null, // { percent, bytesPerSecond, transferred, total }
  error: null,
  currentVersion: getAppVersion(),
  remindedLater: false,
  dismissedVersion: null,
  isInitialized: false,

  initUpdater: () => {
    if (!isDesktopApp() || get().isInitialized) return () => {};
    set({ isInitialized: true, currentVersion: getAppVersion() });

    getUpdateStatus().then((state) => {
      if (state) {
        set({
          status: state.status || 'idle',
          info: state.info || null,
          progress: state.progress || null,
          error: state.error || null,
          currentVersion: state.currentVersion || getAppVersion(),
        });
      }
    });

    const unsubscribe = onUpdateStatusChange((state) => {
      if (state) {
        set({
          status: state.status,
          info: state.info || get().info,
          progress: state.progress,
          error: state.error,
          currentVersion: state.currentVersion || get().currentVersion,
        });
      }
    });

    return unsubscribe;
  },

  checkForUpdate: async () => {
    set({ status: 'checking', error: null });
    try {
      const res = await checkForUpdates();
      if (res?.error) {
        set({ status: 'error', error: res.error });
      }
      return res;
    } catch (err) {
      set({ status: 'error', error: err.message || 'Failed to check for updates' });
    }
  },

  downloadUpdate: async () => {
    set({ status: 'downloading', error: null, remindedLater: false });
    try {
      const res = await startDownloadUpdate();
      if (res && res.error) {
        set({ status: 'error', error: res.error });
      }
      return res;
    } catch (err) {
      set({ status: 'error', error: err.message || 'Failed to start download' });
    }
  },

  restartApp: () => {
    quitAndInstallUpdate();
  },

  remindLater: () => {
    const { info } = get();
    set({
      remindedLater: true,
      dismissedVersion: info?.version || null,
    });
  },
}));
