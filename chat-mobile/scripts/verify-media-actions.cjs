const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');
const rootDir = path.resolve(__dirname, '..');
function load(file, mocks) {
  const filename = path.join(rootDir, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, filename);
  return mod.exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const assets = [{ uri: 'file:///photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' }, { uri: 'file:///clip.mp4', fileName: 'clip.mp4', mimeType: 'video/mp4' }];

async function verify(os) {
  const dom = new JSDOM('<div id="root"></div>');
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  const calls = [], alerts = [], selected = [], logs = [];
  let modal, nativeActive = false, openSheet, context, permission = { status: 'granted' }, pickerResult = { canceled: false, assets }, pickerError = null;
  let requestResult = { status: 'granted' }, permissionsByCapability = {};
  const native = {
    Platform: { OS: os }, Alert: { alert: (...args) => alerts.push(args) }, Linking: { openSettings: async () => calls.push('settings') },
    View: ({ children }) => React.createElement('div', {}, children), Text: ({ children }) => React.createElement('span', {}, children),
    TouchableOpacity: ({ children, onPress, disabled }) => React.createElement('button', { onClick: onPress, disabled }, children),
    Image: () => null, StyleSheet: { create: x => x, absoluteFillObject: {} },
    FlatList: ({ data, renderItem }) => React.createElement('div', {}, data.map(item => React.createElement(React.Fragment, { key: item.id }, renderItem({ item })))),
    Modal: props => { modal = props; if (props.visible) nativeActive = true; else if (os !== 'ios') nativeActive = false; return props.visible ? React.createElement('div', {}, props.children) : null; },
  };
  const permissions = load('src/utils/capturePermissions.js', { 'react-native': native });
  const checked = async capability => { assert.equal(nativeActive, false, 'permission started before dismissal'); calls.push(`${capability}-get`); return permissionsByCapability[capability] || permission; };
  const requested = async capability => { assert.equal(nativeActive, false); calls.push(`${capability}-request`); return requestResult; };
  const picker = async (name, options) => {
    assert.equal(nativeActive, false, `${name} presented over the attachment modal`);
    calls.push(name);
    if (name === 'library') assert.deepEqual(options.mediaTypes, ['images', 'videos']);
    if (name === 'camera') assert.deepEqual(options.mediaTypes, ['images']);
    if (pickerError) throw pickerError;
    return await pickerResult;
  };
  const icons = new Proxy({}, { get: (_target, name) => name === '__esModule' ? false : () => React.createElement('span', {}, `icon-${name}`) });
  const Sheet = load('src/components/MediaPickerSheet.jsx', {
    'react-native': native, 'lucide-react-native': icons,
    '../utils/responsive': { scale: x => x, verticalScale: x => x, moderateScale: x => x },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../utils/logger': { __esModule: true, default: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) } },
    '../utils/capturePermissions': permissions,
    '../utils/safeMediaLibrary': { __esModule: true, default: { getPermissionsAsync: async () => { calls.push('existing-library-access'); return { granted: false }; } } },
    'expo-image-picker': { getCameraPermissionsAsync: () => checked('camera'), requestCameraPermissionsAsync: () => requested('camera'),
      launchCameraAsync: options => picker('camera', options), launchImageLibraryAsync: options => picker('library', options) },
    'expo-document-picker': { getDocumentAsync: options => picker('document', options) },
  }).default;
  function Harness() {
    const [visible, setVisible] = React.useState(true), [id, setId] = React.useState('channel');
    openSheet = () => setVisible(true); context = id => { setId(id); setVisible(false); };
    return React.createElement(Sheet, { visible, contextId: id, colors: {}, onClose: () => { calls.push('close'); setVisible(false); },
      onPickFiles: async files => selected.push(files),
      onRecordAudio: async () => { if (!await permissions.ensureCapturePermission(() => checked('mic'), () => requested('mic'), 'Microphone')) return false; calls.push('audio-init'); },
      onRecordVideo: async current => {
        if (!await permissions.ensureCapturePermission(() => checked('camera'), () => requested('camera'), 'Camera')) return false;
        if (!await permissions.ensureCapturePermission(() => checked('mic'), () => requested('mic'), 'Microphone') || !current()) return false;
        calls.push('video-open');
      },
      onOpenGifPicker: () => calls.push('gif'), onOpenRecentCanvases: () => calls.push('canvases'), onOpenRecentFiles: () => calls.push('files'),
    });
  }
  const open = async () => { await React.act(async () => openSheet()); calls.length = 0; };
  const press = async label => {
    const button = [...document.querySelectorAll('button')].find(node => node.textContent.endsWith(label));
    assert.ok(button, `Missing ${label}`);
    await React.act(async () => button.click());
    assert.equal(modal.visible, false);
    if (os === 'ios') {
      assert.deepEqual(calls, ['close'], 'iOS started an action before onDismiss');
      nativeActive = false;
      await React.act(async () => { modal.onDismiss(); await tick(); });
    }
    await React.act(async () => tick());
  };
  await React.act(async () => root.render(React.createElement(Harness)));
  assert.deepEqual(calls, ['existing-library-access']); calls.length = 0;
  await press('View Library'); assert.deepEqual(calls, ['close', 'library']); assert.deepEqual(selected.at(-1), assets);
  assert.ok(logs.some(args => args[1]?.stage === 'picker_presenting'));
  await open(); await press('Photos & Videos'); assert.deepEqual(calls, ['close', 'library']);
  await open(); pickerResult = { canceled: true }; await press('View Library'); assert.deepEqual(calls, ['close', 'library']);
  await open(); pickerError = new Error('native presentation failure'); await press('Upload a File');
  assert.equal(alerts.at(-1)[0], 'Attachment Unavailable'); pickerError = null; pickerResult = { canceled: false, assets };
  await open(); await press('Upload a File'); assert.deepEqual(calls, ['close', 'document']);
  await open(); permission = { status: 'undetermined', canAskAgain: true }; await press('icon-Camera');
  assert.deepEqual(calls, ['close', 'camera-get', 'camera-request', 'camera']);
  await open(); permission = { status: 'granted' }; await press('icon-Camera'); assert.deepEqual(calls, ['close', 'camera-get', 'camera']);
  await open(); permission = { status: 'denied', canAskAgain: false }; await press('icon-Camera');
  assert.deepEqual(calls, ['close', 'camera-get']); assert.ok(alerts.at(-1)[2].some(button => button.text === 'Open Settings'));
  await alerts.at(-1)[2].find(button => button.text === 'Open Settings').onPress(); assert.equal(calls.at(-1), 'settings');
  await open(); permission = { status: 'undetermined' }; await press('Record an Audio Clip'); assert.deepEqual(calls, ['close', 'mic-get', 'mic-request', 'audio-init']);
  await open(); await press('Record a Video Clip'); assert.deepEqual(calls, ['close', 'camera-get', 'camera-request', 'mic-get', 'mic-request', 'video-open']);
  await open(); requestResult = { status: 'denied', canAskAgain: true }; await press('icon-Camera');
  assert.deepEqual(calls, ['close', 'camera-get', 'camera-request']); assert.equal(alerts.at(-1)[0], 'Permission Required');
  await open(); await press('Record an Audio Clip'); assert.deepEqual(calls, ['close', 'mic-get', 'mic-request']);
  await open(); permissionsByCapability = { camera: { status: 'granted' }, mic: { status: 'denied', canAskAgain: false } };
  await press('Record a Video Clip'); assert.deepEqual(calls, ['close', 'camera-get', 'mic-get']);
  requestResult = { status: 'granted' }; permissionsByCapability = {};
  for (const [label, event] of [['Add a GIF', 'gif'], ['Recent Canvases', 'canvases'], ['Recent Files', 'files']]) {
    await open(); await press(label); assert.deepEqual(calls, ['close', event]);
  }
  await open();
  const libraryButton = [...document.querySelectorAll('button')].find(node => node.textContent.endsWith('View Library'));
  await React.act(async () => { libraryButton.click(); libraryButton.click(); });
  if (os === 'ios') { nativeActive = false; await React.act(async () => { modal.onDismiss(); modal.onDismiss(); await tick(); }); }
  assert.equal(calls.filter(call => call === 'library').length, 1); assert.equal(calls.filter(call => call === 'close').length, 1);
  // Late picker results cannot attach to a different channel.
  await open(); let finish;
  pickerResult = new Promise(resolve => { finish = resolve; });
  await press('View Library'); const before = selected.length;
  await React.act(async () => context('different-channel'));
  await React.act(async () => { finish({ canceled: false, assets }); await tick(); });
  assert.equal(selected.length, before);
  await open(); pickerResult = { canceled: true }; await press('View Library'); // finally/context cleanup restored actions.
  await React.act(async () => root.unmount()); dom.window.close();
  console.log(`PASS ${os}: dismissal before picker/permission, image/video return, cancellation/error recovery, feature-specific permissions, Settings, recorder/secondary actions, and stale-result rejection`);
}
(async () => { await verify('ios'); await verify('android'); })().catch(error => { console.error(error); process.exitCode = 1; });
