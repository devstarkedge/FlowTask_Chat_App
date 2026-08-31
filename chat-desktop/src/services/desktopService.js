/**
 * desktopService.js
 * 
 * Provides an interface for desktop-specific features via the Electron preload script.
 * If the application is running in a standard web browser, it falls back to standard Web APIs.
 */

export const isDesktopApp = () => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

export const showDesktopNotification = (title, options = {}) => {
  if (isDesktopApp()) {
    // Call the native Electron notification API
    window.electronAPI.showNotification(title, options.body || '');
  } else {
    // Fallback to standard web notifications
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, options);
    }
  }
};

export const getAppVersion = () => {
  if (isDesktopApp()) {
    return window.electronAPI.getAppVersion();
  }
  return 'Web Version';
};
