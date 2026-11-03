const { contextBridge, ipcRenderer } = require('electron');
const pkg = require('../package.json');

const isMac = process.platform === 'darwin';

contextBridge.exposeInMainWorld('electronAPI', {
  getHuddleShareSource: () => ipcRenderer.invoke('huddle-share:source'),
  getHuddleCaptureResult: () => ipcRenderer.invoke('huddle-capture:result'),
  screenCaptureAudioSupported: process.platform === 'win32',
  updateHuddleShare: value => ipcRenderer.invoke('huddle-share:update',value),
  updateHuddleAnnotations: value => ipcRenderer.send('huddle-share:annotations',value),
  onHuddleShareAction: callback => {
    const handler=(_event,value)=>callback(value);ipcRenderer.on('huddle-share:action',handler);
    return()=>ipcRenderer.removeListener('huddle-share:action',handler);
  },

  controlHuddleWindow: action => ipcRenderer.invoke('huddle-popout:control', action),
  setHuddleScreenSharing: active => ipcRenderer.send('huddle-screen-sharing', active === true),
  showHuddleInvitation: invitation => ipcRenderer.send('huddle-invitation:show', invitation),
  closeHuddleInvitation: id => ipcRenderer.send('huddle-invitation:close', id),
  onHuddleInvitationAction: callback => {const handler=(_event,data)=>callback(data);ipcRenderer.on('huddle-invitation:action',handler);return()=>ipcRenderer.removeListener('huddle-invitation:action',handler);},
  platform: process.platform,
  isMac: isMac,
  hasNativeWindowControls: process.platform === 'win32' || process.platform === 'linux',
  showNotification: (title, body, data, icon) => ipcRenderer.send('show-notification', { title, body, data, icon }),
  updateTaskbarBadge: (count, dataUrl, description) => ipcRenderer.send('update-taskbar-badge', { count, dataUrl, description }),
  clearTaskbarBadge: () => ipcRenderer.send('update-taskbar-badge', { count: 0, dataUrl: null }),
  flashFrame: (flag) => ipcRenderer.send('flash-frame', Boolean(flag)),
  onNotificationClicked: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('notification-clicked', handler);
    return () => ipcRenderer.removeListener('notification-clicked', handler);
  },
  requestMediaAccess: (type) => ipcRenderer.invoke('request-media-access', type),
  getMediaAccessStatus: (type) => ipcRenderer.invoke('get-media-access-status', type),
  onNotificationFailed: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('notification-failed', handler);
    return () => ipcRenderer.removeListener('notification-failed', handler);
  },
  onDesktopNotificationFailed: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('notification-failed', handler);
    return () => ipcRenderer.removeListener('notification-failed', handler);
  },
  getNotificationStatus: () => ipcRenderer.invoke('get-notification-status'),
  getAppVersion: () => {
    try {
      return ipcRenderer.sendSync('get-app-version-sync') || pkg.version;
    } catch {
      return pkg.version;
    }
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    startDownload: () => ipcRenderer.invoke('updater:start-download'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    getStatus: () => ipcRenderer.invoke('updater:get-status'),
    onStatusChange: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on('updater:status-changed', handler);
      return () => ipcRenderer.removeListener('updater:status-changed', handler);
    },
  },
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
