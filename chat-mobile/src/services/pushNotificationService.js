/**
 * Push Notification Service
 *
 * Handles push notification permissions, token registration with the server,
 * foreground notification display, and notification-tap navigation.
 *
 * Works with the server's existing FCM/Expo push infrastructure:
 *   - Registers the Expo push token via POST /push/fcm-token (platform: 'expo')
 *   - Server stores the token in chatPreferences.fcmTokens
 *   - Server sends via expo-server-sdk when platform === 'expo'
 */
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import storage from './storage';
import { pushAPI } from './api';
import logger from '../utils/logger';
import {
  ANDROID_NOTIFICATION_SOUND,
  getNotificationSound,
  IOS_NOTIFICATION_SOUND,
} from '../constants/notificationSounds';

const PUSH_TOKEN_KEY = 'expo_push_token';
export const PUSH_INSTALLATION_KEY = 'push_installation_id';
let _generation = 0;
let _registration = null;
let _lastNativeToken = null;
let _pendingResponse = null;
let _navigating = false;
const _handledResponses = new Set();
const _presented = new Map();
const session = () => {
  const { useAuthStore } = require('../stores/authStore');
  const { user, accessToken } = useAuthStore.getState();
  return { userId: user?._id || user?.id, accessToken };
};
const permissionGranted = (permission, Notifications) => permission.status === 'granted'
  || (Platform.OS === 'ios' && permission.ios?.status === Notifications.IosAuthorizationStatus?.PROVISIONAL);
const trace = (stage, details = {}) => logger.info('[Push]', { stage, platform: Platform.OS, ...details });

// Re-export for callers that need the bundled iOS sound filename.
export { IOS_NOTIFICATION_SOUND as FLOWTASK_NOTIFICATION_SOUND } from '../constants/notificationSounds';
let _navigationRef = null;
export const setNavigationRef = (ref) => { _navigationRef = ref; };
export const handlePushNavigationReady = () => { void _flushResponse(); };

// Helper to check if running inside Expo Go app
export const checkIsExpoGo = () => {
  try {
    if (typeof isRunningInExpoGo === 'function' && isRunningInExpoGo()) {
      return true;
    }
  } catch (e) {}
  try {
    const Constants = require('expo-constants').default;
    return Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
  } catch (e) {
    return false;
  }
};

let NotificationsModule = null;
const getNotificationsModule = () => {
  if (NotificationsModule) return NotificationsModule;
  if (checkIsExpoGo()) return null;
  try {
    NotificationsModule = require('expo-notifications');
    return NotificationsModule;
  } catch (e) {
    logger.warn('[Push] Could not load expo-notifications module:', e?.message);
    return null;
  }
};

// ─── Foreground Presentation ─────────────────────────────────────────────────

// Configure notification handler safely if not in Expo Go
const initNotificationHandler = () => {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request?.content?.data || {};
        const now = Date.now();
        for (const [id, time] of _presented) if (now - time > 60000) _presented.delete(id);
        const id = data.notificationId;
        const duplicate = id && _presented.has(id);
        if (id && !duplicate) _presented.set(id, now);
        // Socket-generated local notifications and remote pushes share an ID.
        // Present whichever arrives first on both native platforms.
        return {
          shouldPlaySound: !duplicate,
          shouldSetBadge: !duplicate,
          shouldShowBanner: !duplicate,
          shouldShowList: !duplicate,
        };
      },
    });
  } catch (err) {
    logger.warn('[Push] Unable to set notification handler:', err?.message);
  }
};

