const { app, ipcMain } = require('electron');
const pkg = require('../package.json');

let isInitialized = false;
let autoUpdater = null;
let updateStatus = {
  status: 'idle', // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  info: null,
  progress: null,
  error: null,
  currentVersion: pkg.version,
};

function getAutoUpdater() {
  if (!autoUpdater) {
    try {
      const updaterModule = require('electron-updater');
      autoUpdater = updaterModule.autoUpdater;
    } catch (err) {
      console.error('[Updater] Failed to load electron-updater:', err.message);
      return null;
    }
  }
  return autoUpdater;
}

function broadcastStatus(win) {
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('updater:status-changed', updateStatus);
    } catch (err) {
      console.warn('[Updater] Failed to broadcast status to window:', err);
    }
  }
}

// Register version IPC handlers immediately so preload can query version synchronously anytime
ipcMain.on('get-app-version-sync', (event) => {
  try {
    event.returnValue = app.isReady() ? app.getVersion() : pkg.version;
  } catch {
    event.returnValue = pkg.version;
  }
});

ipcMain.handle('get-app-version', () => {
  try {
    return app.isReady() ? app.getVersion() : pkg.version;
  } catch {
    return pkg.version;
  }
});

function initUpdater(mainWindow) {
  if (isInitialized) return;
  isInitialized = true;

  try {
    updateStatus.currentVersion = app.getVersion();
  } catch {
    updateStatus.currentVersion = pkg.version;
  }

  ipcMain.handle('updater:get-status', () => {
    return {
      ...updateStatus,
      currentVersion: app.isReady() ? app.getVersion() : updateStatus.currentVersion,
    };
  });

  ipcMain.handle('updater:check-for-updates', async () => {
    if (!app.isPackaged) {
      console.log('[Updater] App is not packaged (dev mode). Returning dev info.');
      updateStatus = {
        status: 'not-available',
        info: { version: app.getVersion() },
        progress: null,
        error: null,
        currentVersion: app.getVersion(),
        isDev: true,
      };
      broadcastStatus(mainWindow);
      return updateStatus;
    }

    const au = getAutoUpdater();
    if (!au) {
      updateStatus = {
        ...updateStatus,
        status: 'error',
        error: 'electron-updater could not be loaded',
      };
      broadcastStatus(mainWindow);
      return updateStatus;
    }

    try {
      updateStatus = { ...updateStatus, status: 'checking', error: null };
      broadcastStatus(mainWindow);
      const result = await au.checkForUpdates();
      return {
        ...updateStatus,
        updateInfo: result?.updateInfo,
      };
    } catch (err) {
      const errorMsg = err?.message || 'Failed to check for updates';
      updateStatus = {
        ...updateStatus,
        status: 'error',
        error: errorMsg,
      };
      broadcastStatus(mainWindow);
      return updateStatus;
    }
  });

  ipcMain.handle('updater:start-download', async () => {
    if (!app.isPackaged) {
      console.log('[Updater] Cannot download updates in unpacked dev mode.');
      return { success: false, error: 'Cannot download updates in development mode' };
    }

    const au = getAutoUpdater();
    if (!au) {
      return { success: false, error: 'electron-updater could not be loaded' };
    }

    try {
      updateStatus = { ...updateStatus, status: 'downloading', error: null };
      broadcastStatus(mainWindow);
      await au.downloadUpdate();
      return { success: true };
    } catch (err) {
      const errorMsg = err?.message || 'Failed to download update';
      updateStatus = {
        ...updateStatus,
        status: 'error',
        error: errorMsg,
      };
      broadcastStatus(mainWindow);
      return { success: false, error: errorMsg };
    }
  });

  ipcMain.handle('updater:quit-and-install', () => {
    if (!app.isPackaged) {
      console.log('[Updater] Restart requested in dev mode.');
      app.relaunch();
      app.exit(0);
      return;
    }
    const au = getAutoUpdater();
    if (au) {
      au.quitAndInstall(false, true);
    }
  });

  // Try initializing autoUpdater instance
  const au = getAutoUpdater();
  if (!au) {
    console.warn('[Updater] electron-updater module not available. Auto-update disabled.');
    return;
  }

  // Configure autoUpdater
  au.autoDownload = false; // Manual download initiation per specification
  au.autoInstallOnAppQuit = true;

  // Logger
  au.logger = {
    info: (msg) => console.log(`[Updater] ${msg}`),
    warn: (msg) => console.warn(`[Updater] ${msg}`),
    error: (msg) => console.error(`[Updater] ${msg}`),
    debug: (msg) => console.debug(`[Updater] ${msg}`),
  };

  // Event handlers
  au.on('checking-for-update', () => {
    updateStatus = {
      ...updateStatus,
      status: 'checking',
      error: null,
    };
    broadcastStatus(mainWindow);
  });

  au.on('update-available', (info) => {
    console.log(`[Updater] Update available: v${info.version}`);
    updateStatus = {
      ...updateStatus,
      status: 'available',
      info: {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      },
      error: null,
    };
    broadcastStatus(mainWindow);
  });

  au.on('update-not-available', (info) => {
    console.log(`[Updater] No update available. Current: ${app.getVersion()}`);
    updateStatus = {
      ...updateStatus,
      status: 'not-available',
      info: {
        version: info?.version || app.getVersion(),
      },
      error: null,
    };
    broadcastStatus(mainWindow);
  });

  au.on('download-progress', (progressObj) => {
    updateStatus = {
      ...updateStatus,
      status: 'downloading',
      progress: {
        percent: Math.round(progressObj.percent || 0),
        bytesPerSecond: progressObj.bytesPerSecond || 0,
        transferred: progressObj.transferred || 0,
        total: progressObj.total || 0,
      },
      error: null,
    };
    broadcastStatus(mainWindow);
  });

  au.on('update-downloaded', (info) => {
    console.log(`[Updater] Update downloaded: v${info.version}`);
    updateStatus = {
      ...updateStatus,
      status: 'downloaded',
      info: {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      },
      error: null,
    };
    broadcastStatus(mainWindow);
  });

  au.on('error', (err) => {
    const errorMsg = err?.message || String(err) || 'Update check failed';
    console.error('[Updater] Error:', errorMsg);
    updateStatus = {
      ...updateStatus,
      status: 'error',
      error: errorMsg,
    };
    broadcastStatus(mainWindow);
  });

  // Background check on startup for packaged production apps
  if (app.isPackaged) {
    setTimeout(() => {
      try {
        console.log('[Updater] Performing initial background update check...');
        au.checkForUpdates().catch((err) => {
          console.warn('[Updater] Background update check error:', err.message);
        });
      } catch (err) {
        console.warn('[Updater] Background check failed to start:', err);
      }
    }, 10000);
  }
}

module.exports = {
  initUpdater,
  getUpdateStatus: () => ({ ...updateStatus, currentVersion: app.isReady() ? app.getVersion() : pkg.version }),
};
