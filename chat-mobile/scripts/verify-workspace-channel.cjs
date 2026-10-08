// Focused regression checks independent of the project's existing Jest setup.
// Run: node scripts/verify-workspace-channel.cjs [workspace-response.json]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { parse } = require('@babel/parser');

const projectRoot = path.resolve(__dirname, '..');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('root'));
const workspaces = process.argv[2]
  ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).data.workspaces
  : [{ _id: 'one', name: 'First workspace', logo: 'https://example.com/logo.svg', role: 'admin' }, { _id: 'two', name: 'Second workspace', logo: null }];

function load(relativePath, mocks) {
  const filename = path.join(projectRoot, relativePath);
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code;
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

const element = tag => ({ children, source, onError, accessibilityLabel, onPress }) => React.createElement(tag, {
  ...(source ? { src: source.uri } : {}), onError, 'aria-label': accessibilityLabel,
  ...(onPress ? { onClick: onPress, role: 'button' } : {}),
}, children);
const View = element('div');
const native = {
  View, Text: element('span'), Image: element('img'), TouchableOpacity: View,
  ScrollView: View, Pressable: View, ActivityIndicator: element('progress'),
  StyleSheet: { create: value => value, absoluteFillObject: {}, hairlineWidth: 1 },
  Platform: { OS: 'web' }, Alert: { alert() {} },
  Animated: { Value: class {}, View, timing: () => ({ start() {} }) },
};
const colors = { primary: '#123456', textPrimary: '#111111', textSecondary: '#555555', messageTextSent: '#ffffff' };
const theme = { useThemeStore: () => ({ colors }) };
const responsive = { scale: value => value, verticalScale: value => value, moderateScale: value => value };
const logger = { default: { error() {}, warn() {}, info() {} } };
const media = { normalizeMediaUrl: value => value || '' };
let svgProps;
const svg = { SvgUri: props => { svgProps = props; return React.createElement('svg', { 'data-uri': props.uri }); } };
const Avatar = load('src/components/WorkspaceAvatar.jsx', {
  'react-native': native, 'expo-linear-gradient': { LinearGradient: View },
  'react-native-svg': svg, '../stores/themeStore': theme,
  '../utils/mediaUtils': media, '../utils/logger': logger,
}).default;

async function render(component) { await React.act(async () => { root.render(component); }); }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await React.act(async () => { await sleep(10); });
    if (predicate()) return;
  }
  throw new Error('Timed out waiting for query state');
}

