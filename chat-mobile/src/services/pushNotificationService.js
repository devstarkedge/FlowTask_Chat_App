/**
 * Push Notification Service
 *
 * Handles push notification permissions, token registration with the server,
 * foreground notification display, and notification-tap navigation.
 *
 * Works with the server's existing FCM/Expo push infrastructure:
 *   - Registers the Expo push token via POST /push/fcm-token (platform: 'mobile')
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

// Re-export for callers that need the bundled iOS sound filename.
export { IOS_NOTIFICATION_SOUND as FLOWTASK_NOTIFICATION_SOUND } from '../constants/notificationSounds';
let _navigationRef = null;
export const setNavigationRef = (ref) => { _navigationRef = ref; };

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
        const isRemotePush = notification.request?.trigger?.type === 'push';
        const isScheduledSent = notification.request?.content?.data?.type === 'scheduled_sent'
          || notification.request?.content?.data?.type === 'scheduled_failed';
        return {
          shouldPlaySound: !isRemotePush || isScheduledSent,
          shouldSetBadge: true,
          shouldShowBanner: !isRemotePush || isScheduledSent,
          shouldShowList: true,
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
export async function registerForPushNotifications() {
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

  try {
    // 1. Check / request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('[Push] Permission denied');
      return null;
    }

    // Android: set notification channel for importance
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4F46E5',
          sound: ANDROID_NOTIFICATION_SOUND,
          enableVibrate: true,
        });
      } catch (e) {
        logger.warn('[Push] Failed to set notification channel:', e?.message);
      }
    }

    // 2. Get Expo push token
    let projectId;
    try {
      const Constants = require('expo-constants').default;
      projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    } catch (e) {}

    let tokenData;
    try {
      tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    } catch (err) {
      logger.warn('[Push] getExpoPushTokenAsync failed:', err?.message);
      return null;
    }

    const token = tokenData?.data;

    if (!token) {
      logger.warn('[Push] Could not obtain push token');
      return null;
    }

    // 3. Avoid re-registering the same token
    const savedToken = await storage.getItem(PUSH_TOKEN_KEY);
    if (savedToken === token) {
      logger.info('[Push] Token unchanged, skipping re-registration');
      return token;
    }

    // 4. Register with server (platform: 'expo' so server uses expo-server-sdk)
    const deviceId = Device.osInternalId || Device.deviceId || 'unknown';
    await pushAPI.registerToken(token, deviceId, 'expo');

    await storage.setItem(PUSH_TOKEN_KEY, token);
    logger.info('[Push] Token registered with server');

    // 5. Attach foreground / response listeners
    _attachListeners();

    return token;
  } catch (error) {
    logger.error('[Push] registerForPushNotifications failed:', error.message);
    return null;
  }
}

/**
 * Unregister the push token from the server and remove listeners.
 * Call this on logout.
 */
export async function unregisterPushNotifications() {
  try {
    const token = await storage.getItem(PUSH_TOKEN_KEY);
    if (token) {
      await pushAPI.removeToken(token).catch(() => {});
    }
    await storage.removeItem(PUSH_TOKEN_KEY);
    
    const Notifications = getNotificationsModule();
    if (Notifications) {
      await Notifications.dismissAllNotificationsAsync().catch(() => {});
      await Notifications.setBadgeCountAsync(0).catch(() => {});
    }

    _detachListeners();
    logger.info('[Push] Token unregistered and device notifications cleared');
  } catch (error) {
    logger.error('[Push] unregister failed:', error.message);
  }
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
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
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

function _attachListeners() {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  // Prevent duplicate listeners
  _detachListeners();

  try {
    // Foreground: notification data received while app is open
    _foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request?.content?.data || {};

      // Update unread count in store
      try {
        const { useNotificationStore } = require('../stores/notificationStore');
        useNotificationStore.getState().fetchUnreadCount();
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
      const data = response.notification?.request?.content?.data || {};
      _navigateFromNotification(data);

      // Clear badge when user interacts with a notification
      Notifications.setBadgeCountAsync(0).catch(() => {});
    });
  } catch (e) {
    logger.warn('[Push] addNotificationResponseReceivedListener error:', e?.message);
  }
}

function _detachListeners() {
  if (_foregroundSub) {
    try { _foregroundSub.remove(); } catch (e) {}
    _foregroundSub = null;
  }
  if (_responseSub) {
    try { _responseSub.remove(); } catch (e) {}
    _responseSub = null;
  }
}

function _navigateFromNotification(data) {
  const nav = _navigationRef?.current;
  if (!nav || !nav.isReady?.()) return;

  const { channelId, messageId, threadId, type, workspaceId } = data;

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
    const { useWorkspaceStore } = require('../stores/workspaceStore');
    const { activeWorkspaceId, switchWorkspace } = useWorkspaceStore.getState();

    if (workspaceId && workspaceId !== activeWorkspaceId) {
      switchWorkspace(workspaceId)
        .then(() => {
          // Allow context refresh to finalize state before navigating
          setTimeout(runNavigation, 600);
        })
        .catch((err) => {
          logger.warn('[Push] Failed to switch workspace on notification tap:', err);
          runNavigation();
        });
    } else {
      runNavigation();
    }
  } catch (error) {
    runNavigation();
  }
}
