const fs = require('node:fs/promises');
const path = require('node:path');
const { withFinalizedMod } = require('@expo/config-plugins');

async function applyLauncherInset(platformProjectRoot, insetPercent) {
  if (!Number.isFinite(insetPercent) || insetPercent < 0 || insetPercent >= 50) {
    throw new Error('Android launcher inset must be between 0 and 50 percent.');
  }
  const res = path.join(platformProjectRoot, 'app/src/main/res');
  const icons = ['ic_launcher.xml', 'ic_launcher_round.xml'];
  const original = '@mipmap/ic_launcher_foreground';
  const fitted = '@drawable/taskchat_launcher_foreground';
  // Check both outputs before writing; fail visibly if Expo's contract changes.
  const sources = await Promise.all(icons.map(name => fs.readFile(path.join(res, 'mipmap-anydpi-v26', name), 'utf8')));
  if (sources.some(xml => !xml.includes(original) && !xml.includes(fitted))) {
    throw new Error('Generated adaptive launcher foreground is missing.');
  }
  await fs.mkdir(path.join(res, 'drawable'), { recursive: true });
  await fs.writeFile(path.join(res, 'drawable/taskchat_launcher_foreground.xml'), `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="${original}"
    android:insetLeft="${insetPercent}%" android:insetTop="${insetPercent}%"
    android:insetRight="${insetPercent}%" android:insetBottom="${insetPercent}%" />
`);
  await Promise.all(icons.map((name, index) => fs.writeFile(path.join(res, 'mipmap-anydpi-v26', name), sources[index].replace(original, fitted))));
}

module.exports = (config, { insetPercent = 14 } = {}) => {
  if (!config.android?.adaptiveIcon?.foregroundImage) throw new Error('TaskChat requires an Android adaptive foreground.');
  // Finalized mods run AFTER Expo generates icons, including on EAS/prebuild.
  // The raster artwork, iOS icons, legacy icons and splash are not rewritten.
  return withFinalizedMod(config, ['android', async mod => {
    await applyLauncherInset(mod.modRequest.platformProjectRoot, insetPercent);
    return mod;
  }]);
};
module.exports.applyLauncherInset = applyLauncherInset;
