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
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import storage from './storage';
import { pushAPI } from './api';
import logger from '../utils/logger';

const PUSH_TOKEN_KEY = 'expo_push_token';

// Navigation ref set from App.js
let _navigationRef = null;
export const setNavigationRef = (ref) => { _navigationRef = ref; };

// ─── Foreground Presentation ─────────────────────────────────────────────────

// Suppress OS-level banners when app is foregrounded.
// The socket notification event triggers a local notification manually,
// preventing duplicates with the server's Expo push.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Request permissions, obtain the Expo push token, and register it with the server.
 * Call this once after the user is authenticated.
 *
 * @returns {string|null} The Expo push token, or null on failure.
 */
export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    logger.info('[Push] Push notifications require a physical device');
    return null;
  }

  try {
    // 1. Check / request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('[Push] Permission denied');
      return null;
    }

    // Android: set notification channel for importance
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
        sound: 'default',
        enableVibrate: true,
      });
    }

    // 2. Get Expo push token
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenData.data;

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
    _detachListeners();
    logger.info('[Push] Token unregistered');
  } catch (error) {
    logger.error('[Push] unregister failed:', error.message);
  }
}

/**
 * Check if push notifications are currently enabled (permission granted + token stored).
 */
export async function isPushEnabled() {
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
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
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
  // Prevent duplicate listeners
  _detachListeners();

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

  // Notification tapped: navigate to the relevant screen
  _responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification?.request?.content?.data || {};
    _navigateFromNotification(data);

    // Clear badge when user interacts with a notification
    Notifications.setBadgeCountAsync(0).catch(() => {});
  });
}

function _detachListeners() {
  if (_foregroundSub) {
    _foregroundSub.remove();
    _foregroundSub = null;
  }
  if (_responseSub) {
    _responseSub.remove();
    _responseSub = null;
  }
}

function _navigateFromNotification(data) {
  const nav = _navigationRef?.current;
  if (!nav || !nav.isReady?.()) return;

  const { channelId, messageId, threadId, type } = data;

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
}

// ─── Constants import (lazy to avoid circular deps) ──────────────────────────
let Constants;
try {
  Constants = require('expo-constants').default;
} catch {
  Constants = null;
}
