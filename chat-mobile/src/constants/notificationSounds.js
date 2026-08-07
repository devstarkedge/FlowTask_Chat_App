/**
 * Single source of truth for mobile notification sounds.
 * Used by: chat-mobile app, app.config.js (Expo plugin), server (Expo push payload).
 *
 * To change the app notification tune, update `ios.default` and add the
 * matching file under chat-mobile/assets/sounds/, then rebuild the native app.
 */

export const NOTIFICATION_SOUNDS = {
  ios: {
    /** Bundled filename referenced in APNs / local notification payloads */
    default: 'flowtask-arpeggio.wav',
    /** Files copied into the native iOS bundle via expo-notifications */
    bundleAssets: ['flowtask-arpeggio.wav'],
  },
  android: {
    default: 'default',
  },
};

export const IOS_NOTIFICATION_SOUND = NOTIFICATION_SOUNDS.ios.default;
export const ANDROID_NOTIFICATION_SOUND = NOTIFICATION_SOUNDS.android.default;

/** Paths relative to chat-mobile/ for the expo-notifications plugin */
export const IOS_NOTIFICATION_SOUND_ASSETS = NOTIFICATION_SOUNDS.ios.bundleAssets.map(
  (file) => `./assets/sounds/${file}`,
);

/**
 * @param {'ios' | 'android' | string} platform
 * @returns {string} Sound identifier for expo-notifications / APNs
 */
export function getNotificationSound(platform) {
  return platform === 'ios' ? IOS_NOTIFICATION_SOUND : ANDROID_NOTIFICATION_SOUND;
}
