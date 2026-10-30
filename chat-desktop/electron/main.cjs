const { installHuddleInvitations } = require('./huddleInvitations.cjs');
const { createIncomingCallWindow } = require('./incomingCallWindow.cjs');
const { installDisplayCapture } = require('./sourcePicker.cjs');
const { installWindowSecurity } = require('./security.cjs');
const { installHuddlePopout } = require('./huddlePopout.cjs');
const { app, BrowserWindow, ipcMain, shell, session, Menu, Tray, nativeTheme, desktopCapturer, dialog, Notification, screen, clipboard, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const isDev = !app.isPackaged;

function getNotificationIconPath() {
  const defaultDevIcon = path.join(__dirname, '../public/logo.png');
  if (isDev) return defaultDevIcon;
  try {
    const extractedPath = path.join(app.getPath('userData'), 'notification-icon.png');
    if (!fs.existsSync(extractedPath)) {
      const bundledPath = path.join(__dirname, '../dist/logo.png');
      if (fs.existsSync(bundledPath)) {
        fs.writeFileSync(extractedPath, fs.readFileSync(bundledPath));
      }
    }
    if (fs.existsSync(extractedPath)) return extractedPath;
  } catch (err) {
    console.error('[TaskChat] Failed to extract notification icon:', err);
  }
  return path.join(__dirname, '../dist/logo.png');
}

const isUnpackedPreview = app.isPackaged && process.platform === 'win32' &&
  path.basename(path.dirname(process.execPath)).toLowerCase() === 'win-unpacked';
// Explicit isolated profile for two-client calling checks. Normal launches
// keep their existing profile, single-instance lock and notification identity.
const callingTestProfile = process.argv.find(value=>value.startsWith('--calling-test-profile='))?.split('=')[1];
if(callingTestProfile && !/^[a-z0-9-]{1,40}$/.test(callingTestProfile)) {
  throw new Error('Invalid calling test profile');
}

if (isDev) {
  // Vite requires unsafe-eval for HMR. We disable the warning in dev mode.
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
  // Use a separate user data path for development so it doesn't mix with production builds
  app.setPath('userData', path.join(app.getPath('appData'), `${app.name}-dev`));
}
// An unpacked build must not hold the installed app's profile and startup lock.
if (isUnpackedPreview) app.setPath('userData', path.join(app.getPath('appData'), `${app.name}-preview`));
if(callingTestProfile)app.setPath('userData',path.join(app.getPath('temp'),`TaskChat-calling-${callingTestProfile}`));

// Set the App ID for all platforms (Windows, Mac, Linux) to ensure OS-level integrations work
app.setAppUserModelId(callingTestProfile ? `com.taskchat.callingtest.${callingTestProfile}` : isDev ? process.execPath : isUnpackedPreview ? 'com.taskchat.preview' : 'com.flowtask.chat');

let mainWindow;
let tray = null;
let isQuitting = false;
const hasTitleBarOverlay = process.platform === 'win32' || process.platform === 'linux';
const overlayWindows = new WeakSet();
app.on('before-quit', () => { isQuitting = true; });

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  if (process.platform === 'darwin' && app.dock) app.dock.show();
  mainWindow.moveTop();
  mainWindow.focus();
}

