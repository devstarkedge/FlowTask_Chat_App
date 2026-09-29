const { app, BrowserWindow, ipcMain, shell, session, Menu, Tray, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const startTime = performance.now();
const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';
const BUNDLE_ID = isDev ? 'com.taskchat.dev' : 'com.taskchat.app';

if (isDev) {
  // Vite requires unsafe-eval for HMR. We disable the warning in dev mode.
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
  // Use a separate user data path for development so it doesn't mix with production builds
  app.setPath('userData', path.join(app.getPath('appData'), `${app.name}-dev`));
}

// Set the App ID for all platforms (Windows, Mac, Linux) to ensure OS-level integrations work
app.setAppUserModelId(BUNDLE_ID);

let mainWindow;
let tray = null;
let isQuitting = false;
const hasTitleBarOverlay = process.platform === 'win32' || process.platform === 'linux';
const overlayWindows = new WeakSet();

// Persistent Set to retain Notification instances and prevent V8 garbage collection on macOS
const activeNotifications = new Set();

function setupMacApplicationMenu() {
  if (!isMac) return;
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: `Quit ${app.name}`,
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const winStart = performance.now();
  console.log(`[Startup] createWindow start after ${(winStart - startTime).toFixed(2)}ms`);

  const iconPath = path.join(__dirname, isDev ? '../public/logo.png' : '../dist/logo.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    title: 'TaskChat',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    ...(hasTitleBarOverlay ? {
      titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 48 },
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  if (hasTitleBarOverlay) overlayWindows.add(mainWindow);

  const loadStart = performance.now();
  if (isDev) {
    console.log(`[Startup] renderer loadURL start after ${(loadStart - startTime).toFixed(2)}ms`);
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    console.log(`[Startup] renderer loadFile start after ${(loadStart - startTime).toFixed(2)}ms`);
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    console.log(`[Startup] renderer did-finish-load at ${(performance.now() - startTime).toFixed(2)}ms`);
  });

  // Notify renderer when window maximize state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-change', false);
  });

  // Open external links in default browser instead of the Electron app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Prevent closing, hide to tray instead
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (isMac && app.dock) {
        app.dock.hide();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  console.log(`[Startup] createWindow complete after ${(performance.now() - winStart).toFixed(2)}ms`);
}

// IPC handlers for window control buttons
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) win.close();
});

ipcMain.handle('window-is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return win ? win.isMaximized() : false;
});

// IPC handler for notification diagnostics
ipcMain.handle('get-notification-status', () => {
  const isSupported = Notification.isSupported();
  return {
    platform: process.platform,
    isMac: isMac,
    supported: isSupported,
    appUserModelId: BUNDLE_ID,
    activeCount: activeNotifications.size,
    initialized: true,
  };
});

app.whenReady().then(() => {
  console.log(`[Startup] app.whenReady after ${(performance.now() - startTime).toFixed(2)}ms`);
  setupMacApplicationMenu();

  // Create BrowserWindow immediately so renderer boots as early as possible
  createWindow();

  // Defer non-critical OS integrations (dock icon and tray) so they do not block startup
  setImmediate(() => {
    // Set Dock icon for macOS if needed
    if (isMac && app.dock) {
      try {
        const logoPath = path.join(__dirname, isDev ? '../public/logo.png' : '../dist/logo.png');
        if (fs.existsSync(logoPath)) {
          const dockImage = nativeImage.createFromPath(logoPath);
          if (!dockImage.isEmpty()) {
            app.dock.setIcon(dockImage);
          }
        }
      } catch (e) {
        console.error('[TaskChat] Failed to set dock icon:', e);
      }
    }

    // System Tray initialization
    const trayStart = performance.now();
    try {
      const trayIconPath = path.join(
        __dirname,
        isDev ? '../public/tray-icon.png' : '../dist/tray-icon.png'
      );
      const logoPath = path.join(__dirname, isDev ? '../public/logo.png' : '../dist/logo.png');
      const targetTrayPath = fs.existsSync(trayIconPath) ? trayIconPath : logoPath;

      let trayImage = nativeImage.createFromPath(targetTrayPath);
      if (!trayImage.isEmpty()) {
        const size = trayImage.getSize();
        if (size.height > 22) {
          const aspectRatio = size.width / size.height;
          const targetWidth = Math.round(22 * aspectRatio);
          trayImage = trayImage.resize({ width: targetWidth, height: 22, quality: 'best' });
        }
        if (isMac) {
          trayImage.setTemplateImage(true);
        }
      }

      if (!trayImage.isEmpty()) {
        tray = new Tray(trayImage);
        const contextMenu = Menu.buildFromTemplate([
          {
            label: 'Open TaskChat',
            click: () => {
              if (mainWindow) {
                mainWindow.show();
                if (isMac && app.dock) app.dock.show();
              }
            },
          },
          { type: 'separator' },
          {
            label: 'Quit',
            click: () => {
              isQuitting = true;
              app.quit();
            },
          },
        ]);
        tray.setToolTip('TaskChat');
        tray.setContextMenu(contextMenu);

        tray.on('click', () => {
          if (mainWindow) {
            if (mainWindow.isVisible()) {
              mainWindow.focus();
            } else {
              mainWindow.show();
              if (isMac && app.dock) app.dock.show();
            }
          }
        });
      }
    } catch (err) {
      console.error('[TaskChat] Failed to initialize system tray:', err);
    }
    console.log(`[Startup] tray initialization complete after ${(performance.now() - trayStart).toFixed(2)}ms`);
  });

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      if (isMac && app.dock) app.dock.show();
      mainWindow.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  const isSupported = Notification.isSupported();
  console.log(`[Notifications] platform: ${process.platform} | appUserModelId: ${BUNDLE_ID} | supported: ${isSupported} | notificationInitialized: true`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// GC-safe IPC handler for native notifications
ipcMain.on('show-notification', (event, { title, body, data }) => {
  try {
    if (!Notification.isSupported()) {
      console.warn('[Notifications] Electron Notification API is not supported on this platform');
      return;
    }

    const iconPath = path.join(__dirname, isDev ? '../public/logo.png' : '../dist/logo.png');
    const hasIcon = fs.existsSync(iconPath);

    const notificationOptions = {
      title: title || 'TaskChat',
      body: body || '',
    };
    if (hasIcon) {
      notificationOptions.icon = iconPath;
    }

    const notification = new Notification(notificationOptions);

    // Add to active set to prevent V8 GC from garbage collecting the notification before display/click
    activeNotifications.add(notification);

    const cleanup = () => {
      activeNotifications.delete(notification);
    };

    notification.on('click', () => {
      cleanup();
      if (mainWindow) {
        if (!mainWindow.isVisible()) {
          mainWindow.show();
          if (isMac && app.dock) app.dock.show();
        }
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.send('notification-clicked', data);
      }
    });

    notification.on('close', cleanup);
    notification.on('failed', (error) => {
      console.error('[Notifications] Failed to display native notification:', error);
      cleanup();
    });

    notification.show();
    console.log(`[Notifications] Displayed native notification: "${title}" (active count: ${activeNotifications.size})`);
  } catch (err) {
    console.error('[Notifications] Exception in show-notification handler:', err);
  }
});

// Allow renderer to change titleBarOverlay dynamically
ipcMain.on('set-title-bar-overlay', (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || !overlayWindows.has(win)) return;
  if (!options || typeof options.symbolColor !== 'string') return;
  try {
    win.setTitleBarOverlay({ symbolColor: options.symbolColor });
  } catch (error) {
    console.error('[TaskChat] Failed to update window controls:', error);
  }
});
