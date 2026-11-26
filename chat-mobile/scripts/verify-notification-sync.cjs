const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
let state;
const set = updater => {
  const patch = typeof updater === 'function' ? updater(state) : updater;
  state = { ...state, ...patch };
};
const get = () => state;
const zustand = {
  create: initializer => {
    state = initializer(set, get, { setState: set, getState: get });
    return { getState: get, setState: set };
  },
};
const mocks = {
  zustand,
  'zustand/middleware': {
    persist: initializer => initializer,
    createJSONStorage: factory => factory,
  },
  '../services/storage': { __esModule: true, default: {} },
  '../services/api': { __esModule: true, default: { post: async () => ({}) } },
  '../utils/logger': { __esModule: true, default: { error() {} } },
  axios: { isCancel: () => false },
};
const filename = path.join(root, 'src/stores/notificationStore.js');
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod.require = name => {
  assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency ${name}`);
  return mocks[name];
};
mod._compile(transformSync(fs.readFileSync(filename, 'utf8'), { format: 'cjs' }).code, filename);

const store = mod.exports.useNotificationStore;
store.setState({
  notifications: [
    { _id: 'n1', sourceId: 'm1', channelId: 'c1', isRead: false, read: false },
    { _id: 'n2', sourceId: 'm2', channelId: 'c1', isRead: false, read: false },
    { _id: 'n3', sourceId: 'm3', channelId: 'c2', isRead: false, read: false },
    { _id: 'n4', sourceId: 'm4', channelId: 'c2', isRead: true, read: true },
  ],
  unreadCount: 3,
});

store.getState().syncReadState({ notificationIds: ['n1', 'n2'], messageId: 'm2' });
assert.deepEqual(store.getState().notifications.map(item => item.isRead), [true, true, false, true]);
assert.equal(store.getState().unreadCount, 1);

store.getState().syncReadState({ allChannelRead: true, channelId: 'c2' });
assert.deepEqual(store.getState().notifications.map(item => item.isRead), [true, true, true, true]);
assert.equal(store.getState().unreadCount, 0);

store.setState({
  notifications: [
    { _id: 'n5', sourceId: 'm5', isRead: false, read: false },
    { _id: 'n6', sourceId: 'm6', isRead: false, read: false },
  ],
  unreadCount: 2,
});
store.getState().syncReadState({ allRead: true });
assert.deepEqual(store.getState().notifications.map(item => item.isRead), [true, true]);
assert.equal(store.getState().unreadCount, 0);
store.getState().syncReadState({ allRead: true });
assert.equal(store.getState().unreadCount, 0, 'duplicate sync event must not decrement twice');

(async () => {
  store.setState({
    notifications: [{ _id: 'n7', isRead: false, read: false }],
    unreadCount: 1,
  });
  await store.getState().markAsRead('n7');
  await store.getState().markAsRead('n7');
  assert.equal(store.getState().unreadCount, 0, 'repeated read update must not double-decrement');

  console.log('PASS mobile notification sync by notification IDs, message/channel scope, all-read, duplicate events, and repeated API read');
})().catch(error => { console.error(error); process.exitCode = 1; });
