const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { transformSync } = require('esbuild');
const values = new Map();
let corrupt = false;
const storage = { getJson: async key => { if (corrupt) throw new Error('invalid JSON'); return values.get(key); },
  setJson: async (key, value) => { await Promise.resolve(); values.set(key, value); } };
const filename = path.resolve(__dirname, '../src/services/navigationRecovery.js');
const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod.require = name => { if (name === './storage') return { __esModule: true, default: storage }; throw new Error(name); };
mod._compile(transformSync(fs.readFileSync(filename, 'utf8'), { format: 'cjs' }).code, filename);
const recovery = mod.exports;
const state = { index: 1, routes: [{ key: 'main', name: 'Main', state: { index: 2, routes: ['HomeTab', 'DMsTab', 'ActivityTab', 'MoreTab', 'SearchTab'].map(name => ({ name })) } },
  { key: 'chat', name: 'Chat', params: { channelId: 'channel-A', channelName: 'Testing', accessToken: 'must-not-persist', callback: () => {}, message: { attachments: ['large'] } } }] };
async function main() {
  const safe = recovery.sanitizeNavigationState(state);
  assert.equal(safe.routes[1].params.channelId, 'channel-A'); assert.equal(safe.routes[0].state.index, 2);
  assert.equal(safe.routes[1].key, undefined); assert.equal(safe.routes[1].params.accessToken, undefined); assert.equal(safe.routes[1].params.message, undefined);
  await recovery.saveNavigationState('user-A', 'workspace-A', state);
  assert.deepEqual(await recovery.restoreNavigationState('user-A', 'workspace-A'), safe);
  assert.equal(await recovery.restoreNavigationState('user-B', 'workspace-A'), undefined);
  assert.equal(await recovery.restoreNavigationState('user-A', 'workspace-B'), undefined);
  assert.equal(await recovery.restoreNavigationState('user-A', 'workspace-A', 'flowtaskchat://invite/123'), undefined);
  assert.equal(recovery.isNavigationEntryUrl('exp+chat://expo-development-client/?url=http%3A%2F%2Flocalhost'), false);
  assert.equal(recovery.isNavigationEntryUrl('exp://localhost:8081'), false);
  assert.equal(recovery.isNavigationEntryUrl('flowtaskchat://invite/123'), true);
  corrupt = true; assert.equal(await recovery.restoreNavigationState('user-A', 'workspace-A'), undefined); corrupt = false;
  const invalid = recovery.sanitizeNavigationState({ index: 2, routes: [{ name: 'Main' }, { name: 'Chat' }, { name: 'RecordVideo' }] });
  assert.deepEqual(invalid, { index: 0, routes: [{ name: 'Main' }] });
  const updated = { ...state, routes: [state.routes[0], { name: 'Chat', params: { channelId: 'channel-B' } }] };
  await Promise.all([recovery.saveNavigationState('user-A', 'workspace-A', state), recovery.saveNavigationState('user-A', 'workspace-A', updated)]);
  assert.equal((await recovery.restoreNavigationState('user-A', 'workspace-A')).routes[1].params.channelId, 'channel-B');
  await recovery.saveNavigationState('user-A', 'workspace-A', state, () => false);
  assert.equal((await recovery.restoreNavigationState('user-A', 'workspace-A')).routes[1].params.channelId, 'channel-B');
  const config = require('../metro.config.cjs');
  for (const folder of ['dist', 'dist_check', 'dist_test2', '.verification-android-install/node_modules', 'android/.gradle', 'android/app/build', 'ios/Pods']) {
    assert.ok(config.resolver.blockList.some(rule => rule.test(path.resolve(__dirname, '..', folder, 'file.js'))), folder);
  }
  for (const file of ['src/App.jsx', 'assets/Vector.png', 'node_modules/react/index.js']) assert.ok(!config.resolver.blockList.some(rule => rule.test(path.resolve(__dirname, '..', file))), file);
  if (process.platform === 'win32') assert.equal(config.maxWorkers, 2);
  console.log('PASS: Metro ignores only generated trees; bounded Windows workers; scoped last-screen/tab/channel recovery; deep-link priority; corrupt/invalid state fallback; ordered and session-guarded saves');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
