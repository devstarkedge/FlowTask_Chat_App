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

export const hasNativeWindowControls = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.electronAPI?.hasNativeWindowControls);
};

export const setWindowControlsColor = (symbolColor) => {
  if (isDesktopApp() && window.electronAPI?.setTitleBarOverlay) {
    try {
      window.electronAPI.setTitleBarOverlay({ symbolColor });
    } catch (e) {
      console.warn('[desktopService] Failed to set titleBarOverlay color:', e);
    }
  }
};

/**
 * Dynamically samples the topbar / background header color
 * and sets native Windows titlebar controls (symbolColor) to high-contrast white or dark symbol.
 */
export const updateWindowControlsContrast = (targetElementOrColor) => {
  if (!isDesktopApp() || !window.electronAPI?.setTitleBarOverlay) return;

  try {
    let symbolColor = '#ffffff'; // Default to crisp white symbols for dark topbar

    if (typeof targetElementOrColor === 'string' && targetElementOrColor.startsWith('#')) {
      // Direct hex string passed
      const hex = targetElementOrColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      symbolColor = lum > 140 ? '#0f172a' : '#ffffff';
    } else {
      // Find topbar element or sample document header area
      const topbar = targetElementOrColor instanceof HTMLElement
        ? targetElementOrColor
        : document.querySelector('.cl-topbar, .file-preview-topbar, header, [data-topbar], .workspace-layout-header');

      const elemToSample = topbar || document.body;
      const bg = window.getComputedStyle(elemToSample).backgroundColor;

      if (bg && bg.startsWith('rgb')) {
        const rgbValues = bg.match(/\d+/g);
        if (rgbValues && rgbValues.length >= 3) {
          const r = parseInt(rgbValues[0], 10);
          const g = parseInt(rgbValues[1], 10);
          const b = parseInt(rgbValues[2], 10);
          const alpha = rgbValues.length >= 4 ? parseFloat(rgbValues[3]) : 1;

          // Perceived luminance: Y = 0.299R + 0.587G + 0.114B
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (alpha > 0.3) {
            symbolColor = lum > 140 ? '#0f172a' : '#ffffff';
          }
        }
      }
    }

    window.electronAPI.setTitleBarOverlay({ symbolColor });
  } catch (e) {
    console.warn('[desktopService] Failed to update window controls contrast:', e);
  }
};

export const showDesktopNotification = (title, options = {}) => {
  if (isDesktopApp() && window.electronAPI && window.electronAPI.showNotification) {
    // Call the native Electron notification API
    window.electronAPI.showNotification(title, options.body || '', options.data);
  } else {
    // Fallback to standard web notifications
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, options);
      if (options.onClick) {
        notification.onclick = options.onClick;
      } else if (options.data) {
        notification.onclick = () => {
          if (typeof window !== 'undefined' && window.focus) window.focus();
          // Dispatch notification click event for NavigationRouter
          if (options.data.navigationTarget) {
            window.dispatchEvent(
              new CustomEvent('notification:click', { detail: options.data.navigationTarget })
            );
          } else if (options.data.channelId) {
            window.dispatchEvent(
              new CustomEvent('notification:click', { detail: { type: 'channel', targetId: options.data.channelId } })
            );
          }
        };
      }
    }
  }
};

export const onDesktopNotificationClicked = (callback) => {
  if (isDesktopApp() && window.electronAPI?.onNotificationClicked) {
    window.electronAPI.onNotificationClicked(callback);
  }
};

export const getAppVersion = () => {
  if (isDesktopApp()) {
    return window.electronAPI.getAppVersion();
  }
  return 'Web Version';
};
