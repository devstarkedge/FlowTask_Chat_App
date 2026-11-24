import { create } from 'zustand';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { AppState, Platform } from 'react-native';
import storage from '../services/storage';

const PENDING_UPDATE_STORAGE_KEY = '@taskchat_pending_update_verification';
const LAST_SUCCESSFUL_UPDATE_STORAGE_KEY = '@taskchat_last_successful_update';
const DISMISSED_UPDATE_STORAGE_KEY = '@taskchat_dismissed_update_id';
const LAST_CHECK_TIME_STORAGE_KEY = '@taskchat_last_check_timestamp';
const MIN_BACKGROUND_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

export const isUpdatesSupported = Boolean(Updates.isEnabled) && !isExpoGo && !isDev;

export function getNativeAppVersion() {
  const configuredVersion =
    Constants.expoConfig?.version ||
    Constants.manifest2?.extra?.expoClient?.version ||
    Constants.manifest?.version;
  const configuredAppId = Platform.OS === 'android'
    ? Constants.expoConfig?.android?.package
    : Constants.expoConfig?.ios?.bundleIdentifier;
  const isHostContainer =
    isExpoGo ||
    Boolean(
      Application.applicationId &&
      configuredAppId &&
      Application.applicationId !== configuredAppId
    );

  // Expo Go can report its host version (for example 58.0.5) instead of
  // TaskChat's version. Use the configured version only when running in a
  // host container; installed TaskChat builds use native version metadata.
  if (isHostContainer && configuredVersion) return configuredVersion;

  return (
    Application.nativeApplicationVersion ||
    configuredVersion ||
    '1.0.0'
  );
}

export function getNativeBuildVersion() {
  return (
    (Constants.expoConfig?.android?.versionCode
      ? String(Constants.expoConfig.android.versionCode)
      : null) ||
    Constants.expoConfig?.ios?.buildNumber ||
    Application.nativeBuildVersion ||
    ''
  );
}

export function getRuntimeVersion() {
  if (Updates.runtimeVersion) return Updates.runtimeVersion;
  const rv = Constants.expoConfig?.runtimeVersion;
  if (typeof rv === 'string') return rv;
  if (rv?.policy === 'appVersion') return getNativeAppVersion();
  if (rv?.policy === 'nativeVersion') {
    const v = getNativeAppVersion();
    const b = getNativeBuildVersion();
    return b ? `${v} (${b})` : v;
  }
  if (rv?.policy) return rv.policy;
  return getNativeAppVersion();
}

export function getRunningUpdateId() {
  try {
    if (isExpoGo || !Updates.isEnabled || Updates.isEmbeddedLaunch) {
      return null;
    }
    return Updates.updateId || null;
  } catch {
    return null;
  }
}

export function formatShortId(id) {
  if (!id) return '';
  if (id === 'Embedded Build' || id === 'Development Client' || id === 'Active Bundle') return '';
  if (typeof id === 'string' && id.length > 12) {
    return `${id.slice(0, 8)}…`;
  }
  return String(id);
}

let initPromise = null;

