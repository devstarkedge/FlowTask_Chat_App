const { app, BrowserWindow, ipcMain, shell, session, Menu, Tray } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

if (isDev) {
  // Vite requires unsafe-eval for HMR. We disable the warning in dev mode.
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
  // Use a separate user data path for development so it doesn't mix with production builds
  app.setPath('userData', path.join(app.getPath('appData'), `${app.name}-dev`));
}

// Set the App ID for all platforms (Windows, Mac, Linux) to ensure OS-level integrations work
app.setAppUserModelId(isDev ? 'com.taskchat.dev' : 'com.taskchat.app');

let mainWindow;
let tray = null;
let isQuitting = false;
const hasTitleBarOverlay = process.platform === 'win32' || process.platform === 'linux';
const overlayWindows = new WeakSet();
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    title: 'TaskChat',
    icon: path.join(__dirname, isDev ? '../public/logo.png' : '../dist/logo.png'),
    titleBarStyle: 'hidden',
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

  if (isDev) {
    // In development, load the Vite dev server
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built React app
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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
      // Hide from dock on macOS
      if (process.platform === 'darwin' && app.dock) {
        app.dock.hide();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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

app.whenReady().then(() => {
  createWindow();

  // Create System Tray
  const iconPath = path.join(__dirname, isDev ? '../public/logo.png' : '../dist/logo.png');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open TaskChat', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          if (process.platform === 'darwin' && app.dock) app.dock.show();
        }
      } 
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('TaskChat');
  tray.setContextMenu(contextMenu);
  
  // Left click on tray icon opens the app
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        if (process.platform === 'darwin' && app.dock) app.dock.show();
      }
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handler for notifications
ipcMain.on('show-notification', (event, { title, body, data }) => {
  const { Notification } = require('electron');
  const notification = new Notification({
    title,
    body,
    icon: path.join(__dirname, isDev ? '../public/logo.png' : '../dist/logo.png'),
  });

  notification.on('click', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
        if (process.platform === 'darwin' && app.dock) app.dock.show();
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.send('notification-clicked', data);
    }
  });

  notification.show();
});

// Allow renderer to change titleBarOverlay dynamically
ipcMain.on('set-title-bar-overlay', (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  // The method exists even on windows created without an overlay. Only update
  // windows we enabled, and ignore late events after their window has closed.
  if (!win || win.isDestroyed() || !overlayWindows.has(win)) return;
  if (!options || typeof options.symbolColor !== 'string') return;
  try {
    win.setTitleBarOverlay({ symbolColor: options.symbolColor });
  } catch (error) {
    console.error('[TaskChat] Failed to update window controls:', error);
  }
});
