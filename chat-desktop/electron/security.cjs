const path = require('node:path');
const {fileURLToPath} = require('node:url');

function createTrustedAppUrl({isDev, indexPath}) {
  return value => {
    try {
      const url = new URL(value);
      if (isDev) return url.origin === 'http://localhost:5174' && !url.username && !url.password;
      if (url.protocol !== 'file:' || url.host || url.search) return false;
      url.hash = '';
      return path.resolve(fileURLToPath(url)) === path.resolve(indexPath);
    } catch { return false; }
  };
}

function installWindowSecurity(window, options) {
  const trusted = createTrustedAppUrl(options);
  const contents = window.webContents;
  const allowed = new Set(['media', 'display-capture', 'notifications', 'speaker-selection', 'fullscreen', 'clipboard-sanitized-write']);
  const permitted = (sender, permission, details) => sender === contents && !contents.isDestroyed() &&
    details?.isMainFrame === true && trusted(contents.getURL()) && trusted(details.requestingUrl) && allowed.has(permission);
  contents.session.setPermissionCheckHandler((sender, permission, _origin, details) => permitted(sender, permission, details));
  contents.session.setPermissionRequestHandler((sender, permission, callback, details) => callback(permitted(sender, permission, details)));
  contents.on('will-navigate', (event, url) => { if (!trusted(url)) event.preventDefault(); });
  // Embedded web pages must not inherit this app's capture privileges.
  contents.on('will-attach-webview', event => event.preventDefault());
}

module.exports = {createTrustedAppUrl, installWindowSecurity};
