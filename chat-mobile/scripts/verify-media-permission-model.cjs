const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const { parse } = require('@babel/parser');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const filename = path.join(root, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(transformSync(fs.readFileSync(filename, 'utf8'), { loader: filename.endsWith('.ts') ? 'ts' : 'jsx', format: 'cjs' }).code, filename);
  return mod.exports;
}
function handler(file, name, context) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  let fn;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === name) fn = node.init;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  }
  visit(ast); assert.ok(fn, `Missing ${name} in ${file}`);
  return vm.runInNewContext(`(${source.slice(fn.start, fn.end)})`, context);
}
(async () => {
  // Execute SDK 57's actual throwing root API, rather than assuming its old
  // function-shaped exports are compatible with the application's adapter.
  const warnings = load('node_modules/expo-media-library/src/legacyWarnings.ts');
  const warn = console.warn; console.warn = () => {};
  try {
    await assert.rejects(warnings.getAssetsAsync(), /expo-media-library\/legacy/);
    await assert.rejects(warnings.getAssetInfoAsync('asset'), /expo-media-library\/legacy/);
    await assert.rejects(warnings.createAssetAsync('file:///photo.jpg'), /expo-media-library\/legacy/);
  } finally { console.warn = warn; }
  const calls = [];
  const legacy = {
    getPermissionsAsync: async (...args) => { calls.push(['check', ...args]); return { status: 'granted', granted: true }; },
    requestPermissionsAsync: async (...args) => { calls.push(['request', ...args]); return { status: 'granted', granted: true }; },
    getAssetsAsync: async () => ({ assets: [{ id: 'photo' }] }), getAssetInfoAsync: async id => ({ id, localUri: 'file:///photo.jpg' }),
    createAssetAsync: async uri => ({ id: 'saved', uri }), SortBy: { creationTime: 'creationTime' },
    saveToLibraryAsync: async uri => { calls.push(['save', uri]); },
  };
  const logger = { __esModule: true, default: { warn() {}, info() {}, error() {} } };
  const media = load('src/utils/safeMediaLibrary.js', { 'expo-media-library/legacy': legacy, 'expo-media-library': warnings, './logger': logger });
  await media.getPermissionsAsync();
  assert.deepEqual(calls, [['check', false, ['photo', 'video']]]);
  assert.equal((await media.getAssetsAsync()).assets[0].id, 'photo');
  assert.equal((await media.getAssetInfoAsync('photo')).localUri, 'file:///photo.jpg');
  const adapter = load('src/services/FileSystemAdapter.js', {
    'expo-file-system/legacy': {}, 'expo-sharing': { isAvailableAsync: async () => false },
    '../utils/safeMediaLibrary': { __esModule: true, default: media.default },
  }).FileSystemAdapter;
  await adapter.saveToGallery('file:///photo.jpg');
  assert.deepEqual(calls.at(-2), ['request', true, ['photo', 'video']]);
  assert.deepEqual(calls.at(-1), ['save', 'file:///photo.jpg']);
  const download = load('src/utils/fileDownload.js', {
    'expo-file-system/legacy': { cacheDirectory: 'file:///cache/', downloadAsync: async () => ({ status: 200, uri: 'file:///photo.jpg' }) },
    './safeMediaLibrary': { __esModule: true, default: media.default },
    'expo-sharing': {}, 'react-native': { Platform: { OS: 'ios' } },
    'react-native-toast-message': { __esModule: true, default: { show() {} } }, './logger': logger,
  });
  assert.equal(await download.downloadAndSaveFile('https://example.invalid/photo.jpg', 'photo.jpg', 'image/jpeg'), true);
  assert.deepEqual(calls.at(-2), ['request', true, ['photo', 'video']]);
  assert.deepEqual(calls.at(-1), ['save', 'file:///photo.jpg']);
  legacy.saveToLibraryAsync = async () => { throw new Error('Save failed'); };
  await assert.rejects(media.saveToLibraryAsync('file:///photo.jpg'), /Save failed/);
  console.log('PASS actual SDK root methods throw; supported legacy adapter reads assets; preview checks only photo/video; explicit gallery saves request add-only access');

  for (const os of ['ios', 'android']) {
    const selected = [];
    const context = { Platform: { OS: os }, canManage: true, isCurrentWorkspace: () => true,
      ImagePicker: { launchImageLibraryAsync: async options => { selected.push(options); return { canceled: true }; },
        requestMediaLibraryPermissionsAsync: () => { throw new Error('Unnecessary broad library permission requested'); } },
      Alert: { alert: () => { throw new Error('Permission denial blocked the system picker'); } }, logger: logger.default,
    };
    await handler('src/screens/Canvas/CanvasListScreen.jsx', 'handlePickImage', context)();
    await handler('src/screens/Canvas/CanvasEditorScreen.jsx', 'handleInsertOption', context)('image');
    await handler('src/components/workspace/CreateWorkspaceModal.jsx', 'handlePickImage', context)();
    await handler('src/screens/workspace/WorkspaceSettingsScreen.jsx', 'handlePickLogo', context)();
    assert.equal(selected.length, 4);
    assert.ok(selected.every(options => options.mediaTypes.length === 1 && options.mediaTypes[0] === 'images'));
    console.log(`PASS ${os}: actual canvas/workspace picker callbacks open selection without requesting or gating on full library permission`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
