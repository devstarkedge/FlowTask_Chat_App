// Verifies desktop detection parity and mobile UI/query behavior without mutating real workspaces.
// Optional argument: a sanitized controller-response fixture JSON file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const { parse } = require('@babel/parser');
const React = require('react');
const { create } = require('zustand');
const { JSDOM } = require('jsdom');
const { createRoot } = require('react-dom/client');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const projectRoot = path.resolve(__dirname, '..');
function load(relativePath, mocks) {
  const filename = path.join(projectRoot, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(mocks, name) ? (Object.hasOwn(mocks[name], 'default') ? { __esModule: true, ...mocks[name] } : mocks[name]) : original(name);
  loaded._compile(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, filename);
  return loaded.exports;
}
const policies = load('src/utils/workspaceSettings.js', {});
const fixture = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : [
  { workspace: { _id: 'flow', name: 'FlowTask Team', source: 'flowtask', role: 'admin', flowTaskRole: 'admin', plan: 'enterprise', settings: { flowtaskIntegration: { enabled: true } } }, members: [
    { _id: 'membership-one', workspaceId: 'flow', userId: { _id: 'self', name: 'Current User', email: 'current@example.test', avatar: 'https://example.test/user.png' }, role: 'admin', flowTaskAccess: { role: 'admin' } },
    { _id: 'membership-two', workspaceId: 'flow', userId: { _id: 'other', name: 'Other User', email: 'other@example.test' }, role: 'member', flowTaskAccess: { role: 'employee' } },
  ] },
  { workspace: { _id: 'native', name: 'TaskChat Team', source: 'independent', role: 'owner', plan: 'pro', settings: { flowtaskIntegration: { enabled: false } } }, members: [
    { _id: 'membership-three', workspaceId: 'native', userId: { _id: 'self', name: 'Current User', email: 'current@example.test' }, role: 'owner' },
    { _id: 'membership-four', workspaceId: 'native', userId: { _id: 'other', name: 'Other User', email: 'other@example.test' }, role: 'member' },
  ] },
];
const flow = fixture.find(item => item.workspace.source === 'flowtask');
const nativeWorkspace = fixture.find(item => item.workspace.source === 'independent');
const actor = nativeWorkspace.members.find(member => member.role === 'owner').userId;
const other = nativeWorkspace.members.find(member => member.userId._id !== actor._id);
const desktopSource = fs.readFileSync(path.join(projectRoot, '../chat-desktop/src/components/workspace/MembersTab.jsx'), 'utf8');
const desktopAst = parse(desktopSource, { sourceType: 'module', plugins: ['jsx'] });
const card = desktopAst.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'MemberCard');
const detection = card.body.body.find(node => node.declarations?.some(declaration => declaration.id.name === 'isFlowTaskWorkspace')).declarations[0].init;
const desktopDetectsFlowTask = new Function('workspace', `return ${desktopSource.slice(detection.start, detection.end)};`);
for (const workspace of [flow.workspace, nativeWorkspace.workspace, { source: 'independent', settings: { flowtaskIntegration: { enabled: true } } }, { source: 'independent', flowTaskRole: 'employee' }]) {
  assert.equal(policies.getWorkspaceOrigin(workspace) === 'flowtask', desktopDetectsFlowTask(workspace));
}
assert.equal(policies.getWorkspaceOrigin({}), null);
assert.equal(policies.getWorkspaceOrigin({ source: 'future-provider' }), null);
const normalized = policies.normalizeWorkspaceMembers([
  ...nativeWorkspace.members, other, { ...other, _id: 'inactive', isActive: false },
  { ...other, userId: { _id: 'outsider', name: 'Wrong workspace' }, workspaceId: 'different' },
  { _id: 'pending', userId: { _id: 'pending-user' }, status: 'pending' }, { _id: 'deleted-user', userId: null },
], nativeWorkspace.workspace._id);
assert.equal(normalized.length, nativeWorkspace.members.length);
assert.equal(normalized.find(member => member.userId._id === other.userId._id).name, other.userId.name);
assert.equal(policies.getWorkspaceMemberActions(flow.workspace, normalized[1], actor._id, true).canEditRole, false);
assert.equal(policies.getWorkspaceMemberActions(nativeWorkspace.workspace, normalized.find(member => member.userId._id === actor._id), actor._id, true).canRemove, false);
assert.equal(policies.getWorkspaceMemberActions(nativeWorkspace.workspace, { ...normalized[1], flowTaskAccess: { role: 'employee' } }, actor._id, true).canRemove, false);
const legacyIntegration = { ...nativeWorkspace.workspace, settings: { flowtaskIntegration: { enabled: true } } };
assert.equal(policies.getWorkspaceMemberActions(legacyIntegration, other, actor._id, true).canEditRole, true);
assert.equal(policies.getWorkspaceMemberActions(legacyIntegration, other, actor._id, true).canRemove, false);
assert.equal(policies.getWorkspaceMemberActions(flow.workspace, { ...other, flowTaskAccess: null }, actor._id, true).canEditRole, false);
console.log('PASS actual desktop detection expression, unknown source, normalized profiles, membership filtering/deduplication, self/owner/synced restrictions');

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('root'));
let lastAlert, toasts = [], navigations = [], version = 0, failMembers = false, failDetails = false, delayedDetails = null, delayedInvitation = null;
const requests = [], writes = [];
const element = tag => ({ children, onPress, disabled, accessibilityLabel, visible, onChangeText, value, placeholder, editable, onValueChange }) => visible === false ? null : React.createElement(tag, {
  ...(onPress ? { onClick: onPress, disabled } : {}), 'aria-label': accessibilityLabel,
  ...(onChangeText ? { value, placeholder, disabled: editable === false, onInput: event => onChangeText(event.target.value) } : {}),
  ...(onValueChange ? { type: 'checkbox', checked: value, onChange: event => onValueChange(event.target.checked) } : {}),
}, children);
const View = element('div');
const native = { View, Text: element('span'), TouchableOpacity: element('button'), TextInput: element('input'), ScrollView: View, Modal: View,
  ActivityIndicator: element('progress'), Switch: element('input'), RefreshControl: () => null,
  StyleSheet: { create: x => x, absoluteFillObject: {}, hairlineWidth: 1 }, Platform: { OS: 'web' },
  Alert: { alert: (...args) => { lastAlert = args; } }, Share: { share: async () => {} },
};
const useWorkspaceStore = create(() => ({ activeWorkspaceId: flow.workspace._id, activeWorkspace: flow.workspace, deleteWorkspace: async () => { writes.push(['delete']); return { remaining: true }; }, leaveWorkspace: async () => ({ remaining: true }) }));
const auth = { useAuthStore: create(() => ({ user: actor })) };
const dataById = new Map(fixture.map(item => [item.workspace._id, structuredClone(item)]));
const api = {
  getWorkspaceContextVersion: () => version,
  workspaceAPI: {
    get: async (id, config) => {
      requests.push({ kind: 'details', id, signal: config.signal });
      if (failDetails) throw new Error('Details unavailable');
      if (delayedDetails) return delayedDetails.promise;
      return { data: { data: structuredClone(dataById.get(id).workspace) } };
    },
    getMembers: async (id, _params, config) => {
      requests.push({ kind: 'members', id, signal: config.signal });
      if (failMembers) throw new Error('Members unavailable');
      return { data: { data: structuredClone(dataById.get(id).members) } };
    },
    getBilling: async () => ({ data: { data: {} } }),
    getSecuritySettings: async () => ({ data: { data: {} } }),
    getNotificationSettings: async () => ({ data: { data: {} } }),
    getIntegrationSettings: async () => ({ data: { data: {} } }),
    update: async (id, payload) => { writes.push(['metadata', id, payload]); dataById.get(id).workspace = { ...dataById.get(id).workspace, ...payload }; return { data: { data: dataById.get(id).workspace } }; },
    updateMemberRole: async (id, uid, role) => { writes.push(['role', id, uid, role]); dataById.get(id).members.find(member => member.userId._id === uid).role = role; },
    removeMember: async (id, uid) => { writes.push(['remove', id, uid]); dataById.get(id).members = dataById.get(id).members.filter(member => member.userId._id !== uid); },
    getAllInvites: async (id, params) => {
      requests.push({ kind: 'invitations', id, ...params });
      return { data: { data: { invites: [{ _id: 'pending-invite', email: 'pending@example.test', status: 'pending', inviteType: 'member', role: 'member', resendCount: 0 }], pages: 2 } } };
    },
    inviteByEmail: async (id, payload) => { writes.push(['email', id, payload]); if (delayedInvitation) await delayedInvitation; },
    resendInvite: async (id, inviteId) => { writes.push(['resend', id, inviteId]); },
    revokeInvite: async (id, inviteId) => { writes.push(['revoke', id, inviteId]); },
    updateDomainRestrictions: async (id, payload) => { writes.push(['domain', id, payload]); },
    updateGuestSettings: async (id, payload) => { writes.push(['guest', id, payload]); },
  }, fileAPI: {},
};
const responsive = { scale: x => x, verticalScale: x => x, moderateScale: x => x };
const colors = { primary: '#3478f6', textPrimary: '#111', textSecondary: '#555', textTertiary: '#777', border: '#ddd', card: '#fff' };
const icon = () => null;
const icons = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : icon });
const toast = { default: { show: event => toasts.push(event) } };
const avatars = { AppAvatar: ({ user }) => React.createElement('div', { 'data-avatar-user': user._id }, user.name) };
const membersHook = load('src/hooks/queries/useWorkspaceMembers.js', { '../../services/api': api });
const settingsHook = load('src/hooks/queries/useWorkspaceSettings.js', { '../../services/api': api });
const memberSection = load('src/components/workspace/WorkspaceMembersSection.jsx', {
  'react-native': native, 'lucide-react-native': icons, '../common': avatars,
  '../../stores/channelStore': { useChannelStore: create(() => ({ createDM: async () => ({ _id: 'test-dm' }) })) },
  '../../utils/workspaceSettings': policies, '../../utils/responsive': responsive, 'react-native-toast-message': toast,
});
const inviteOptions = load('src/components/workspace/WorkspaceInviteOptions.jsx', { 'react-native': native, '../../services/api': api,
  '../../utils/workspaceSettings': policies, '../../utils/responsive': responsive, 'react-native-toast-message': toast });