(async () => {
  const logoWorkspace = workspaces.find(ws => ws.logo) || workspaces[0];
  await render(React.createElement(Avatar, { workspace: logoWorkspace }));
  assert.equal(document.querySelector('svg')?.getAttribute('data-uri'), logoWorkspace.logo);
  await React.act(async () => { svgProps.onError(new Error('HTTP 404')); });
  assert.equal(document.querySelector('svg'), null);
  assert.ok(document.body.textContent.includes(logoWorkspace.name[0].toUpperCase()));
  await render(React.createElement(Avatar, { workspace: { ...logoWorkspace, logo: 'https://example.com/new-logo.png' } }));
  assert.equal(document.querySelector('img')?.getAttribute('src'), 'https://example.com/new-logo.png');
  console.log('PASS SVG logo routing, failed-image fallback, and updated logo on the same avatar');

  let resolveSwitch;
  let closed = false;
  const storeState = { activeWorkspace: workspaces[0], isLoading: true, error: 'previous store error', fetchWorkspaces: async () => workspaces,
    switchWorkspace: () => new Promise(resolve => { resolveSwitch = resolve; }) };
  const icon = () => null;
  const Switcher = load('src/components/WorkspaceSwitcher.jsx', {
    'react-native': native, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../stores/workspaceStore': { useWorkspaceStore: () => storeState }, '../stores/themeStore': theme,
    'lucide-react-native': { Plus: icon, Settings: icon, HelpCircle: icon, MoreVertical: icon, X: icon },
    './WorkspaceAvatar': { default: Avatar }, './workspace/AddWorkspaceScreen': { default: () => null },
    '../utils/responsive': responsive, '../hooks/useResponsive': { default: () => ({ width: 390 }) },
    '../services/api': { default: { get: async () => ({ data: { data: { counts: {} } } }) } },
    '../hooks/queries/useWorkspaces': { useWorkspaces: () => ({ data: workspaces, isLoading: false, error: null }) },
    '../utils/logger': logger,
  }).default;
  await render(React.createElement(Switcher, { visible: true, onClose: () => { closed = true; } }));
  for (const workspace of workspaces) assert.ok(document.body.textContent.includes(workspace.name));
  assert.equal(document.querySelector('progress'), null);
  const destination = [...document.querySelectorAll('[role="button"]')].find(button => button.textContent.includes(workspaces[1].name));
  await React.act(async () => { destination.click(); });
  assert.equal(closed, false);
  await React.act(async () => { resolveSwitch(); });
  assert.equal(closed, true);
  console.log('PASS cached workspace names survive store refresh/error; switching waits for completion');

  const { queryKeys } = load('src/queries/queryKeys.js', {});
  const stored = new Map();
  let cachedWorkspaceId;
  const workspaceClient = new QueryClient();
  workspaceClient.setQueryData(queryKeys.workspaces, workspaces);
  const { useWorkspaceStore } = load('src/stores/workspaceStore.js', {
    '../services/storage': { default: { getItem: async key => stored.get(key) || null, setItem: async (key, value) => stored.set(key, value), removeItem: async key => stored.delete(key) } },
    '../utils/logger': logger,
    '../services/api': { workspaceAPI: {}, setCachedWorkspaceId: id => { cachedWorkspaceId = id; } },
    '../queries/queryClient': { queryClient: workspaceClient }, '../queries/queryKeys': { queryKeys },
  });
  let refreshes = 0;
  useWorkspaceStore.setState({ refreshWorkspaceContext: async () => {
    assert.equal(cachedWorkspaceId, useWorkspaceStore.getState().activeWorkspaceId);
    assert.equal(stored.get('active_workspace_id'), cachedWorkspaceId);
    refreshes++;
  } });
  for (const workspace of [workspaces[0], workspaces[1], workspaces[0]]) {
    await useWorkspaceStore.getState().switchWorkspace(workspace._id);
    assert.equal(useWorkspaceStore.getState().activeWorkspace.name, workspace.name);
    assert.equal(useWorkspaceStore.getState().activeWorkspace.logo, workspace.logo);
  }
  assert.equal(refreshes, 3);
  workspaceClient.clear();
  console.log('PASS actual workspace store preserves name/logo and header/storage context across switches');

  // Execute the channel-opening effect extracted from the actual screen source.
  // This catches an undefined fetchMembers call after async message initialization.
  const screenSource = fs.readFileSync(path.join(projectRoot, 'src/screens/Chat/ChatScreen.jsx'), 'utf8');
  const screenAst = parse(screenSource, { sourceType: 'module', plugins: ['jsx'] });
  const screenFunction = screenAst.program.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'ChatScreen').declarations[0].init;
  const initialization = screenFunction.body.body.find(node => node.type === 'ExpressionStatement' && node.expression.callee?.name === 'useEffect' && node.expression.arguments[0].body?.body.some(statement => statement.declarations?.some(declaration => declaration.id.name === 'initData'))).expression.arguments[0];
  const callbackSource = screenSource.slice(initialization.start, initialization.end);
  let joined = 0;
  let reported = 0;
  let messageResult = async () => ({ error: null });
  const effectContext = {
    channelId: 'opened-channel', channelName: 'Channel', getSocket: () => ({ connected: true, emit: () => { joined++; } }),
    refetchMessages: () => messageResult(), channelAPI: { addMember: async () => { throw new Error('Unexpected join after screen left'); } },
    useAuthStore: { getState: () => ({ user: { _id: 'user' } }) }, Toast: { show() {} },
    queryClient: { invalidateQueries() {} }, queryKeys,
    logger: { error: () => { reported++; } },
  };
  const openChannel = new Function(...Object.keys(effectContext), `return (${callbackSource});`)(...Object.values(effectContext));
  const openingErrors = [];
  const onOpeningError = error => openingErrors.push(error);
  process.on('unhandledRejection', onOpeningError);
  try {
    openChannel();
    await sleep(10);
    assert.equal(joined, 1);
    assert.equal(reported, 0);
    messageResult = async () => ({ error: new Error('Messages unavailable') });
    openChannel();
    await sleep(10);
    assert.equal(reported, 1);
    let finishOldRequest;
    messageResult = () => new Promise(resolve => { finishOldRequest = resolve; });
    const leaveChannel = openChannel();
    leaveChannel();
    finishOldRequest({ error: { response: { status: 403 } } });
    await sleep(10);
    assert.equal(reported, 1);
    assert.equal(openingErrors.length, 0);
    console.log('PASS actual channel-opening effect, message errors, and navigation away during a delayed request');
  } finally { process.off('unhandledRejection', onOpeningError); }

  let memberRequest;
  const requests = [];
  const { useChannelMembers } = load('src/hooks/queries/useChannelMembers.js', {
    '../../queries/queryKeys': { queryKeys },
    '../../services/api': { usersAPI: { getChannelMembers: (channelId, config) => {
      const request = { channelId, signal: config.signal };
      requests.push(request);
      return memberRequest(request);
    } } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
  let latest;
  function Members({ channelId }) { latest = useChannelMembers(channelId); return null; }
  const tree = channelId => React.createElement(QueryClientProvider, { client }, React.createElement(Members, { channelId }));
  const unhandled = [];
  const onUnhandled = error => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  try {
    memberRequest = request => new Promise((resolve, reject) => {
      request.resolve = resolve;
      request.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    });
    await render(tree('channel-a'));
    await until(() => requests.length === 1);
    await render(tree('channel-b'));
    await until(() => requests.length === 2);
    assert.equal(requests[0].signal.aborted, true);
    await React.act(async () => { requests[1].resolve({ data: { data: { members: [{ _id: 'member-b', name: 'Member B' }] } } }); });
    await until(() => latest.isSuccess);
    assert.equal(latest.data[0]._id, 'member-b');
    await render(null);
    memberRequest = async () => { throw new Error('Member API unavailable'); };
    await render(tree('channel-error'));
    await until(() => latest.isError);
    assert.equal(latest.error.message, 'Member API unavailable');
    assert.equal(unhandled.length, 0);
    await render(null);
    memberRequest = request => new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
    await render(tree('channel-unmount'));
    await until(() => requests.some(request => request.channelId === 'channel-unmount'));
    await render(null);
    assert.equal(requests.find(request => request.channelId === 'channel-unmount').signal.aborted, true);
    assert.equal(unhandled.length, 0);
    console.log('PASS channel member loading, channel changes, cancellation on unmount, and handled API failures');
  } finally {
    process.off('unhandledRejection', onUnhandled);
    await render(null);
    client.clear();
  }
  await React.act(async () => { root.unmount(); });
  dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
