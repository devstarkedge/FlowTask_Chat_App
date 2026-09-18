const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  hasNativeWindowControls: process.platform === 'win32' || process.platform === 'linux',
  showNotification: (title, body, data) => ipcRenderer.send('show-notification', { title, body, data }),
  onNotificationClicked: (callback) => ipcRenderer.on('notification-clicked', (_event, data) => callback(data)),
  getAppVersion: () => process.env.npm_package_version || '1.0.0',
  setTitleBarOverlay: (options) => ipcRenderer.send('set-title-bar-overlay', options),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => {
    const handler = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximized-change', handler);
    return () => ipcRenderer.removeListener('window-maximized-change', handler);
  },
});

