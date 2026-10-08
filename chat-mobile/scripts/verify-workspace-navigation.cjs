// Executes the actual switcher, store, Home data hook, and React Navigation routers.
// Native UI, storage, sockets, and HTTP are replaced with deterministic adapters.
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
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('root'));
function load(relativePath, mocks, source) {
  const filename = path.join(projectRoot, relativePath);
  const compiled = transformSync(source ?? fs.readFileSync(filename, 'utf8'), {
    loader: 'jsx', format: 'cjs', supported: { 'dynamic-import': false },
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(mocks, name)
    ? (Object.hasOwn(mocks[name], 'default') ? { __esModule: true, ...mocks[name] } : mocks[name])
    : originalRequire(name);
  loaded._compile(compiled, filename);
  return loaded.exports;
}
const element = tag => ({ children, onPress, disabled }) => React.createElement(tag, {
  ...(onPress ? { onClick: onPress, role: 'button', disabled } : {}),
}, children);
const View = element('div');
let alerts = [];
const native = {
  View, Text: element('span'), TouchableOpacity: element('button'), Pressable: element('button'),
  ScrollView: View, ActivityIndicator: element('progress'),
  StyleSheet: { create: x => x, absoluteFillObject: {} }, Platform: { OS: 'web' },
  Animated: { Value: class {}, View, timing: () => ({ start() {} }) },
  Alert: { alert: (...args) => alerts.push(args) },
};
const logger = { default: { error() {}, warn() {}, info() {} } };
const workspaces = [
  { _id: 'workspace-a', name: 'Workspace A', logo: 'https://example.test/a.svg' },
  { _id: 'workspace-b', name: 'Workspace B', logo: 'https://example.test/b.png' },
];
const stored = new Map();
let failPersistence = false;
let pausePersistence;
const storage = { default: {
  getItem: async key => stored.get(key) ?? null,
  setItem: async (key, value) => {
    if (key === 'active_workspace_id') {
      if (failPersistence) throw new Error('Storage unavailable');
      if (pausePersistence) await pausePersistence.promise;
    }
    stored.set(key, value);
  },
  removeItem: async key => stored.delete(key),
} };
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let apiWorkspaceId;
let contextVersion = 0;
let directoryFailure = false;
const remote = [];
const pending = kind => {
  const request = { ...defer(), kind, workspaceId: apiWorkspaceId, contextVersion };
  remote.push(request);
  return request.promise;
};
const api = {
  resolveWorkspaceId: () => apiWorkspaceId,
  getWorkspaceContextVersion: () => contextVersion,
  setCachedWorkspaceId: value => { if (value !== apiWorkspaceId) contextVersion++; apiWorkspaceId = value; },
  workspaceAPI: {
    mine: async () => {
      if (directoryFailure) throw new Error('Workspace directory unavailable');
      return { data: { data: { workspaces } } };
    },
    getMembers: async () => pending('members'),
  },
  threadAPI: { getMyThreads: () => pending('threads') },
  laterAPI: { list: () => pending('later') },
  scheduledAPI: { list: () => pending('scheduled') },
  categoryAPI: {
    list: async () => ({ data: { data: [{ _id: `${apiWorkspaceId}-category`, type: 'custom', channelIds: [] }] } }),
    getDepartments: () => pending('departments'),
  },
  channelAPI: { list: async config => ({ data: { data: { channels: [{
    _id: `${config.headers['X-Workspace-Id']}-channel`, name: `${config.headers['X-Workspace-Id']} channel`, type: 'public',
  }] } } }) },
  default: { get: async () => ({ data: { data: { counts: {} } } }) },
};
const auth = { useAuthStore: create(() => ({ user: { _id: 'test-user' } })) };
const { queryKeys } = load('src/queries/queryKeys.js', {});
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
client.setQueryData(queryKeys.workspaces, workspaces);
const common = { '../services/storage': storage, '../services/api': api, '../utils/logger': logger, './authStore': auth };
const channel = load('src/stores/channelStore.js', { ...common,
  '../services/socket': { getSocket: () => null }, 'react-native-toast-message': { default: { show() {} } },
  '../queries/queryClient': { queryClient: client }, '../queries/queryKeys': { queryKeys },
});
const threads = load('src/stores/threadStore.js', common);
const later = load('src/stores/laterStore.js', common);
const scheduled = load('src/stores/scheduledStore.js', common);
const drafts = load('src/stores/draftStore.js', common);
const chat = { useChatStore: create(() => ({ messagesByChannel: { old: ['old message'] } })) };
const sockets = { disconnectSocket() {}, connectSocket: async () => {
  assert.equal(stored.get('active_workspace_id'), apiWorkspaceId);
} };
const workspace = load('src/stores/workspaceStore.js', { ...common,
  '../queries/queryClient': { queryClient: client }, '../queries/queryKeys': { queryKeys },
  './channelStore': channel, './threadStore': threads, './laterStore': later,
  './scheduledStore': scheduled, './draftStore': drafts, './chatStore': chat, '../services/socket': sockets,
});
const { useWorkspaceStore } = workspace;
const channels = load('src/hooks/queries/useChannels.js', {
  '../../services/api': api, '../../queries/queryKeys': { queryKeys }, '../../stores/channelStore': channel,
});
const { useHomeData } = load('src/hooks/useHomeData.js', {
  '../stores/workspaceStore': workspace, '../stores/authStore': auth,
  '../stores/uiStore': { useUIStore: create(() => ({ enabledHomeCards: {}, toggleHomeCard() {} })) },
  '../stores/channelStore': channel, '../stores/threadStore': threads, '../stores/laterStore': later,
  '../stores/draftStore': drafts, '../stores/scheduledStore': scheduled, '../services/api': api,
  '../utils/i18n': { useTranslation: () => ({ t: text => text }) },
  '../hooks/queries/useChannels': channels,
  '@react-native-async-storage/async-storage': { default: { getItem: async () => null } },
});
const icon = () => null;
const { default: Switcher } = load('src/components/WorkspaceSwitcher.jsx', {
  'react-native': native, '../stores/workspaceStore': workspace,
  '../stores/themeStore': { useThemeStore: () => ({ colors: {} }) },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  'lucide-react-native': { Plus: icon, Settings: icon, HelpCircle: icon, MoreVertical: icon, X: icon },
  './WorkspaceAvatar': { default: ({ workspace: item }) => React.createElement('img', { src: item.logo }) },
  './workspace/AddWorkspaceScreen': { default: () => null },
  '../utils/responsive': { scale: x => x, verticalScale: x => x, moderateScale: x => x },
  '../hooks/useResponsive': { default: () => ({ width: 390 }) }, '../services/api': api,
  '../hooks/queries/useWorkspaces': { useWorkspaces: () => ({ data: workspaces, isLoading: false }) },
  '../utils/logger': logger,
});
// Use the actual route wrapper so regressions in its onWorkspaceSelected callback fail.
const navigationSource = fs.readFileSync(path.join(projectRoot, 'src/navigation/AppNavigation.jsx'), 'utf8');
const ast = parse(navigationSource, { sourceType: 'module', plugins: ['jsx'] });
const wrapper = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'WorkspaceSwitcherScreen');
const { default: SwitcherScreen } = load('src/navigation/WorkspaceSwitcherScreen.fixture.jsx', {
  'react-native': native, '../components/WorkspaceSwitcher': { default: Switcher },
}, `import React from 'react'; import { View } from 'react-native'; import WorkspaceSwitcher from '../components/WorkspaceSwitcher'; export default ${navigationSource.slice(wrapper.start, wrapper.end)}`);
let latestHome;
function Home({ navigation }) {
  latestHome = useHomeData(navigation);
  return React.createElement('div', { 'data-testid': 'home' },
    React.createElement('span', {}, latestHome.activeWorkspace.name),
    React.createElement('img', { src: latestHome.activeWorkspace.logo }),
    latestHome.channels.map(item => React.createElement('span', { key: item._id }, item.name)));
}
let stackState, navigation, stackRouter, StackActions, CommonActions, options;
const render = async () => {
  await React.act(async () => root.render(React.createElement(QueryClientProvider, { client },
    stackState.routes[stackState.index].name === 'WorkspaceSwitcher'
      ? React.createElement(SwitcherScreen, { navigation }) : React.createElement(Home, { navigation }))));
};
const clickWorkspace = async name => {
  const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes(name));
  assert.ok(button, `Missing ${name} card`);
  await React.act(async () => { button.click(); });
};
const waitFor = async predicate => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error('Expected navigation/query state did not arrive');
};
async function openSwitcher(fromChat = false) {
  if (fromChat) stackState = stackRouter.getStateForAction(stackState, CommonActions.navigate('Chat'), options);
  stackState = stackRouter.getStateForAction(stackState, CommonActions.navigate('WorkspaceSwitcher'), options);
  await render();
}
(async () => {
  ({ StackRouter: stackRouter, StackActions, CommonActions } = await import('@react-navigation/routers'));
  stackRouter = stackRouter({ initialRouteName: 'Main' });
  options = { routeNames: ['Main', 'Chat', 'WorkspaceSwitcher'], routeParamList: {}, routeGetIdList: {} };
  stackState = stackRouter.getInitialState(options);
  const mainKey = stackState.routes[0].key;
  navigation = {
    popTo: (name, params) => { stackState = stackRouter.getStateForAction(stackState, StackActions.popTo(name, params), options); },
    goBack: () => { stackState = stackRouter.getStateForAction(stackState, CommonActions.goBack(), options) || stackState; },
    navigate() {},
  };
  await Promise.all([workspace.useWorkspaceStore, channel.useChannelStore, threads.useThreadStore, later.useLaterStore,
    scheduled.useScheduledStore, drafts.useDraftStore].map(store => store.persist.rehydrate()));
  await useWorkspaceStore.getState().switchWorkspace(workspaces[1]._id);
  drafts.useDraftStore.getState().setDraft('draft-a', '<p>A</p>', 'A', workspaces[0]._id);
  drafts.useDraftStore.getState().setDraft('draft-b', '<p>B</p>', 'B', workspaces[1]._id);

  for (const selected of [workspaces[0], workspaces[1], workspaces[0], workspaces[1]]) {
    await openSwitcher(true);
    await clickWorkspace(selected.name);
    assert.equal(stackState.routes[stackState.index].name, 'Main');
    assert.equal(stackState.routes[0].params.screen, 'HomeTab');
    assert.equal(stackState.routes[0].key, mainKey);
    assert.equal(stackState.routes.length, 1);
    assert.equal(useWorkspaceStore.getState().activeWorkspaceId, selected._id);
    assert.equal(stored.get('active_workspace_id'), selected._id);
    assert.equal(apiWorkspaceId, selected._id);
    assert.equal(threads.useThreadStore.getState().unreadThreadCount, 0);
    assert.equal(later.useLaterStore.getState().savedCount, 0);
    await render();
    await waitFor(() => latestHome.channels[0]?._id === `${selected._id}-channel`);
    assert.equal(latestHome.activeWorkspace.logo, selected.logo);
    assert.ok(document.querySelector('[data-testid="home"]').textContent.includes(selected.name));
    assert.equal(latestHome.draftCount, 1);
    assert.equal(stackRouter.getStateForAction(stackState, CommonActions.goBack(), options), null);
  }
  assert.equal(Object.keys(drafts.useDraftStore.getState().drafts).length, 2);
  console.log('PASS A/B/repeated switches: persisted identity/logo, actual Home queries, one Main route, Back excludes switcher, drafts preserved');

  // Keep all card requests pending: selecting the current workspace still opens Home.
  assert.ok(remote.some(request => request.kind === 'threads'));
  await openSwitcher(); await clickWorkspace(workspaces[1].name);
  assert.equal(stackState.routes[0].params.screen, 'HomeTab');
  assert.equal(stackState.routes.length, 1);
  console.log('PASS selecting the active workspace also returns Home without waiting for remote requests');

  await openSwitcher();
  pausePersistence = defer();
  await clickWorkspace(workspaces[0].name);
  assert.equal(stackState.routes[stackState.index].name, 'WorkspaceSwitcher');
  assert.equal(useWorkspaceStore.getState().activeWorkspaceId, workspaces[1]._id);
  assert.equal(apiWorkspaceId, workspaces[1]._id);
  await assert.rejects(useWorkspaceStore.getState().switchWorkspace(workspaces[1]._id), /already in progress/);
  await React.act(async () => { pausePersistence.resolve(); }); pausePersistence = null;
  await waitFor(() => stackState.routes[stackState.index].name === 'Main');
  console.log('PASS navigation waits for persistence; concurrent switches are rejected');

  await openSwitcher(); failPersistence = true;
  await clickWorkspace(workspaces[1].name);
  assert.equal(stackState.routes[stackState.index].name, 'WorkspaceSwitcher');
  assert.equal(useWorkspaceStore.getState().activeWorkspaceId, workspaces[0]._id);
  assert.equal(stored.get('active_workspace_id'), workspaces[0]._id);
  assert.equal(apiWorkspaceId, workspaces[0]._id);
  assert.equal(alerts.at(-1)[0], 'Unable to switch workspace');
  failPersistence = false;
  directoryFailure = true;
  client.setQueryData(queryKeys.workspaces, [workspaces[0]]);
  await clickWorkspace(workspaces[1].name);
  assert.equal(stackState.routes[stackState.index].name, 'WorkspaceSwitcher');
  assert.equal(alerts.at(-1)[1], 'Workspace directory unavailable');
  assert.equal(useWorkspaceStore.getState().activeWorkspaceId, workspaces[0]._id);
  await React.act(async () => { await assert.rejects(useWorkspaceStore.getState().switchWorkspace('missing'), /directory unavailable/); });
  directoryFailure = false;
  await React.act(async () => { await assert.rejects(useWorkspaceStore.getState().switchWorkspace('missing'), /no longer available/); });
  await React.act(async () => { await assert.rejects(useWorkspaceStore.getState().switchWorkspace(undefined), /No workspace selected/); });
  client.setQueryData(queryKeys.workspaces, workspaces);
  assert.equal(useWorkspaceStore.getState().activeWorkspaceId, workspaces[0]._id);
  console.log('PASS storage/API/missing-ID failures preserve current context, stay on switcher, and report errors');

  // Deliver old workspace B responses after A is active: stores must not accept them.
  await React.act(async () => {
    for (const request of remote.filter(item => item.workspaceId === workspaces[1]._id)) {
      request.resolve({ data: { data: {
        threads: [{ _id: 'old-b-thread', hasUnread: true }], messages: [{ _id: 'old-b-message' }],
      } } });
    }
  });
  assert.equal(threads.useThreadStore.getState().threads.length, 0);
  assert.equal(later.useLaterStore.getState().savedCount, 0);
  assert.equal(scheduled.useScheduledStore.getState().scheduledCount, 0);
  console.log('PASS late previous-workspace thread/saved/scheduled responses cannot overwrite active Home cards');
  await React.act(async () => {
    for (const request of remote.filter(item => item.workspaceId === workspaces[0]._id && item.contextVersion === contextVersion)) {
      request.resolve({ data: { data: {
        threads: [{ _id: 'current-a-thread', hasUnread: true }], messages: [{ _id: 'current-a-message' }],
      } } });
    }
  });
  assert.equal(threads.useThreadStore.getState().threads[0]._id, 'current-a-thread');
  await React.act(async () => {
    for (const request of remote.filter(item => item.workspaceId === workspaces[0]._id && item.contextVersion !== contextVersion)) {
      request.resolve({ data: { data: {
        threads: [{ _id: 'outdated-a-thread', hasUnread: true }], messages: [{ _id: 'outdated-a-message' }],
      } } });
    }
  });
  assert.equal(threads.useThreadStore.getState().threads[0]._id, 'current-a-thread');
  assert.equal(later.useLaterStore.getState().savedMessages[0]._id, 'current-a-message');
  assert.equal(scheduled.useScheduledStore.getState().scheduledMessages[0]._id, 'current-a-message');
  console.log('PASS A -> B -> A also rejects responses from the earlier visit to A');
  let requestInterceptor;
  const actualApi = load('src/services/api.js', {
    'react-native': native, './storage': storage,
    './config/environment': { default: { API_BASE_URL: 'https://example.test/api' } },
    '../config/environment': { default: { API_BASE_URL: 'https://example.test/api' } },
    '../utils/logger': logger,
    '../utils/secureStorage': { secureGet: async () => null, secureSet() {}, secureMultiRemove() {} },
    axios: { default: { create: () => ({
      interceptors: { request: { use: fn => { requestInterceptor = fn; } }, response: { use() {} } },
      get: async (_url, config) => requestInterceptor(config),
    }) } },
  });
  actualApi.setCachedWorkspaceId(workspaces[1]._id);
  const scopedRequest = await actualApi.channelAPI.list({ headers: { 'X-Workspace-Id': workspaces[0]._id } });
  assert.equal(scopedRequest.headers['X-Workspace-Id'], workspaces[0]._id);
  assert.equal(requestInterceptor({ headers: {} }).headers['X-Workspace-Id'], workspaces[1]._id);
  console.log('PASS actual API interceptor preserves the channel query workspace while defaulting other requests to the active workspace');
  await React.act(async () => { root.unmount(); });
  client.clear(); dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
