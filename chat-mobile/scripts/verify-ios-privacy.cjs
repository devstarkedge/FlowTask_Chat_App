// Resolve every Expo iOS Info.plist mod, rather than checking app.json alone.
// Run: node scripts/verify-ios-privacy.cjs [--output <resolved.plist>] [--plist <native/Info.plist>]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const plist = require('@expo/plist');

const projectRoot = path.resolve(__dirname, '..');
const keys = [
  'NSPhotoLibraryUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
];
const source = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
const purposeStrings = source.ios.infoPlist;
const cli = require.resolve('expo/bin/cli');
const result = spawnSync(process.execPath, [cli, 'config', '--type', 'introspect', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || 'Expo config introspection failed');
const resolved = JSON.parse(result.stdout);
const nativePlist = resolved._internal?.modResults?.ios?.infoPlist;
assert.ok(nativePlist, 'Expo did not execute the iOS Info.plist mods');

// These plugin options override ios.infoPlist. Keep the descriptions in one place.
const overrideOptions = ['photosPermission', 'savePhotosPermission', 'cameraPermission', 'microphonePermission'];
for (const plugin of resolved.plugins || []) {
  if (!Array.isArray(plugin)) continue;
  for (const option of overrideOptions) {
    assert.equal(Object.hasOwn(plugin[1] || {}, option), false,
      `${plugin[0]}.${option} competes with ios.infoPlist`);
  }
}

function verify(actual, label) {
  for (const key of keys) {
    assert.equal(actual[key], purposeStrings[key], `${label}: ${key} was overwritten`);
    assert.match(actual[key], /workspace channels and conversations/);
    assert.match(actual[key], /For example,/);
    assert.doesNotMatch(actual[key], /^Allow .* to access your/);
  }
  assert.equal(actual.CFBundleShortVersionString, source.version, `${label}: marketing version changed`);
  console.log(`PASS: ${label} has all four canonical media purpose strings`);
}

verify(nativePlist, 'Expo iOS Info.plist mod output');
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  assert.ok(['--output', '--plist'].includes(args[i]) && args[i + 1], 'Expected --output <path> or --plist <path>');
  const filename = path.resolve(args[i + 1]);
  if (args[i] === '--output') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, plist.default.build(nativePlist));
    console.log(`Wrote resolved plist for inspection: ${filename}`);
  }
  // Parse the disk plist too, including an independently generated native plist if supplied.
  verify(plist.default.parse(fs.readFileSync(filename, 'utf8')), filename);
}

console.log(JSON.stringify(Object.fromEntries(keys.map(key => [key, nativePlist[key]])), null, 2));
console.log(`Marketing version: ${source.version}. Local plist build ${nativePlist.CFBundleVersion} is a placeholder; EAS production uses its remote build number.`);