const { default: Settings } = load('src/screens/workspace/WorkspaceSettingsScreen.jsx', {
  'react-native': native, 'react-native-safe-area-context': { SafeAreaView: View }, 'lucide-react-native': icons,
  'expo-clipboard': { setStringAsync: async () => {} }, 'expo-image-picker': {}, 'react-native-toast-message': toast,
  '../../stores/themeStore': { useThemeStore: () => ({ colors }) }, '../../stores/workspaceStore': { useWorkspaceStore }, '../../stores/authStore': auth,
  '../../services/api': api, '../../utils/responsive': responsive, '../../components/WorkspaceAvatar': { default: ({ workspace }) => React.createElement('div', { 'data-workspace': workspace._id }, workspace.name) },
  '../../config/environment': { default: { CLIENT_URL: 'https://example.test' } }, '../../hooks/queries/useWorkspaceMembers': membersHook,
  '../../hooks/queries/useWorkspaceSettings': settingsHook, '../../utils/workspaceSettings': policies,
  '../../components/workspace/WorkspaceMembersSection': { default: memberSection.default }, '../../components/workspace/WorkspaceInviteOptions': { default: inviteOptions.default },
});
const { default: DirectInvites } = load('src/screens/InviteManagementScreen.jsx', {
  'react-native': native, 'react-native-safe-area-context': { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  'lucide-react-native': icons, 'expo-clipboard': { setStringAsync: async () => {} }, 'react-native-toast-message': toast,
  '../stores/themeStore': { useThemeStore: () => ({ colors, effectiveTheme: 'light' }) }, '../stores/workspaceStore': { useWorkspaceStore },
  '../hooks/queries/useChannels': { useChannels: () => ({ data: [] }) }, '../services/api': api,
  '../config/environment': { default: { CLIENT_URL: 'https://example.test' } }, '../components/common': { HeaderBackButton: () => null },
  '../utils/logger': { default: { error() {} } }, '../utils/responsive': responsive,
  '../utils/workspaceSettings': policies, '../hooks/queries/useWorkspaceSettings': settingsHook,
});
const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
const navigation = { navigate: (...args) => navigations.push(args), goBack() { navigations.push(['back']); }, reset() {} };
const render = async (Component = Settings) => React.act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Component, { navigation }))));
const click = async text => {
  const button = [...document.querySelectorAll('button')].find(item => item.textContent === text);
  assert.ok(button, `Missing button: ${text}`);
  await React.act(async () => { button.click(); });
};
const waitFor = async predicate => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error('Timed out waiting for settings state');
};
const select = async workspace => React.act(async () => { version++; useWorkspaceStore.setState({ activeWorkspaceId: workspace._id, activeWorkspace: workspace }); });
(async () => {
  await render();
  await waitFor(() => !document.querySelector('progress'));
  assert.ok(document.body.textContent.includes('Synced with FlowTask'));
  assert.equal([...document.querySelectorAll('button')].find(item => item.textContent.includes('Leave Workspace')).disabled, true);
  await click('Members');
  for (const member of flow.members) assert.equal(document.querySelectorAll(`[data-avatar-user="${member.userId._id}"]`).length, 1);
  assert.equal([...document.querySelectorAll('button')].some(item => item.textContent === 'Invite People'), false);
  const syncedOther = flow.members.find(member => member.userId._id !== actor._id);
  await React.act(async () => { document.querySelector(`[aria-label="Actions for ${syncedOther.userId.name}"]`).click(); });
  assert.ok(document.body.textContent.includes('View Profile'));
  assert.equal(document.body.textContent.includes('Remove Member'), false);
  assert.equal(document.body.textContent.includes('Make Admin'), false);
  await click('Cancel'); await click('Invite');
  assert.ok(document.body.textContent.includes("FlowTask's workspace invitation flow"));
  assert.equal(document.body.textContent.includes('Invite Code'), false);
  console.log('PASS FlowTask controller-shaped members, profiles, read-only membership, managed invitation notice, disabled delete/leave');

  await select(nativeWorkspace.workspace);
  await waitFor(() => document.body.textContent.includes('Delete Workspace'));
  assert.equal(document.body.textContent.includes('Synced with FlowTask'), false);
  await click('Members');
  await waitFor(() => !!document.querySelector(`[aria-label="Actions for ${other.userId.name}"]`));
  await click('Invite People'); assert.equal(navigations.at(-1)[0], 'InviteManagement');
  await React.act(async () => { document.querySelector(`[aria-label="Actions for ${other.userId.name}"]`).click(); });
  await click('Make Admin');
  await React.act(async () => { await lastAlert[2].find(button => button.text === 'Change').onPress(); });
  assert.ok(writes.some(write => write[0] === 'role' && write[2] === other.userId._id));
  await waitFor(() => document.body.textContent.includes('admin'));
  await React.act(async () => { document.querySelector(`[aria-label="Actions for ${other.userId.name}"]`).click(); });
  await click('Remove Member');
  const pendingRemoval = lastAlert[2].find(button => button.text === 'Remove').onPress;
  await select(flow.workspace);
  await React.act(async () => { await pendingRemoval(); });
  assert.equal(writes.some(write => write[0] === 'remove'), false);
  console.log('PASS TaskChat invite and role controls; role mutation uses user ID; confirmation from an old workspace is ignored');

  await select(nativeWorkspace.workspace); await click('Invite');
  await waitFor(() => document.body.textContent.includes('Domain Restrictions'));
  assert.ok(document.body.textContent.includes('Invitations'));
  await waitFor(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Next' && !button.disabled));
  await click('Next');
  await waitFor(() => requests.some(request => request.kind === 'invitations' && request.page === 2));
  await click('Pending');
  await waitFor(() => requests.some(request => request.kind === 'invitations' && request.page === 1 && request.status === 'pending'));
  await waitFor(() => document.body.textContent.includes('pending@example.test'));
  await click('Resend');
  assert.ok(writes.some(write => write[0] === 'resend' && write[2] === 'pending-invite'));
  await click('Revoke');
  await React.act(async () => { await lastAlert[2].find(button => button.text === 'Revoke').onPress(); });
  assert.ok(writes.some(write => write[0] === 'revoke' && write[2] === 'pending-invite'));
  assert.equal(document.body.textContent.includes('Guest Settings'), ['pro', 'enterprise'].includes(nativeWorkspace.workspace.plan));
  await click('Save Domain Restrictions');
  assert.ok(writes.some(write => write[0] === 'domain'));
  if (['pro', 'enterprise'].includes(nativeWorkspace.workspace.plan)) {
    await click('Save Guest Settings');
    assert.ok(writes.some(write => write[0] === 'guest'));
  }
  await click('General');
  const input = [...document.querySelectorAll('input')].find(item => item.value === nativeWorkspace.workspace.name);
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setValue.call(input, 'Updated TaskChat workspace'); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  await click('Save Changes');
  assert.equal(writes.find(write => write[0] === 'metadata')[2].name, 'Updated TaskChat workspace');
  assert.equal(useWorkspaceStore.getState().activeWorkspace.name, 'Updated TaskChat workspace');
  await click('Members');
  await React.act(async () => { document.querySelector(`[aria-label="Actions for ${other.userId.name}"]`).click(); });
  await click('Remove Member');
  await React.act(async () => { await lastAlert[2].find(button => button.text === 'Remove').onPress(); });
  assert.ok(writes.some(write => write[0] === 'remove' && write[2] === other.userId._id));
  console.log('PASS normal invitation history/domain controls, owner/plan guest visibility, metadata save API');

  await select(flow.workspace); await click('Members'); failMembers = true;
  await React.act(async () => { await client.invalidateQueries({ queryKey: ['workspaceMembers', flow.workspace._id] }); });
  await waitFor(() => document.body.textContent.includes('Failed to load workspace members.'));
  failMembers = false; await click('Retry');
  await waitFor(() => !document.body.textContent.includes('Failed to load workspace members.'));
  console.log('PASS member loading failure and retry stay distinct from an empty roster');

  await React.act(async () => root.render(null));
  failDetails = true;
  const unknown = { _id: 'unknown', name: 'Unknown source', role: 'owner' };
  dataById.set('unknown', { workspace: unknown, members: [] });
  await select(unknown); await render();
  await waitFor(() => document.body.textContent.includes('Workspace source is unavailable'));
  await click('Invite');
  assert.equal(document.body.textContent.includes('Invite Code'), false);
  failDetails = false;

  let resolveOld;
  delayedDetails = { promise: new Promise(resolve => { resolveOld = resolve; }) };
  await select(flow.workspace);
  await waitFor(() => requests.at(-1));
  const oldRequest = [...requests].reverse().find(request => request.kind === 'details' && request.id === flow.workspace._id);
  delayedDetails = null;
  await select(nativeWorkspace.workspace);
  await React.act(async () => { resolveOld({ data: { data: flow.workspace } }); });
  assert.equal(oldRequest.signal.aborted, true);
  await waitFor(() => document.body.textContent.includes(dataById.get(nativeWorkspace.workspace._id).workspace.name));
  assert.equal(document.body.textContent.includes('Synced with FlowTask'), false);
  await React.act(async () => root.render(null)); await render();
  await waitFor(() => document.body.textContent.includes(dataById.get(nativeWorkspace.workspace._id).workspace.name));
  assert.equal(policies.getWorkspaceOrigin(useWorkspaceStore.getState().activeWorkspace), 'independent');
  console.log('PASS unknown source fails closed; switching aborts old details; reopening preserves origin without stale settings');
  await React.act(async () => root.render(null)); await select(flow.workspace); await render(DirectInvites);
  assert.ok(document.body.textContent.includes("FlowTask's workspace invitation flow"));
  assert.equal(document.querySelectorAll('input').length, 0);
  await select(nativeWorkspace.workspace);
  await waitFor(() => document.body.textContent.includes('Add Members'));
  assert.ok(document.querySelectorAll('input').length > 0);
  const emailInput = document.querySelector('input[placeholder="Enter email address"]');
  await React.act(async () => { setValue.call(emailInput, 'new-member@example.test'); emailInput.dispatchEvent(new window.Event('input', { bubbles: true })); });
  await click('Invite');
  assert.ok(writes.some(write => write[0] === 'email' && write[1] === nativeWorkspace.workspace._id && write[2].role === 'member'));
  assert.equal(client.getQueryState(['workspaceInvites', nativeWorkspace.workspace._id, 'pending', '', 1]).isInvalidated, true);
  let finishInvitation;
  delayedInvitation = new Promise(resolve => { finishInvitation = resolve; });
  await React.act(async () => { setValue.call(emailInput, 'delayed-member@example.test'); emailInput.dispatchEvent(new window.Event('input', { bubbles: true })); });
  await click('Invite');
  const beforeSwitch = navigations.length;
  await select(flow.workspace);
  await React.act(async () => { finishInvitation(); });
  assert.equal(navigations.length, beforeSwitch);
  console.log('PASS direct invitation route blocks FlowTask forms and updates immediately when switching to TaskChat');
  await React.act(async () => root.unmount()); client.clear(); dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
