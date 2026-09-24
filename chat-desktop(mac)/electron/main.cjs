const { app, BrowserWindow, ipcMain, shell, session, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { createDynamicTrayImage } = require('./trayGenerator.cjs');
const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';

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
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    title: 'TaskChat',
    icon: path.join(__dirname, isDev ? '../public/logo.png' : '../dist/logo.png'),
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
      if (isMac && app.dock) {
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
  setupMacApplicationMenu();

  // Set Dock icon for macOS explicitly
  const logoPath = path.join(__dirname, isDev ? '../public/logo.png' : '../dist/logo.png');
  if (isMac && app.dock) {
    try {
      const dockImage = nativeImage.createFromPath(logoPath);
      if (!dockImage.isEmpty()) {
        app.dock.setIcon(dockImage);
      }
    } catch (e) {
      console.error('[TaskChat] Failed to set dock icon:', e);
    }
  }

  createWindow();

  // Create System Tray dynamically from logoPath at runtime
  const trayImage = createDynamicTrayImage(logoPath, isMac);
  tray = new Tray(trayImage);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open TaskChat', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          if (isMac && app.dock) app.dock.show();
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
        if (isMac && app.dock) app.dock.show();
      }
    }
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
        if (isMac && app.dock) app.dock.show();
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
  if (!win || win.isDestroyed() || !overlayWindows.has(win)) return;
  if (!options || typeof options.symbolColor !== 'string') return;
  try {
    win.setTitleBarOverlay({ symbolColor: options.symbolColor });
  } catch (error) {
    console.error('[TaskChat] Failed to update window controls:', error);
  }
});