if (!checkIsExpoGo()) {
  initNotificationHandler();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Request permissions, obtain the Expo push token, and register it with the server.
 * Call this once after the user is authenticated.
 *
 * @returns {string|null} The Expo push token, or null on failure.
 */
export function registerForPushNotifications() {
  const owner = session();
  if (!owner.userId || !owner.accessToken) return Promise.resolve(null);
  if (_registration?.userId === owner.userId) return _registration.promise;
  const generation = _generation;
  const current = () => generation === _generation && session().userId === owner.userId
    && Boolean(session().accessToken);
  const promise = _register(owner, current).finally(() => {
    if (_registration?.promise === promise) {
      const refreshPending = _registration.refreshPending;
      _registration = null;
      if (refreshPending && current()) void registerForPushNotifications();
    }
  });
  _registration = { userId: owner.userId, promise };
  return promise;
}

async function _register(owner, current) {
  if (checkIsExpoGo()) {
    logger.warn('[Push] Remote push notifications are removed from Expo Go on SDK 53+. Use a dev build for push notifications.');
    return null;
  }

  const Notifications = getNotificationsModule();
  if (!Notifications) return null;

  if (!Device.isDevice) {
    logger.info('[Push] Push notifications require a physical device');
    return null;
  }

  _attachListeners();
  void _flushResponse();

  try {
    // Android 13's permission prompt requires a channel to exist first.
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4F46E5',
          sound: ANDROID_NOTIFICATION_SOUND,
          enableVibrate: true,
        });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!current()) return null;
    if (!permissionGranted(permission, Notifications) && permission.canAskAgain !== false) {
      permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    }
    trace('permission', { userId: owner.userId, status: permission.status, canAskAgain: permission.canAskAgain });
    if (!current() || !permissionGranted(permission, Notifications)) return null;

    // 2. Get Expo push token
    let projectId;
    try {
      const Constants = require('expo-constants').default;
      projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    } catch (e) {}
    if (!projectId) throw Object.assign(new Error('Missing EAS projectId'), { code: 'MissingProjectId' });

    let tokenData;
    try {
      tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    } catch (err) {
      logger.warn('[Push] token generation failed', { code: err?.code || 'TokenGenerationFailed' });
      return null;
    }

    const token = tokenData?.data;

    if (!/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token || '')) {
      logger.warn('[Push] Could not obtain push token');
      return null;
    }

    if (!current()) return null;
    trace('token_generated', { userId: owner.userId, tokenType: 'expo' });
    let deviceId = await storage.getItem(PUSH_INSTALLATION_KEY);
    if (!deviceId) {
      // An installation identifier is not a secret or authentication credential.
      deviceId = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      await storage.setItem(PUSH_INSTALLATION_KEY, deviceId);
    }
    if (!current()) return null;
    // Reconfirm server ownership even when the device token hasn't changed.
    if (_registration?.userId === owner.userId) _registration.requestStarted = true;
    const response = await pushAPI.registerToken(token, deviceId, 'expo');
    if (response?.data?.success !== true) throw Object.assign(new Error('Push registration was not confirmed'), { code: 'RegistrationUnconfirmed' });
    if (!current()) {
      if (session().userId === owner.userId) await pushAPI.removeToken(token);
      return null;
    }
    await storage.setItem(PUSH_TOKEN_KEY, token);
    trace('token_registered', { userId: owner.userId, tokenType: 'expo', status: response.status });

    return token;
  } catch (error) {
    logger.error('[Push] registration failed', { code: error.code || 'RegistrationFailed', status: error.response?.status });
    return null;
  }
}

/**
 * Unregister the push token from the server and remove listeners.
 * Call this on logout.
 */
export async function unregisterPushNotifications() {
  _generation++;
  _lastNativeToken = null;
  _pendingResponse = null;
  _handledResponses.clear();
  _presented.clear();
  _detachListeners();
  try {
    // Wait only for an authenticated request already sent to the backend.
    // A native token/permission prompt can be cancelled without delaying logout.
    const registration = _registration;
    if (registration?.requestStarted) await registration.promise;
    else _registration = null;
    const token = await storage.getItem(PUSH_TOKEN_KEY);
    if (token) {
      const response = await pushAPI.removeToken(token);
      if (response?.data?.success !== true) throw new Error('Push removal was not confirmed');
    }
    await storage.removeItem(PUSH_TOKEN_KEY);
    
    const Notifications = getNotificationsModule();
    if (Notifications) {
      await Notifications.dismissAllNotificationsAsync().catch(() => {});
      await Notifications.setBadgeCountAsync(0).catch(() => {});
      await Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
    }

    _detachListeners();
    logger.info('[Push] Token unregistered and device notifications cleared');
  } catch (error) {
    logger.error('[Push] unregister failed', { code: error.code || 'UnregisterFailed', status: error.response?.status });
    return false;
  }
  return true;
}

/**
 * Check if push notifications are currently enabled (permission granted + token stored).
 */
export async function isPushEnabled() {
  if (checkIsExpoGo()) return false;
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;
  try {
    const token = await storage.getItem(PUSH_TOKEN_KEY);
    if (!token) return false;
    return permissionGranted(await Notifications.getPermissionsAsync(), Notifications);
  } catch {
    return false;
  }
}

/**
 * Programmatically show a local notification (e.g., from a socket event).
 */
export async function showLocalNotification({ title, body, data = {} }) {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: getNotificationSound(Platform.OS),
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // immediate
    });
  } catch (error) {
    logger.error('[Push] showLocalNotification failed:', error.message);
  }
}

// ─── Internal Listeners ──────────────────────────────────────────────────────

let _foregroundSub = null;
let _responseSub = null;
let _tokenSub = null;

