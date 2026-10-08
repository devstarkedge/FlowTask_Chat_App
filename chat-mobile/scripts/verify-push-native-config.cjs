const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json'], {
  cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr);
const config = JSON.parse(result.stdout);
const mods = config._internal.modResults;
const androidManifest = mods.android.manifest.manifest;
// Gradle merges the notification library manifest into the application manifest.
const libraryManifest = fs.readFileSync(path.join(root, 'node_modules/expo-notifications/android/src/main/AndroidManifest.xml'), 'utf8');
assert.ok(androidManifest['uses-permission'].some(entry => entry.$['android:name'] === 'android.permission.POST_NOTIFICATIONS')
  || libraryManifest.includes('android.permission.POST_NOTIFICATIONS'));
assert.ok(!config.android.blockedPermissions?.includes('android.permission.POST_NOTIFICATIONS'));
assert.ok(['development', 'production'].includes(mods.ios.entitlements['aps-environment']));
const notifications = config.plugins.filter(plugin => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-notifications');
assert.equal(notifications.length, 1);
for (const sound of notifications[0][1].sounds) assert.ok(fs.existsSync(path.resolve(root, sound)));
assert.ok(config.extra.eas.projectId);
const firebase = JSON.parse(fs.readFileSync(path.join(root, config.android.googleServicesFile), 'utf8'));
assert.ok(firebase.client.some(entry => entry.client_info.android_client_info.package_name === config.android.package));
console.log(JSON.stringify({ verified: true, androidPackage: config.android.package,
  androidNotificationPermission: true, firebaseProject: firebase.project_info.project_id,
  iosBundle: config.ios.bundleIdentifier, generatedPushEntitlement: mods.ios.entitlements['aps-environment'],
  notificationPluginCount: notifications.length, soundAssetsPresent: true }, null, 2));
