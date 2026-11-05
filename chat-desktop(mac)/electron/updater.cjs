const { app, ipcMain } = require('electron');
const pkg = require('../package.json');

let isInitialized = false;
let autoUpdater = null;
let downloadedFilePath = null;
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

function initUpdater(mainWindow, options = {}) {
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
    if (typeof options?.setQuitting === 'function') {
      options.setQuitting();
    }
    if (!app.isPackaged) {
      console.log('[Updater] Restart requested in dev mode.');
      app.relaunch();
      app.exit(0);
      return;
    }

    // On macOS, unsigned apps are blocked from restarting by Squirrel.Mac.
    // Use native ditto helper script to cleanly extract, replace .app, and relaunch.
    if (process.platform === 'darwin') {
      const fs = require('fs');
      const path = require('path');
      const { spawn } = require('child_process');

      const pendingDir = path.join(app.getPath('userCache'), 'client-updater', 'pending');
      let pendingZips = [];
      try {
        if (fs.existsSync(pendingDir)) {
          pendingZips = fs.readdirSync(pendingDir)
            .filter((f) => f.endsWith('.zip'))
            .map((f) => path.join(pendingDir, f))
            .sort((a, b) => {
              try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
            });
        }
      } catch {}

      const possibleZipPaths = [
        downloadedFilePath,
        path.join(app.getPath('userCache'), 'client-updater', 'update.zip'),
        path.join(pendingDir, `TaskChat-${updateStatus?.info?.version || ''}-universal-mac.zip`),
        ...pendingZips,
      ].filter(Boolean);

      const zipPath = possibleZipPaths.find((p) => {
        try { return fs.existsSync(p) && fs.statSync(p).size > 1000000; } catch { return false; }
      });
      const appBundlePath = path.resolve(process.execPath, '../../..');

      if (zipPath && appBundlePath.endsWith('.app') && fs.existsSync(appBundlePath)) {
        console.log(`[Updater] Applying update via macOS helper from ${zipPath} to ${appBundlePath}`);
        const script = `
          while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done
          TEMP_DIR=$(mktemp -d /tmp/taskchat_update_XXXXXX)
          if /usr/bin/ditto -xk "${zipPath}" "$TEMP_DIR"; then
            NEW_APP=$(find "$TEMP_DIR" -maxdepth 1 -name "*.app" | head -n 1)
            if [ -d "$NEW_APP" ]; then
              /usr/bin/xattr -rd com.apple.quarantine "$NEW_APP" 2>/dev/null
              rm -rf "${appBundlePath}"
              mv "$NEW_APP" "${appBundlePath}"
              /usr/bin/open -n "${appBundlePath}"
              rm -rf "$TEMP_DIR"
              exit 0
            fi
          fi
          rm -rf "$TEMP_DIR"
          /usr/bin/open -n "${appBundlePath}"
        `;

        try {
          const child = spawn('/bin/sh', ['-c', script], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
          app.exit(0);
          return;
        } catch (spawnErr) {
          console.error('[Updater] Failed to launch macOS update helper:', spawnErr);
        }
      }
    }

    const au = getAutoUpdater();
    if (au) {
      try {
        console.log('[Updater] Calling quitAndInstall...');
        au.quitAndInstall(false, true);
      } catch (err) {
        console.error('[Updater] quitAndInstall threw error:', err);
        app.relaunch();
        app.exit(0);
      }
    }
  });

  // Try initializing autoUpdater instance
  const au = getAutoUpdater();
  if (!au) {
    console.warn('[Updater] electron-updater module not available. Auto-update disabled.');
    return;
  }

  // Configure autoUpdater
  au.autoDownload = true; // Automatically download new updates in background
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
    downloadedFilePath = info?.downloadedFile || null;
    console.log(`[Updater] Update downloaded: v${info.version}, file: ${downloadedFilePath}`);
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

  // Background check on startup and periodically for packaged production apps
  if (app.isPackaged) {
    // Initial check shortly after startup (5 seconds)
    setTimeout(() => {
      try {
        console.log('[Updater] Performing initial background update check...');
        au.checkForUpdates().catch((err) => {
          console.warn('[Updater] Background update check error:', err.message);
        });
      } catch (err) {
        console.warn('[Updater] Background check failed to start:', err);
      }
    }, 5000);

    // Periodic check every 30 minutes
    setInterval(() => {
      try {
        console.log('[Updater] Performing periodic background update check...');
        au.checkForUpdates().catch((err) => {
          console.warn('[Updater] Periodic update check error:', err.message);
        });
      } catch (err) {
        console.warn('[Updater] Periodic check failed to start:', err);
      }
    }, 30 * 60 * 1000);
  }
}

module.exports = {
  initUpdater,
  getUpdateStatus: () => ({ ...updateStatus, currentVersion: app.isReady() ? app.getVersion() : pkg.version }),
};
