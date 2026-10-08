const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const { JSDOM } = require('jsdom');
const { createRoot } = require('react-dom/client');
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
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('root'));
let alerts = [], calls = [], listeners = new Set(), cameraMounted = 0;
let micStatus = { status: 'undetermined', canAskAgain: true }, cameraStatus = { status: 'undetermined', canAskAgain: true }, permissionResult = { status: 'granted' };
const granted = { status: 'granted', granted: true };
const Text = ({ children }) => React.createElement('span', {}, children);
const View = ({ children, visible }) => visible === false ? null : React.createElement('div', {}, children);
const native = {
  Platform: { OS: 'ios' }, Alert: { alert: (...args) => alerts.push(args) }, Linking: { openSettings: async () => calls.push('settings') },
  AppState: { addEventListener: (_name, cb) => { listeners.add(cb); return { remove: () => listeners.delete(cb) }; } },
  View, Text, Image: () => null, Modal: View, SafeAreaView: View,
  TouchableOpacity: ({ children, onPress }) => React.createElement('button', { onClick: onPress }, children),
  FlatList: ({ data, renderItem }) => React.createElement('div', {}, data.map((item, index) => React.createElement(React.Fragment, { key: item.id || index }, renderItem({ item })))),
  StyleSheet: { create: x => x, absoluteFillObject: {} },
};
const permissions = load('src/utils/capturePermissions.js', { 'react-native': native });
const recorderInstances = [];
const audio = {
  getRecordingPermissionsAsync: async () => { calls.push('mic-get'); return micStatus; },
  requestRecordingPermissionsAsync: async () => { calls.push('mic-request'); return permissionResult; },
  setAudioModeAsync: async mode => calls.push(mode.allowsRecording ? 'mode-record' : 'mode-play'),
  RecordingPresets: { HIGH_QUALITY: { extension: '.m4a', ios: { quality: 1 }, android: {} } },
  AudioModule: { AudioRecorder: class {
    constructor() { calls.push('construct'); recorderInstances.push(this); this.uri = 'file:///clip.m4a'; }
    async prepareToRecordAsync() { calls.push('prepare'); }
    record() { calls.push('record'); }
    async stop() { calls.push('stop'); }
    release() { calls.push('release'); }
    pause() {}
  } },
};
const camera = { Camera: {
  getCameraPermissionsAsync: async () => { calls.push('camera-get'); return cameraStatus; },
  requestCameraPermissionsAsync: async () => { calls.push('camera-request'); return permissionResult; },
  getMicrophonePermissionsAsync: audio.getRecordingPermissionsAsync,
  requestMicrophonePermissionsAsync: audio.requestRecordingPermissionsAsync,
}, CameraView: () => { cameraMounted++; return null; } };
const logger = { __esModule: true, default: { warn() {}, error() {} } };
const common = { 'react-native': native, '../utils/capturePermissions': permissions, '../utils/logger': logger };
const audioHook = load('src/hooks/useAudioRecorder.js', { ...common, 'expo-audio': audio }).useAudioRecorder;
const videoHook = load('src/hooks/useVideoRecorder.js', { ...common, 'expo-camera': camera }).useVideoRecorder;
let current;
function Harness({ contextId }) { current = { audio: audioHook(contextId), video: videoHook(contextId) }; return null; }
const render = async id => React.act(async () => root.render(React.createElement(React.StrictMode, {}, React.createElement(Harness, { contextId: id }))));
const click = async label => React.act(async () => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes(label)); assert.ok(button, `Missing action: ${label}`); button.click(); });
(async () => {
  await render('channel-a'); await render('channel-b'); await render('workspace-b-channel');
  assert.deepEqual(calls, []); assert.equal(alerts.length, 0);
  console.log('PASS channel/composer hook mounting and repeated context changes request no camera/microphone access or recording resources');
  await React.act(async () => assert.equal(await current.audio.startRecording(), true));
  assert.deepEqual(calls.slice(0, 2), ['mic-get', 'mic-request']); assert.ok(calls.includes('prepare')); assert.ok(calls.includes('record')); assert.ok(!calls.includes('camera-get'));
  await React.act(async () => { const clip = await current.audio.stopRecording(); assert.equal(clip.uri, 'file:///clip.m4a'); });
  assert.ok(calls.includes('release')); assert.equal(calls.at(-1), 'mode-play');
  calls = []; micStatus = granted;
  await React.act(async () => { await current.audio.startRecording(); await current.audio.cancelRecording(); });
  assert.ok(!calls.includes('mic-request'));
  console.log('PASS audio user action checks microphone only; already-granted access skips request; stop/cancel release recorder and restore playback mode');
  calls = []; cameraStatus = granted; micStatus = granted;
  await React.act(async () => assert.equal(await current.video.preparePermissions(), true));
  assert.deepEqual(calls, ['camera-get', 'mic-get']);
  calls = []; cameraStatus = { status: 'undetermined', canAskAgain: true }; micStatus = { status: 'undetermined', canAskAgain: true };
  await React.act(async () => assert.equal(await current.video.preparePermissions(), true));
  assert.deepEqual(calls, ['camera-get', 'camera-request', 'mic-get', 'mic-request']);
  calls = []; cameraStatus = { status: 'denied', canAskAgain: false };
  await React.act(async () => assert.equal(await current.video.preparePermissions(), false));
  assert.deepEqual(calls, ['camera-get']);
  await alerts.at(-1)[2].find(button => button.text === 'Open Settings').onPress(); assert.equal(calls.at(-1), 'settings');
  calls = []; micStatus = { status: 'denied', canAskAgain: false };
  await React.act(async () => assert.equal(await current.audio.startRecording(), false));
  assert.deepEqual(calls, ['mic-get']); assert.equal(current.audio.isRecording, false);
  micStatus = { status: 'undetermined', canAskAgain: true }; permissionResult = { status: 'denied', canAskAgain: false }; calls = [];
  await React.act(async () => assert.equal(await current.audio.startRecording(), false));
  assert.deepEqual(calls, ['mic-get', 'mic-request']); assert.equal(current.audio.isRecording, false);
  permissionResult = granted; cameraStatus = granted; micStatus = granted;
  await React.act(async () => { await current.video.preparePermissions(); });
  let completeVideo;
  current.video.cameraRef.current = { recordAsync: () => new Promise(resolve => { completeVideo = resolve; }), stopRecording: () => completeVideo?.({ uri: 'file:///discarded.mp4' }) };
  let pendingVideo; await React.act(async () => { pendingVideo = current.video.startRecording(); });
  await React.act(async () => { current.video.cancelRecording(); await pendingVideo; });
  assert.equal(current.video.videoUri, null);
  console.log('PASS video requests camera then microphone only on selection; granted permissions skip requests; permanent denial opens Settings without requesting or recording');
  let resolvePermission; permissionResult = new Promise(resolve => { resolvePermission = resolve; }); micStatus = { status: 'undetermined', canAskAgain: true };
  let pending; await React.act(async () => { pending = current.audio.startRecording(); });
  await render('another-channel'); calls = [];
  await React.act(async () => { resolvePermission(granted); assert.equal(await pending, false); });
  assert.ok(!calls.includes('construct')); permissionResult = granted;
  calls = []; micStatus = granted; await React.act(async () => { await current.audio.startRecording(); });
  await React.act(async () => root.render(null));
  assert.ok(calls.includes('stop')); assert.ok(calls.includes('release')); assert.equal(listeners.size, 0);
  console.log('PASS switching/unmounting during permission and recording cancels startup, releases active audio, and removes listeners');

  const responsive = { scale: x => x, verticalScale: x => x, moderateScale: x => x };
  const icons = new Proxy({}, { get: (_target, name) => name === '__esModule' ? false : () => React.createElement('span', {}, `icon-${name}`) });
  const VideoModal = load('src/components/VideoRecorderModal.jsx', { 'react-native': native, 'expo-camera': camera, 'lucide-react-native': icons, './common/AppVideo': { __esModule: true, default: () => null }, '../utils/responsive': responsive }).default;
  await React.act(async () => root.render(React.createElement(VideoModal, { visible: false })));
  assert.equal(cameraMounted, 0);
  const sheet = load('src/components/MediaPickerSheet.jsx', {
    'react-native': native, 'lucide-react-native': icons, '../utils/responsive': responsive, '../utils/capturePermissions': permissions,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../utils/safeMediaLibrary': { __esModule: true, default: { getPermissionsAsync: async () => { calls.push('library-check'); return { granted: false }; }, requestPermissionsAsync: async () => { calls.push('library-request'); return { granted: true }; }, getAssetsAsync: async () => ({ assets: [] }) } },
    'expo-image-picker': { ...camera.Camera, launchCameraAsync: async () => { calls.push('photo-camera'); return { canceled: true }; }, launchImageLibraryAsync: async () => { calls.push('photo-picker'); return { canceled: true }; } },
    'expo-document-picker': { getDocumentAsync: async () => { calls.push('document-picker'); return { canceled: true }; } },
  }).default;
  let modal, reopenSheet;
  native.Modal = props => { modal = props; return props.visible ? React.createElement('div', {}, props.children) : null; };
  function SheetHarness() {
    const [visible, setVisible] = React.useState(true); reopenSheet = () => setVisible(true);
    return React.createElement(sheet, { visible, colors: {}, onClose: () => setVisible(false) });
  }
  const choose = async label => {
    await click(label); assert.equal(modal.visible, false);
    await React.act(async () => { modal.onDismiss(); });
    await React.act(async () => reopenSheet());
  };
  calls = []; await React.act(async () => root.render(React.createElement(SheetHarness)));
  assert.deepEqual(calls, ['library-check']);
  await choose('View Library'); await choose('Upload a File');
  assert.deepEqual(calls.filter(call => call !== 'library-check'), ['library-request', 'photo-picker', 'document-picker']);
  cameraStatus = granted; await choose('icon-Camera'); assert.ok(calls.includes('photo-camera')); assert.ok(!calls.includes('mic-get')); assert.ok(!calls.includes('camera-request'));
  console.log('PASS hidden camera remains unmounted; attachment menu checks existing photo access only; photo picker/documents request no camera/microphone; photo capture checks camera only');
  await React.act(async () => root.unmount()); dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