export const useUpdateStore = create((set, get) => ({
  // Core Status
  // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'restarting' | 'up-to-date' | 'update-success' | 'native-update-required' | 'error'
  status: 'idle',
  isEnabled: isUpdatesSupported,
  isExpoGo,
  isDev,

  // Versioning info
  nativeAppVersion: getNativeAppVersion(),
  nativeBuildVersion: getNativeBuildVersion(),
  runningUpdateId: getRunningUpdateId(),
  runningCreatedAt: Updates.createdAt ? Updates.createdAt.toISOString() : null,
  runtimeVersion: getRuntimeVersion(),
  channel: Updates.channel || (isExpoGo ? 'Unavailable in Expo Go' : 'production'),
  isEmbeddedLaunch: Updates.isEmbeddedLaunch ?? true,
  isEmergencyLaunch: Updates.isEmergencyLaunch ?? false,

  // Available & Downloaded updates
  availableUpdate: null,    // { updateId, createdAt, manifest, runtimeVersion }
  downloadedUpdate: null,   // { updateId, createdAt, manifest, runtimeVersion }
  downloadProgress: null,   // 0 - 100 or null

  // Operational State
  error: null,
  errorType: null,          // 'check' | 'download' | 'restart' | 'runtime-incompatible' | 'verification'
  lastCheckedAt: null,
  lastSuccessfulUpdate: null, // { updateId, verifiedAt, runtimeVersion, nativeVersion }

  // Modal Visibility: 'none' | 'available' | 'downloading' | 'ready' | 'success' | 'native-required'
  activeModal: 'none',
  dismissedUpdateId: null,
  isInitialized: false,

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Initialization and Post-Restart Verification
  // ────────────────────────────────────────────────────────────────────────────
  initUpdater: async () => {
    if (get().isInitialized || initPromise) return initPromise;

    initPromise = (async () => {
      set({
        isInitialized: true,
        nativeAppVersion: getNativeAppVersion(),
        nativeBuildVersion: getNativeBuildVersion(),
        runningUpdateId: getRunningUpdateId(),
        channel: Updates.channel || (isExpoGo ? 'Unavailable in Expo Go' : 'production'),
      });

      try {
        const [lastCheck, lastSuccess, dismissedId] = await Promise.all([
          storage.getItem(LAST_CHECK_TIME_STORAGE_KEY),
          storage.getJson(LAST_SUCCESSFUL_UPDATE_STORAGE_KEY),
          storage.getItem(DISMISSED_UPDATE_STORAGE_KEY),
        ]);

        if (lastCheck) set({ lastCheckedAt: lastCheck });
        if (lastSuccess) set({ lastSuccessfulUpdate: lastSuccess });
        if (dismissedId) set({ dismissedUpdateId: dismissedId });

        // Post-restart verification
        const pendingVerification = await storage.getJson(PENDING_UPDATE_STORAGE_KEY);
        if (pendingVerification && pendingVerification.expectedUpdateId) {
          const currentId = Updates.updateId;
          const expectedId = pendingVerification.expectedUpdateId;

          const isVerified =
            Boolean(currentId) &&
            typeof currentId === 'string' &&
            currentId.toLowerCase() === String(expectedId).toLowerCase();

          await storage.removeItem(PENDING_UPDATE_STORAGE_KEY);

          if (isVerified) {
            const successData = {
              updateId: currentId,
              verifiedAt: new Date().toISOString(),
              runtimeVersion: Updates.runtimeVersion || pendingVerification.runtimeVersion || getRuntimeVersion(),
              nativeVersion: getNativeAppVersion(),
            };

            await storage.setJson(LAST_SUCCESSFUL_UPDATE_STORAGE_KEY, successData);

            set({
              status: 'update-success',
              runningUpdateId: currentId,
              lastSuccessfulUpdate: successData,
              activeModal: 'success',
              error: null,
            });
          } else {
            console.warn(
              `[Updates] Update verification failed. Expected: ${expectedId}, Currently running: ${currentId || 'Embedded'}`
            );
            set({
              status: 'error',
              errorType: 'verification',
              error: `Update was not applied. Expected update ${formatShortId(expectedId)}, but running ${formatShortId(currentId || 'embedded bundle')}.`,
              activeModal: 'none',
            });
          }
        }
      } catch (err) {
        console.warn('[Updates] initUpdater error:', err?.message);
      }

      // AppState foreground listener for auto-checks
      AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          get().checkForUpdate({ isManual: false });
        }
      });

      // Initial check on startup if updates are supported
      if (isUpdatesSupported) {
        get().checkForUpdate({ isManual: false });
      }
    })();

    return initPromise;
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Check for Updates
  // ────────────────────────────────────────────────────────────────────────────
  checkForUpdate: async ({ isManual = false } = {}) => {
    const state = get();
    if (state.status === 'checking' || state.status === 'downloading' || state.status === 'restarting') {
      return;
    }

    if (!isManual && state.lastCheckedAt) {
      const elapsed = Date.now() - new Date(state.lastCheckedAt).getTime();
      if (elapsed < MIN_BACKGROUND_CHECK_INTERVAL_MS) {
        return;
      }
    }

    set({ status: 'checking', error: null, errorType: null });

    // In dev / debug mode (Android / iOS), Expo Go, or environments where updates are not supported
    if (!isUpdatesSupported) {
      const reason = isExpoGo
        ? 'OTA updates are unavailable in Expo Go. Install a TaskChat preview or store build to check for updates.'
        : 'OTA updates are disabled in this development build. Install a preview or store build to check for updates.';
      set({
        status: 'error',
        availableUpdate: null,
        error: reason,
        errorType: 'unsupported',
        activeModal: 'none',
      });
      return;
    }

    try {
      const result = await Updates.checkForUpdateAsync();
      const now = new Date().toISOString();
      await storage.setItem(LAST_CHECK_TIME_STORAGE_KEY, now);

      if (result.isAvailable) {
        const manifest = result.manifest || {};
        const updateId =
          manifest.id ||
          (manifest.metadata && manifest.metadata.id) ||
          `update-${Date.now().toString(36)}`;

        const availableUpdate = {
          updateId,
          createdAt: manifest.createdAt ? new Date(manifest.createdAt) : new Date(),
          manifest,
          runtimeVersion: manifest.runtimeVersion || Updates.runtimeVersion || getRuntimeVersion(),
        };

        const dismissedId = get().dismissedUpdateId;
        const isDismissed = dismissedId && dismissedId.toLowerCase() === updateId.toLowerCase();

        set({
          status: 'available',
          availableUpdate,
          lastCheckedAt: now,
          activeModal: isManual || !isDismissed ? 'available' : 'none',
        });
      } else {
        set({
          status: 'up-to-date',
          availableUpdate: null,
          lastCheckedAt: now,
        });
      }
    } catch (err) {
      console.warn('[Updates] checkForUpdate error:', err?.message);
      const msg = String(err?.message || '');

      // If error is due to dev mode, expo-updates disabled, or local debug build
      if (!isUpdatesSupported || /development mode|not accessible|ERR_UPDATES_DISABLED|disabled|expo go/i.test(msg)) {
        set({
          status: 'up-to-date',
          error: null,
          errorType: null,
        });
        if (isManual) {
          try {
            const { default: Toast } = await import('react-native-toast-message');
            Toast.show({
              type: 'success',
              text1: 'TaskChat is up to date',
              text2: `Version ${getNativeAppVersion()}`,
            });
          } catch (_) {}
        }
        return;
      }

      const isRuntimeMismatch = /runtime version|incompatible runtime|runtimeVersion/i.test(msg);

      if (isRuntimeMismatch) {
        set({
          status: 'native-update-required',
          errorType: 'runtime-incompatible',
          error: 'A newer version of TaskChat requires a native app store update.',
          activeModal: 'native-required',
        });
      } else {
        set({
          status: 'error',
          errorType: 'check',
          error: 'Unable to check for updates. Please check your internet connection.',
          activeModal: 'none',
        });
      }
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Download Available Update
  // ────────────────────────────────────────────────────────────────────────────
  downloadUpdate: async () => {
    const state = get();
    if (state.status === 'downloading' || state.status === 'restarting') return;

    set({
      status: 'downloading',
      downloadProgress: 0,
      error: null,
      errorType: null,
      activeModal: 'downloading',
    });

    // In dev / non-standalone / Expo Go: animate progress smoothly so flow is fully interactive
    if (!isUpdatesSupported) {
      for (let p = 15; p <= 100; p += 20) {
        await new Promise((r) => setTimeout(r, 350));
        set({ downloadProgress: p });
      }

      const simUpdate = {
        updateId: state.availableUpdate?.updateId || `ota-${Date.now().toString(36)}`,
        createdAt: new Date(),
        manifest: {},
        runtimeVersion: state.runtimeVersion || getRuntimeVersion(),
      };

      set({
        status: 'downloaded',
        downloadProgress: 100,
        downloadedUpdate: simUpdate,
        activeModal: 'ready',
      });
      return;
    }

    try {
      const result = await Updates.fetchUpdateAsync();

      if (result.isNew) {
        const manifest = result.manifest || {};
        const updateId =
          manifest.id ||
          state.availableUpdate?.updateId ||
          `update-${Date.now().toString(36)}`;

        const downloadedUpdate = {
          updateId,
          createdAt: manifest.createdAt ? new Date(manifest.createdAt) : new Date(),
          manifest,
          runtimeVersion: manifest.runtimeVersion || Updates.runtimeVersion || getRuntimeVersion(),
        };

        set({
          status: 'downloaded',
          downloadProgress: 100,
          downloadedUpdate,
          activeModal: 'ready',
        });
      } else {
        set({
          status: 'up-to-date',
          activeModal: 'none',
        });
      }
    } catch (err) {
      console.warn('[Updates] fetchUpdateAsync error:', err?.message);
      set({
        status: 'error',
        errorType: 'download',
        error: err?.message || 'Download failed. Please check your network and try again.',
        activeModal: 'none',
      });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Restart Application to Apply Downloaded Update
  // ────────────────────────────────────────────────────────────────────────────
  restartApp: async () => {
    const state = get();
    const targetUpdateId =
      state.downloadedUpdate?.updateId ||
      state.availableUpdate?.updateId;

    set({ status: 'restarting' });

    try {
      if (targetUpdateId) {
        await storage.setJson(PENDING_UPDATE_STORAGE_KEY, {
          expectedUpdateId: targetUpdateId,
          requestedAt: new Date().toISOString(),
          previousUpdateId: Updates.updateId || null,
          runtimeVersion: Updates.runtimeVersion || getRuntimeVersion(),
          nativeVersion: getNativeAppVersion(),
        });
      }

      if (isUpdatesSupported) {
        await Updates.reloadAsync();
      } else {
        // In dev / test mode: reload or complete simulated verification
        await new Promise((r) => setTimeout(r, 600));
        const successData = {
          updateId: targetUpdateId || Updates.updateId || null,
          verifiedAt: new Date().toISOString(),
          runtimeVersion: state.runtimeVersion || getRuntimeVersion(),
          nativeVersion: getNativeAppVersion(),
        };
        await storage.setJson(LAST_SUCCESSFUL_UPDATE_STORAGE_KEY, successData);
        await storage.removeItem(PENDING_UPDATE_STORAGE_KEY);
        set({
          status: 'update-success',
          runningUpdateId: targetUpdateId || Updates.updateId || null,
          lastSuccessfulUpdate: successData,
          activeModal: 'success',
        });
      }
    } catch (err) {
      console.warn('[Updates] reloadAsync error:', err?.message);
      set({
        status: 'error',
        errorType: 'restart',
        error: `Restart failed: ${err?.message || 'Could not reload application.'}`,
        activeModal: 'none',
      });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Modal and Sync Helpers
  // ────────────────────────────────────────────────────────────────────────────
  dismissModal: async () => {
    const state = get();
    if (state.activeModal === 'available' && state.availableUpdate?.updateId) {
      await storage.setItem(DISMISSED_UPDATE_STORAGE_KEY, state.availableUpdate.updateId);
      set({
        activeModal: 'none',
        dismissedUpdateId: state.availableUpdate.updateId,
      });
    } else {
      set({ activeModal: 'none' });
    }
  },

  openModal: (modalName) => {
    set({ activeModal: modalName });
  },

  syncWithExpoUpdates: (expoState) => {
    if (!expoState) return;
    const {
      isDownloading,
      isUpdatePending,
      downloadProgress,
      isChecking,
      checkError,
      downloadError,
    } = expoState;

    const current = get();
    const updatesToApply = {};

    if (typeof downloadProgress === 'number' && Number.isFinite(downloadProgress)) {
      const newProgress = Math.min(100, Math.max(0, Math.round(downloadProgress * 100)));
      if (newProgress !== current.downloadProgress) {
        updatesToApply.downloadProgress = newProgress;
      }
    }

    if (isDownloading && current.status !== 'downloading') {
      updatesToApply.status = 'downloading';
    }

    if (isUpdatePending && current.status !== 'downloaded' && current.status !== 'restarting') {
      updatesToApply.status = 'downloaded';
    }

    if (isChecking && current.status !== 'checking') {
      updatesToApply.status = 'checking';
    }

    if (downloadError && current.status === 'downloading' && current.error !== downloadError.message) {
      updatesToApply.status = 'error';
      updatesToApply.error = 'Download failed. Please check your internet connection.';
      updatesToApply.errorType = 'download';
    } else if (checkError && current.status === 'checking' && current.error !== checkError.message) {
      const errMsg = String(checkError.message || '');
      if (!isUpdatesSupported || /development mode|not accessible|ERR_UPDATES_DISABLED|disabled|expo go/i.test(errMsg)) {
        updatesToApply.status = 'up-to-date';
        updatesToApply.error = null;
        updatesToApply.errorType = null;
      } else {
        updatesToApply.status = 'error';
        updatesToApply.error = 'Unable to check for updates. Please check your internet connection.';
        updatesToApply.errorType = 'check';
      }
    }

    if (Object.keys(updatesToApply).length > 0) {
      set(updatesToApply);
    }
  },
}));
