const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(os = 'android') {
  const calls = [], saved = new Map([['expo_push_token', 'ExpoPushToken[unchanged]']]);
  let permission = { status: 'undetermined', canAskAgain: true }, lastResponse = null;
  let token = 'ExpoPushToken[unchanged]', registrationSuccess = true, permissionWait;
  const auth = { user: { _id: 'recipient' }, accessToken: 'test-session' };
  const workspace = { activeWorkspaceId: 'first', isSwitchingWorkspace: false,
    switchWorkspace: async id => { calls.push(['switch', id]); workspace.activeWorkspaceId = id; } };
  const subs = {};
  const add = (type, cb) => { calls.push([type]); subs[type] = cb; return { remove: () => delete subs[type] }; };
  const notifications = {
    AndroidImportance: { MAX: 5 }, IosAuthorizationStatus: { PROVISIONAL: 3 }, AndroidNotificationPriority: { HIGH: 2 },
    setNotificationHandler: x => { subs.handler = x.handleNotification; },
    setNotificationChannelAsync: async () => calls.push(['channel']),
    getPermissionsAsync: async () => { calls.push(['permission']); return permissionWait ? permissionWait : permission; },
    requestPermissionsAsync: async () => { calls.push(['request']); return { status: 'granted' }; },
    getExpoPushTokenAsync: async options => { calls.push(['expo-token', options.projectId]); return { data: token }; },
    addNotificationReceivedListener: cb => add('received', cb),
    addNotificationResponseReceivedListener: cb => add('response', cb),
    addPushTokenListener: cb => add('refresh', cb),
    getLastNotificationResponseAsync: async () => lastResponse,
    clearLastNotificationResponseAsync: async () => { lastResponse = null; calls.push(['clear-response']); },
    dismissAllNotificationsAsync: async () => {}, setBadgeCountAsync: async () => {},
    scheduleNotificationAsync: async options => { calls.push(['local']); return subs.handler({ request: { content: options.content } }); },
  };
  const logs = [];
  const mocks = {
    'expo-device': { isDevice: true }, 'react-native': { Platform: { OS: os } }, 'expo': { isRunningInExpoGo: () => false },
    'expo-constants': { default: { expoConfig: { extra: { eas: { projectId: 'fixture-project' } } } } },
    'expo-notifications': notifications,
    './storage': { __esModule: true, default: { getItem: async key => saved.get(key), setItem: async (key, value) => saved.set(key, value), removeItem: async key => saved.delete(key) } },
    './api': { pushAPI: { registerToken: async (...args) => { calls.push(['register', ...args]); return { status: 200, data: { success: registrationSuccess } }; },
      removeToken: async value => { calls.push(['remove', value, auth.accessToken]); return { data: { success: true } }; } } },
    '../utils/logger': { __esModule: true, default: Object.fromEntries(['info', 'warn', 'error'].map(key => [key, (...args) => logs.push(args)])) },
    '../constants/notificationSounds': { ANDROID_NOTIFICATION_SOUND: 'default', IOS_NOTIFICATION_SOUND: 'test.wav', getNotificationSound: () => 'default' },
    '../stores/authStore': { useAuthStore: { getState: () => auth } },
    '../stores/workspaceStore': { useWorkspaceStore: { getState: () => workspace } },
    '../stores/notificationStore': { useNotificationStore: { getState: () => ({ fetchUnreadCount: async () => {} }) } },
    '../stores/channelStore': { useChannelStore: { getState: () => ({ activeChannelId: null }) } },
  };
  const filename = path.join(root, 'src/services/pushNotificationService.js');
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = name => { assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency ${name}`); return mocks[name]; };
  mod._compile(transformSync(fs.readFileSync(filename, 'utf8'), { format: 'cjs' }).code, filename);
  return { service: mod.exports, calls, saved, subs, auth, workspace, logs,
    setPermission: value => { permission = value; }, setToken: value => { token = value; },
    setSuccess: value => { registrationSuccess = value; }, setResponse: value => { lastResponse = value; },
    waitPermission: value => { permissionWait = value; } };
}

(async () => {
  for (const os of ['android', 'ios']) {
    const f = fixture(os);
    assert.equal(await f.service.registerForPushNotifications(), 'ExpoPushToken[unchanged]');
    const register = f.calls.find(x => x[0] === 'register');
    assert.equal(register[3], 'expo'); assert.notEqual(register[2], 'unknown');
    assert.ok(f.subs.response && f.subs.received && f.subs.refresh);
    if (os === 'android') assert.ok(f.calls.findIndex(x => x[0] === 'channel') < f.calls.findIndex(x => x[0] === 'request'));
    await f.service.registerForPushNotifications();
    assert.equal(f.calls.filter(x => x[0] === 'register').length, 2);
    f.setToken('ExpoPushToken[rotated]'); f.subs.refresh({ type: os, data: 'native-token' }); await tick(); await tick();
    assert.equal(f.calls.filter(x => x[0] === 'register').at(-1)[1], 'ExpoPushToken[rotated]');
    const registrations = f.calls.filter(x => x[0] === 'register').length;
    f.subs.refresh({ type: os, data: 'native-token' }); await tick();
    assert.equal(f.calls.filter(x => x[0] === 'register').length, registrations);
    assert.equal(await f.service.unregisterPushNotifications(), true);
    assert.ok(f.calls.some(x => x[0] === 'remove' && x[2] === 'test-session'));
    assert.ok(f.saved.has('push_installation_id')); assert.ok(!f.subs.response && !f.subs.refresh);
    assert.ok(!JSON.stringify(f.logs).includes('ExpoPushToken['));
    console.log(`PASS ${os}: permission/channel order, unchanged-token confirmation, unique installation, refresh uses Expo token, authenticated removal`);
  }
  const denied = fixture(); denied.setPermission({ status: 'denied', canAskAgain: false });
  assert.equal(await denied.service.registerForPushNotifications(), null);
  assert.ok(!denied.calls.some(x => ['request', 'expo-token', 'register'].includes(x[0])));
  const provisional = fixture('ios'); provisional.setPermission({ status: 'undetermined', ios: { status: 3 } });
  assert.ok(await provisional.service.registerForPushNotifications());
  assert.ok(!provisional.calls.some(x => x[0] === 'request'));
  const failed = fixture(); failed.setSuccess(false);
  assert.equal(await failed.service.registerForPushNotifications(), null);
  console.log('PASS permanent denial, iOS provisional authorization, and unconfirmed registration fail safely');
  const cancelled = fixture(); let resolvePermission;
  cancelled.waitPermission(new Promise(resolve => { resolvePermission = resolve; }));
  const pending = cancelled.service.registerForPushNotifications(); await tick();
  assert.equal(await cancelled.service.unregisterPushNotifications(), true);
  assert.ok(!cancelled.calls.some(x => x[0] === 'register'));
  cancelled.waitPermission(null); cancelled.auth.accessToken = 'new-session';
  assert.ok(await cancelled.service.registerForPushNotifications());
  resolvePermission({ status: 'granted' }); await pending;
  assert.equal(cancelled.calls.filter(x => x[0] === 'register').length, 1);
  console.log('PASS logout cancels in-flight permission/token registration; same-account login can register before the old prompt settles');
  const tapped = fixture(); let ready = false;
  tapped.setResponse({ actionIdentifier: 'default', notification: { request: { identifier: 'cold-start', content: { data: { workspaceId: 'other', channelId: 'channel', messageId: 'message' } } } } });
  tapped.service.setNavigationRef({ current: { isReady: () => ready, navigate: (...args) => tapped.calls.push(['navigate', ...args]) } });
  await tapped.service.registerForPushNotifications(); await tick();
  assert.ok(!tapped.calls.some(x => x[0] === 'navigate'));
  ready = true; tapped.service.handlePushNavigationReady(); await tick();
  assert.deepEqual(tapped.calls.filter(x => ['switch', 'navigate'].includes(x[0])), [['switch', 'other'], ['navigate', 'Chat', { channelId: 'channel', messageId: 'message' }]]);
  tapped.service.handlePushNavigationReady(); await tick();
  assert.equal(tapped.calls.filter(x => x[0] === 'navigate').length, 1);
  tapped.workspace.switchWorkspace = async () => { throw new Error('membership denied'); };
  tapped.subs.response({ actionIdentifier: 'default', notification: { request: { identifier: 'unavailable', content: { data: { workspaceId: 'forbidden', channelId: 'wrong' } } } } });
  await tick(); assert.equal(tapped.calls.filter(x => x[0] === 'navigate').length, 1);
  const presentation = { request: { content: { data: { notificationId: 'same-event' } }, trigger: { type: 'firebase' } } };
  assert.equal((await tapped.subs.handler(presentation)).shouldShowBanner, true);
  assert.equal((await tapped.subs.handler(presentation)).shouldShowBanner, false);
  console.log('PASS cold-start tap waits for navigation, selects workspace, consumes once, rejects inaccessible workspace; socket/remote presentation deduplicates');
})().catch(error => { console.error(error); process.exitCode = 1; });
