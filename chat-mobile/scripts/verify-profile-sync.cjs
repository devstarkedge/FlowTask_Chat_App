const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const { QueryClient } = require('@tanstack/react-query');
const root = path.resolve(__dirname, '..');
function load(file, mocks) {
  const filename = path.join(root, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, filename);
  return mod.exports;
}
let resolveMe, requests = 0;
const persisted = new Map();
let profileEvents;
const authAPI = { me: () => { requests++; return new Promise(resolve => { resolveMe = resolve; }); } };
const { useAuthStore: auth } = load('src/stores/authStore.js', {
  '../services/storage': { setItem: async (key, value) => persisted.set(key, value) },
  '../services/api': { authAPI }, '../utils/secureStorage': {},
  '../services/userProfileEvents': { refreshProfileCaches: (...args) => profileEvents.refreshProfileCaches(...args) },
});
const client = new QueryClient();
profileEvents = load('src/services/userProfileEvents.js', {
  '../stores/authStore': { useAuthStore: auth },
  '../stores/workspaceStore': { useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'workspace' }) } },
  '../queries/queryClient': { queryClient: client },
});
const { handleUserProfileUpdated, projectProfile } = profileEvents;
async function main() {
  const old = { _id: 'self', name: 'Old', avatar: 'old.jpg' };
  auth.setState({ accessToken: 'session', user: old });
  for (const key of ['workspaceMembers', 'channelMembers', 'messages', 'channels']) {
    client.setQueryData([key, 'workspace'], [{ _id: 'container', author: old, userId: old, content: 'Old text' }]);
  }
  const event = (updates, version = '2026-10-09T10:00:00Z') => ({ workspaceId: 'workspace', userId: 'self', updates, profileUpdatedAt: version });
  handleUserProfileUpdated(event({ name: 'New' }));
  assert.equal(auth.getState().user.name, 'New'); assert.equal(auth.getState().user.avatar, 'old.jpg');
  handleUserProfileUpdated(event({ avatar: 'new.jpg' }));
  assert.equal(auth.getState().user.avatar, 'new.jpg');
  handleUserProfileUpdated(event({ name: 'Both', avatar: null }, '2026-10-09T11:00:00Z'));
  assert.equal(auth.getState().user.name, 'Both'); assert.equal(auth.getState().user.avatar, null);
  for (const key of ['workspaceMembers', 'channelMembers', 'messages', 'channels']) {
    const item = client.getQueryData([key, 'workspace'])[0];
    assert.equal(item.author.name, 'Both'); assert.equal(item.userId.avatar, null); assert.equal(item.content, 'Old text');
  }
  handleUserProfileUpdated(event({ name: 'Delayed' }));
  assert.equal(auth.getState().user.name, 'Both');
  handleUserProfileUpdated({ ...event({ name: 'Wrong tenant' }), workspaceId: 'other' });
  assert.equal(auth.getState().user.name, 'Both');
  assert.equal(JSON.parse(persisted.get('chat_user')).name, 'Both');
  const pending = auth.getState().refreshUser();
  assert.equal(auth.getState().refreshUser(), pending); assert.equal(requests, 1);
  handleUserProfileUpdated(event({ name: 'Realtime' }, '2026-10-09T12:00:00Z'));
  resolveMe({ data: { data: { user: { ...old, name: 'Stale REST' } } } });
  await pending; assert.equal(auth.getState().user.name, 'Realtime');
  const recovery = auth.getState().refreshUser();
  resolveMe({ data: { data: { user: { ...old, name: 'Recovered', avatar: 'fresh.jpg', flowTaskProfileUpdatedAt: '2026-10-09T13:00:00Z' } } } });
  await recovery; assert.equal(auth.getState().user.name, 'Recovered');
  assert.equal(client.getQueryData(['channelMembers', 'workspace'])[0].author.name, 'Recovered');
  const switched = auth.getState().refreshUser();
  auth.setState({ accessToken: 'other-session', user: { _id: 'other', name: 'Other' } });
  resolveMe({ data: { data: { user: old } } });
  await switched; assert.equal(auth.getState().user.name, 'Other');
  assert.equal(projectProfile({ _id: 'other', name: 'Other' }, 'self', { name: 'Self' }).name, 'Other');
  const socket = fs.readFileSync(path.join(root, 'src/services/socket.js'), 'utf8');
  assert.match(socket, /socket\.on\('user:profile:updated', handleUserProfileUpdated\)/);
  assert.doesNotMatch(socket, /socket\.on\('user:profile_updated'/);
  client.clear();
  console.log('PASS: name, avatar, combined updates, member/message identity caches, persistence, versions, tenant isolation, recovery, deduplication and session races');
}
main().catch(error => { client.clear(); console.error(error); process.exitCode = 1; });