function _attachListeners() {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  if (_foregroundSub && _responseSub && _tokenSub) return;
  // Prevent duplicate listeners
  _detachListeners();
  const generation = _generation;
  const owner = session().userId;
  const active = () => generation === _generation && session().userId === owner && Boolean(session().accessToken);

  try {
    // Foreground: notification data received while app is open
    _foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
      if (!active()) return;
      const data = notification.request?.content?.data || {};
      trace('received', { notificationId: data.notificationId, channelId: data.channelId });

      // Update unread count in store
      try {
        const { useNotificationStore } = require('../stores/notificationStore');
        Promise.resolve(useNotificationStore.getState().fetchUnreadCount()).catch(() => {});
      } catch {}

      // If we're currently viewing the channel this notification belongs to, dismiss badge
      try {
        const { useChannelStore } = require('../stores/channelStore');
        if (data.channelId) {
          const activeId = useChannelStore.getState().activeChannelId;
          if (activeId === data.channelId) {
            // User is already viewing this channel — clear the badge
            Notifications.setBadgeCountAsync(0).catch(() => {});
          }
        }
      } catch {}
    });
  } catch (e) {
    logger.warn('[Push] addNotificationReceivedListener error:', e?.message);
  }

  try {
    // Notification tapped: navigate to the relevant screen
    _responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!active()) return;
      _queueResponse(response);

      // Clear badge when user interacts with a notification
      Notifications.setBadgeCountAsync(0).catch(() => {});
    });
  } catch (e) {
    logger.warn('[Push] addNotificationResponseReceivedListener error:', e?.message);
  }
  try {
    _tokenSub = Notifications.addPushTokenListener(nativeToken => {
      if (!active()) return;
      // iOS can emit the same APNs token when registering again. Do not turn
      // that callback into a repeated Expo-token/registration loop.
      const signature = `${nativeToken.type}:${nativeToken.data}`;
      if (signature === _lastNativeToken) return;
      _lastNativeToken = signature;
      // This event contains an FCM/APNs token. Regenerate the Expo token instead.
      trace('native_token_changed');
      if (_registration) {
        _registration.refreshPending = true;
        return;
      }
      void registerForPushNotifications();
    });
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response && active()) _queueResponse(response);
    }).catch(() => {});
  } catch (e) {
    logger.warn('[Push] Token/cold-start listener setup failed');
  }
}

function _detachListeners() {
  _tokenSub?.remove();
  _tokenSub = null;
  if (_foregroundSub) {
    try { _foregroundSub.remove(); } catch (e) {}
    _foregroundSub = null;
  }
  if (_responseSub) {
    try { _responseSub.remove(); } catch (e) {}
    _responseSub = null;
  }
}

function _queueResponse(response) {
  const request = response.notification?.request;
  const id = `${request?.identifier}:${response.actionIdentifier}`;
  if (_handledResponses.has(id)) return;
  _pendingResponse = { id, data: request?.content?.data || {} };
  trace('tap', { notificationId: _pendingResponse.data.notificationId });
  void _flushResponse();
}

async function _flushResponse() {
  const nav = _navigationRef?.current;
  if (!_pendingResponse || _navigating || !nav?.isReady?.() || !session().accessToken) return;
  const response = _pendingResponse;
  const owner = session().userId;
  const generation = _generation;
  const { useWorkspaceStore } = require('../stores/workspaceStore');
  if (!useWorkspaceStore.getState().activeWorkspaceId || useWorkspaceStore.getState().isSwitchingWorkspace) return;
  _navigating = true;

  const asId = value => typeof value === 'object' ? value?._id : value;
  const { messageId } = response.data;
  const channelId = asId(response.data.channelId);
  const threadId = asId(response.data.threadId);
  const workspaceId = asId(response.data.workspaceId);

  const runNavigation = () => {
    if (threadId) {
      // Navigate to thread detail
      nav.navigate('ThreadDetail', { threadId, channelId, messageId });
    } else if (channelId) {
      // Navigate to channel chat (handles both DMs and channels)
      nav.navigate('Chat', { channelId, messageId });
    } else {
      // Fall back to notifications screen
      nav.navigate('Notifications');
    }
  };

  try {
    const { activeWorkspaceId, switchWorkspace } = useWorkspaceStore.getState();
    if (workspaceId && workspaceId !== activeWorkspaceId) {
      await switchWorkspace(workspaceId);
    }
    if (generation !== _generation || session().userId !== owner || !nav.isReady()) return;
    runNavigation();
    _handledResponses.add(response.id);
    if (_handledResponses.size > 100) _handledResponses.delete(_handledResponses.values().next().value);
    if (_pendingResponse === response) _pendingResponse = null;
    await getNotificationsModule()?.clearLastNotificationResponseAsync?.();
  } catch (error) {
    logger.warn('[Push] Notification navigation failed', { code: error.code || 'WorkspaceUnavailable' });
  } finally {
    _navigating = false;
  }
}
