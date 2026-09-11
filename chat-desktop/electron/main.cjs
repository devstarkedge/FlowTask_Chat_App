const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

if (isDev) {
  // Vite requires unsafe-eval for HMR. We disable the warning in dev mode.
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
  // Use a separate user data path for development so it doesn't mix with production builds
  app.setPath('userData', path.join(app.getPath('appData'), `${app.name}-dev`));
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    title: 'TaskChat',
    icon: path.join(__dirname, '../public/logo.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#ffffff',
      height: 48,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // In development, load the Vite dev server
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built React app
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open external links in default browser instead of the Electron app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

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
    icon: path.join(__dirname, '../public/logo.png'),
  });

  notification.on('click', () => {
    if (mainWindow) {
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
  if (win && win.setTitleBarOverlay) {
    win.setTitleBarOverlay(options);
  }
});