// Ensure single instance behavior — prevent second launch from opening unauthenticated LevelDB locked process
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  if (isDev) console.info('[TaskChat] TaskChat is already running. Bringing the existing window to the front.');
  app.quit();
  // Do not initialize windows, sessions or the tray in the duplicate process.
  return;
} else {
  app.on('second-instance', showMainWindow);
}
function createWindow() {
  const initialSymbolColor = (nativeTheme && nativeTheme.shouldUseDarkColors) ? '#ffffff' : '#0f172a';
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    title: 'TaskChat',
    show: false, // Wait until ready-to-show to prevent white screen flash
    backgroundColor: '#1E1E1E', // Dark background for the window to match app theme
    icon: path.join(__dirname, isDev ? '../public/logo.png' : '../dist/logo.png'),
    titleBarStyle: 'hidden',
    ...(hasTitleBarOverlay ? {
      titleBarOverlay: { color: '#00000000', symbolColor: initialSymbolColor, height: 48 },
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const capture=installDisplayCapture(mainWindow, {BrowserWindow,ipcMain,desktopCapturer,screen});
  const callWindow=mainWindow;
  installHuddleInvitations(callWindow,{ipcMain,Notification,
    createCallAlert:(invitation,onAction,onUnavailable)=>createIncomingCallWindow({BrowserWindow,ipcMain,screen,icon:path.join(__dirname,isDev?'../public/logo.png':'../dist/logo.png')},invitation,onAction,onUnavailable),
    icon:path.join(__dirname,isDev?'../public/logo.png':'../dist/logo.png'),
    showWindow:()=>{if(callWindow.isMinimized())callWindow.restore();callWindow.show();if(process.platform==='darwin' && app.dock)app.dock.show();callWindow.focus();}});


  mainWindow.once('ready-to-show', showMainWindow);
  mainWindow.on('focus', () => {
    try {
      mainWindow.flashFrame(false);
    } catch {}
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

  const security=installWindowSecurity(mainWindow, {isDev, indexPath:path.join(__dirname, '../dist/index.html')});
  installHuddlePopout(mainWindow,{BrowserWindow,ipcMain,capture,security,icon:path.join(__dirname,isDev?'../public/logo.png':'../dist/logo.png'),openExternal:url=>shell.openExternal(url)});

  // Notify renderer when window maximize state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-change', false);
  });

  // Context menu on right-click (Copy Image, Copy Image Address, Copy, Paste, etc.)
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menuTemplate = [];
    if (params.mediaType === 'image') {
      menuTemplate.push({
        label: 'Copy Image',
        click: () => mainWindow.webContents.copyImageAt(params.x, params.y),
      });
      if (params.srcURL) {
        menuTemplate.push({
          label: 'Copy Image Address',
          click: () => clipboard.writeText(params.srcURL),
        });
      }
      menuTemplate.push({ type: 'separator' });
    }
    if (params.selectionText) {
      menuTemplate.push({ role: 'copy' });
    }
    if (params.isEditable) {
      menuTemplate.push({ role: 'cut' });
      menuTemplate.push({ role: 'paste' });
      menuTemplate.push({ role: 'selectAll' });
    }
    if (menuTemplate.length > 0) {
      const contextMenu = Menu.buildFromTemplate(menuTemplate);
      contextMenu.popup({ window: mainWindow });
    }
  });


  // Open external links in default browser instead of the Electron app

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
ipcMain.on('show-notification', (event, { title, body, data, icon }) => {
  let notifIcon = getNotificationIconPath();
  if (icon && typeof icon === 'string' && icon.startsWith('data:image/')) {
    try {
      notifIcon = nativeImage.createFromDataURL(icon);
    } catch {}
  }

  const notification = new Notification({
    title: title || 'TaskChat',
    body: body || '',
    icon: notifIcon,
  });

  notification.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
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

// IPC handler for taskbar badge overlay
ipcMain.on('update-taskbar-badge', (event, { count, dataUrl, description }) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const numCount = Number(count) || 0;

  if (app.setBadgeCount) {
    try {
      app.setBadgeCount(numCount);
    } catch (err) {
      console.warn('[TaskChat] Failed to set badge count:', err);
    }
  }

  if (win && !win.isDestroyed()) {
    if (process.platform === 'win32') {
      try {
        if (numCount > 0 && dataUrl) {
          const img = nativeImage.createFromDataURL(dataUrl);
          const desc = description || `${numCount} unread notification${numCount > 1 ? 's' : ''}`;
          win.setOverlayIcon(img, desc);
        } else {
          win.setOverlayIcon(null, '');
        }
      } catch (err) {
        console.error('[TaskChat] Failed to set taskbar overlay icon:', err);
      }
    }
  }
});

// IPC handler for window flash frame (attract attention)
ipcMain.on('flash-frame', (event, flag) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    try {
      win.flashFrame(Boolean(flag));
    } catch (err) {
      console.error('[TaskChat] Failed to toggle flash frame:', err);
    }
  }
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
