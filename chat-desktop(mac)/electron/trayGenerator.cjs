const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

/**
 * Fast tray image provider using dedicated tray-icon asset.
 */
function createDynamicTrayImage(logoPath, isMac = false) {
  try {
    const dir = path.dirname(logoPath);
    const trayPath = path.join(dir, 'tray-icon.png');
    const targetPath = fs.existsSync(trayPath) ? trayPath : logoPath;
    
    const trayImg = nativeImage.createFromPath(targetPath);
    if (isMac && !trayImg.isEmpty()) {
      trayImg.setTemplateImage(true);
    }
    return trayImg;
  } catch (err) {
    console.error('[TaskChat] Failed to load tray image:', err);
    const fallback = nativeImage.createFromPath(logoPath);
    if (isMac && !fallback.isEmpty()) fallback.setTemplateImage(true);
    return fallback;
  }
}

module.exports = { createDynamicTrayImage };
