/**
 * desktopService.js
 * 
 * Provides an interface for desktop-specific features via the Electron preload script.
 * If the application is running in a standard web browser, it falls back to standard Web APIs.
 */

export const isDesktopApp = () => {
  if (typeof window === 'undefined') return false;
  if (window.electronAPI !== undefined) return true;
  if (navigator.userAgent.toLowerCase().includes('electron')) return true;
  return false;
};

export const setWindowControlsColor = (symbolColor) => {
  if (isDesktopApp() && window.electronAPI.setTitleBarOverlay) {
    window.electronAPI.setTitleBarOverlay({ symbolColor });
  }
};

export const showDesktopNotification = (title, options = {}) => {
  if (isDesktopApp()) {
    // Call the native Electron notification API
    window.electronAPI.showNotification(title, options.body || '', options.data);
  } else {
    // Fallback to standard web notifications
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, options);
      if (options.onClick) {
        notification.onclick = options.onClick;
      }
    }
  }
};

export const onDesktopNotificationClicked = (callback) => {
  if (isDesktopApp() && window.electronAPI.onNotificationClicked) {
    window.electronAPI.onNotificationClicked(callback);
  }
};

export const getAppVersion = () => {
  if (isDesktopApp()) {
    return window.electronAPI.getAppVersion();
  }
  return 'Web Version';
};
