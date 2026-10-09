const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const { QueryClient } = require('@tanstack/react-query');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const filename = path.join(root, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, filename);
  return mod.exports;
}
const environment = { API_BASE_URL: 'https://chat.example/api/chat' };
const preview = load('src/utils/filePreviewInfo.js');
const mediaUtils = load('src/utils/mediaUtils.js', {
  '../config/environment': { __esModule: true, default: environment }, './filePreviewInfo': preview,
});
const { getDownloadableMedia } = load('src/utils/mediaDownload.js', { './mediaUtils': mediaUtils });

async function main() {
  const uploadBodies = [];
  const OriginalFormData = global.FormData;
  global.FormData = class { constructor() { this.entries = []; } append(...entry) { this.entries.push(entry); } };
  const { sendMediaBatch, prepareMediaFile } = load('src/utils/mediaSendBatch.js', {
    '../services/api': { fileAPI: { uploadFiles: async (_channel, body) => {
      uploadBodies.push(body.entries); return { data: { data: { files: [{ _id: `file-${uploadBodies.length}`, url: 'https://cdn.example/media.jpg' }] } } };
    } } }, 'react-native': { Platform: { OS: 'android' } }, 'expo-file-system/legacy': {},
  });
  try {
    const files = [{ name: 'A.jpg', mimeType: 'image/jpeg', _tempUri: 'file:///A.jpg' },
      { name: 'B.mp4', mimeType: 'video/mp4', _tempUri: 'file:///B.mp4' },
      { name: 'C.png', mimeType: 'image/png', _tempUri: 'file:///C.png' }];
    const timeline = [], records = [], remainingUpdates = [];
    let activeUploads = 0, maximumUploads = 0, activeSends = 0;
    const failed = await sendMediaBatch({ files, channelId: 'channel', baseOptions: { parentMessageId: 'reply' },
      prepare: async file => {
        maximumUploads = Math.max(maximumUploads, ++activeUploads);
        assert.ok(activeUploads <= 2); timeline.push(`upload ${file.name}`);
        try { await Promise.resolve(); return await prepareMediaFile(file, 'channel'); }
        finally { activeUploads--; }
      },
      onSend: async (content, options) => {
        assert.equal(activeSends++, 0); timeline.push(`send ${options.fileReferences[0]}`);
        assert.equal(options.fileReferences.length, 1); assert.equal(options.parentMessageId, 'reply');
        await Promise.resolve(); records.push({ _id: `message-${records.length + 1}`, content, ...options }); activeSends--;
      },
      onRemainingFiles: files => remainingUpdates.push(files.map(file => file.name)),
    });
    assert.equal(failed.length, 0);
    assert.equal(maximumUploads, 2, 'Upload overlaps instead of waiting for the prior message');
    assert.deepEqual(timeline.filter(event => event.startsWith('send')), ['send file-1', 'send file-2', 'send file-3']);
    assert.equal(new Set(records.map(record => record._id)).size, 3);
    assert.equal(new Set(records.map(record => record._clientMessageId)).size, 3);
    assert.deepEqual(remainingUpdates, [['B.mp4', 'C.png'], ['C.png'], []]);
    assert.equal(records[0].optimisticAttachments[0].url, 'file:///A.jpg');
    assert.equal(records[1].optimisticAttachments[0].url, 'file:///B.mp4');
    assert.deepEqual(uploadBodies.map(body => body[0][1].type), ['image/jpeg', 'video/mp4', 'image/png']);
    const gates = [], started = [], orderedSends = [];
    const overlap = sendMediaBatch({ files, channelId: 'channel', baseOptions: {},
      prepare: file => {
        started.push(file.name);
        return new Promise(resolve => { gates[files.findIndex(item => item.name === file.name)] = () => resolve({ ...file, _id: file.name }); });
      },
      onSend: async (_, options) => orderedSends.push(options.fileReferences[0]),
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(started, ['A.jpg', 'B.mp4']);
    gates[1]();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(started, ['A.jpg', 'B.mp4', 'C.png']);
    gates[2]();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(orderedSends, [], 'Later completed uploads cannot overtake the first message');
    gates[0]();
    await overlap;
    assert.deepEqual(orderedSends, ['A.jpg', 'B.mp4', 'C.png']);
    let success = [];
    const failures = await sendMediaBatch({ files, channelId: 'channel', baseOptions: {},
      prepare: async file => { if (file.name === 'B.mp4') throw new Error('Upload failed'); return { ...file, _id: file.name }; },
      onSend: async (_, options) => success.push(options.fileReferences[0]),
    });
    assert.deepEqual(success, ['A.jpg', 'C.png']); assert.equal(failures.length, 1);
    assert.equal(failures[0].name, 'B.mp4'); assert.equal(failures[0].status, 'failed');
    let retryId;
    const sendFailure = await sendMediaBatch({ files: [files[1]], channelId: 'channel', baseOptions: {},
      prepare: async file => ({ ...file, _id: 'uploaded-B' }),
      onSend: async (_, options) => { retryId = options._clientMessageId; throw new Error('Connection lost after upload'); },
    });
    assert.equal(sendFailure[0]._id, 'uploaded-B');
    const uploadCount = uploadBodies.length;
    await sendMediaBatch({ files: sendFailure, channelId: 'channel', baseOptions: {}, onSend: async (_, options) => {
      assert.equal(options._clientMessageId, retryId); assert.deepEqual(options.fileReferences, ['uploaded-B']);
    } });
    assert.equal(uploadBodies.length, uploadCount, 'Retry uploaded files without uploading twice');
  } finally { global.FormData = OriginalFormData; }

  const image = { url: 'https://cdn.example/B.png', mimeType: 'image/png', originalName: 'B.png' };
  const video = { url: 'https://cdn.example/B.mp4', mimeType: 'video/mp4', originalName: 'B.mp4' };
  assert.deepEqual(getDownloadableMedia(image, {}), { url: image.url, name: 'B.png', mime: 'image/png' });
  assert.equal(getDownloadableMedia(video, {}).name, 'B.mp4');
  assert.equal(getDownloadableMedia(null, { content: 'text' }), null);
  assert.equal(getDownloadableMedia({ url: 'https://cdn.example/file.pdf', mimeType: 'application/pdf' }, {}), null);
  assert.equal(getDownloadableMedia(image, { type: 'system' }), null);
  assert.equal(getDownloadableMedia(image, { isDeleted: true }), null);
  assert.equal(getDownloadableMedia(image, { pending: true }), null);
  assert.equal(getDownloadableMedia({ ...image, url: 'file:///local.png' }, {}), null);
  assert.equal(getDownloadableMedia({ ...video, originalName: undefined }, {}).name, 'media.mp4');
  assert.equal(getDownloadableMedia({ ...image, url: '/messages/files/123' }, {}).url, 'https://chat.example/api/chat/messages/files/123');
  const localFile = { ...image, _id: 'file-B', url: 'file:///B.png', localPreviewUri: 'file:///B.png' };
  const unpopulated = mediaUtils.getMessageAttachments({
    fileReferences: ['file-B'], attachments: [], optimisticAttachments: [localFile],
  });
  assert.equal(unpopulated.length, 1, 'An empty attachments array must not hide the selected preview');
  assert.equal(unpopulated[0].url, 'file:///B.png');
  const confirmedFiles = mediaUtils.getMessageAttachments({
    fileReferences: [{ fileId: { ...image, _id: 'file-B' } }], attachments: [], optimisticAttachments: [localFile],
  });
  assert.equal(confirmedFiles[0].url, image.url);
  assert.equal(confirmedFiles[0].localPreviewUri, 'file:///B.png', 'Retain local preview while remote image is loading');
  assert.equal(mediaUtils.getMessageAttachments({ attachments: [], files: [image] }).length, 1);

  const cardReact = require('react');
  let cardState = [], cardIndex = 0;
  const nativeCard = { StyleSheet: { create: value => value, absoluteFillObject: { position: 'absolute' } } };
  for (const name of ['View', 'Text', 'TouchableOpacity', 'Image', 'ActivityIndicator']) nativeCard[name] = name;
  const Card = load('src/components/common/MobileFileCard.jsx', {
    react: { ...cardReact, useState: initial => {
      const key = cardIndex++; if (!(key in cardState)) cardState[key] = initial;
      return [cardState[key], value => { cardState[key] = value; }];
    }, useCallback: fn => fn },
    'react-native': nativeCard, '../../utils/mediaUtils': mediaUtils,
    '../../utils/responsive': { scale: value => value, verticalScale: value => value, moderateScale: value => value },
    '../../stores/authStore': { useAuthStore: { getState: () => ({}) } },
    '../../stores/workspaceStore': { useWorkspaceStore: { getState: () => ({}) } },
    '../../utils/logger': { __esModule: true, default: { info() {}, warn() {} } },
    'lucide-react-native': new Proxy({}, { get: (_target, key) => key }),
    '../chat/preview': { __esModule: true, default: 'Preview', KIND_COLORS: { image: '#fff', file: '#fff' },
      resolvePreviewFile: file => ({ name: file.name, fileUrl: file.url, thumbUrl: file.thumbnailUrl, kind: 'image', mime: 'image/png' }) },
  }).default;
  function cardNodes(node, result = []) {
    if (Array.isArray(node)) node.forEach(item => cardNodes(item, result));
    else if (node && typeof node === 'object') { result.push(node); cardNodes(node.props?.children, result); }
    return result;
  }
  const renderCard = file => { cardIndex = 0; return cardNodes(Card({ file, colors: {} })); };
  let rendered = renderCard(confirmedFiles[0]);
  assert.equal(rendered.filter(node => node.type === 'Image').length, 2);
  assert.equal(rendered.filter(node => node.type === 'ActivityIndicator').length, 1);
  assert.equal(rendered.find(node => node.type === 'Image' && !node.props.onLoad).props.source.uri, 'file:///B.png');
  const remoteImage = rendered.find(node => node.type === 'Image' && node.props.onLoad);
  assert.equal(remoteImage.props.style[1].opacity, 0);
  remoteImage.props.onLoad();
  rendered = renderCard(confirmedFiles[0]);
  assert.equal(rendered.filter(node => node.type === 'Image').length, 1);
  assert.equal(rendered.filter(node => node.type === 'ActivityIndicator').length, 0);
  rendered.find(node => node.type === 'Image').props.onError({ nativeEvent: { error: 'Old image unavailable' } });
  rendered = renderCard({ ...confirmedFiles[0], url: `${image.url}?v=2`, thumbnailUrl: `${image.url}?v=2` });
  assert.equal(rendered.filter(node => node.type === 'Image').length, 2, 'Old URL error must not suppress a new URL');

  const { parse } = require('@babel/parser');
  const vm = require('node:vm');
  const composerSource = fs.readFileSync(path.join(root, 'src/components/MessageComposer.jsx'), 'utf8');
  const composerAst = parse(composerSource, { sourceType: 'module', plugins: ['jsx'] });
  const component = composerAst.program.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'MessageComposer');
  const sendCallback = component.declarations[0].init.arguments[0].body.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'handleSend').declarations[0].init.arguments[0];
  for (const editing of [false, true]) {
    const sends = [], prepared = [];
    const context = {
      editorRef: { current: { getContent: () => ({ text: 'caption', html: '<p>caption</p>' }), clear() {} } },
      latestContentRef: { current: { text: 'caption', html: '<p>caption</p>' } }, text: '',
      pendingFiles: [{ _id: 'A', name: 'A.jpg' }, { _id: 'B', name: 'B.mp4' }],
      pendingMentions: [], replyingTo: null, members: [], editingMessage: editing ? { _id: 'old-group' } : null,
      sendLock: { current: false }, setIsSending() {}, channelId: 'channel', activeWorkspaceId: 'workspace',
      pendingPasteRef: { current: Promise.resolve() },
      draftTimerRef: { current: null },
      onStageMedia: undefined, onMediaFailed: undefined,
      pendingFilesRef: { current: [{ _id: 'A', name: 'A.jpg' }, { _id: 'B', name: 'B.mp4' }] },
      hasFileMarkers: load('src/utils/composerAttachments.js').hasFileMarkers,
      onSend: async (content, options) => sends.push({ content, options }),
      prepareMediaFile: async file => { prepared.push(file._id); return file; },
      sendMediaBatch: async options => {
        for (const file of options.files) await options.onSend('', { ...options.baseOptions, fileReferences: [file._id] });
        return [];
      },
      setPendingFiles() {}, setPendingMentions() {}, onChangeText() {}, clearDraft() {}, saveDraftNow() {},
      onCancelEdit() {}, onCancelReply() {}, lastSavedRef: { current: '' }, typingTimeoutRef: { current: null },
      emitTyping() {}, Alert: { alert: () => { throw new Error('Unexpected send error'); } },
    };
    await vm.runInNewContext(`(${composerSource.slice(sendCallback.start, sendCallback.end)})()`, context);
    assert.equal(context.sendLock.current, false);
    if (editing) {
      assert.equal(sends.length, 1); assert.deepEqual(Array.from(sends[0].options.fileReferences), ['A', 'B']);
    } else {
      assert.deepEqual(sends.map(send => send.content), ['caption', '', '']);
      assert.deepEqual(sends.slice(1).map(send => send.options.fileReferences), [['A'], ['B']]);
    }
  }

  for (const platform of ['ios', 'android']) {
    const calls = [], toasts = [];
    let status = 200, allowed = true;
    const download = load('src/utils/fileDownload.js', {
      '../config/environment': { __esModule: true, default: environment }, './mediaUtils': mediaUtils,
      'expo-file-system/legacy': { cacheDirectory: 'file:///cache/', downloadAsync: async (url, target, options) => {
        calls.push({ url, target, options }); return { status, uri: target };
      } },
      './safeMediaLibrary': { __esModule: true, default: {
        requestPermissionsAsync: async writeOnly => { assert.equal(writeOnly, true); return { granted: allowed }; },
        saveToLibraryAsync: async uri => calls.push({ saved: uri }),
      } },
      'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async uri => calls.push({ shared: uri }) },
      'react-native': { Platform: { OS: platform } },
      'react-native-toast-message': { __esModule: true, default: { show: toast => toasts.push(toast) } },
      './logger': { __esModule: true, default: { warn() {}, error() {} } },
      '../stores/authStore': { useAuthStore: { getState: () => ({ accessToken: 'private-token' }) } },
      '../stores/workspaceStore': { useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'workspace' }) } },
    });
    assert.equal(await download.downloadAndSaveFile(image.url, image.originalName, image.mimeType), true);
    assert.equal(calls[0].url, image.url); assert.deepEqual(calls[0].options.headers, {});
    assert.ok(calls[1].saved.endsWith('_B.png'));
    assert.equal(await download.downloadAndSaveFile('/messages/files/123', 'clip.mp4', 'video/mp4'), true);
    const privateDownload = calls.find(call => call.url?.includes('/messages/files/123'));
    assert.deepEqual(privateDownload.options.headers, { Authorization: 'Bearer private-token', 'X-Workspace-Id': 'workspace' });
    assert.equal(await download.downloadAndSaveFile('https://outside.example/api/chat/private.jpg', 'private.jpg', 'image/jpeg'), true);
    assert.deepEqual(calls.find(call => call.url?.includes('outside.example')).options.headers, {});
    status = 403; assert.equal(await download.downloadAndSaveFile(video.url, 'clip.mp4', 'video/mp4'), false);
    assert.equal(toasts.at(-1).type, 'error');
    status = 200; allowed = false;
    assert.equal(await download.downloadAndSaveFile(video.url, 'clip.mp4', 'video/mp4'), true);
    assert.ok(calls.at(-1).shared.endsWith('_clip.mp4'));
    assert.equal(await download.downloadAndSaveFile('data:invalid', 'clip.mp4', 'video/mp4'), false);
  }

  // Render the existing action sheet, not a substitute menu. Native download
  // must start once, after the correct platform's modal dismissal boundary.
  const React = require('react');
  function walk(node, found = []) {
    if (Array.isArray(node)) node.forEach(item => walk(item, found));
    else if (node && typeof node === 'object') { found.push(node); walk(node.props?.children, found); }
    return found;
  }
  for (const platform of ['ios', 'android']) {
    let values = [], index = 0, effects = [], downloads = [], closes = 0;
    const react = { ...React,
      useState: initial => { const key = index++; if (!(key in values)) values[key] = initial; return [values[key], value => { values[key] = value; }]; },
      useRef: initial => { const key = index++; if (!(key in values)) values[key] = { current: initial }; return values[key]; },
      useEffect: fn => effects.push(fn),
    };
    const native = { Platform: { OS: platform }, StyleSheet: { create: value => value } };
    for (const key of ['View', 'Text', 'TouchableOpacity', 'Modal', 'ScrollView']) native[key] = key;
    const Sheet = load('src/components/MessageActionSheet.jsx', {
      react, 'react-native': native, 'lucide-react-native': new Proxy({}, { get: (_target, key) => key }),
      'expo-clipboard': {}, 'react-native-toast-message': { __esModule: true, default: { show() {} } },
      '../stores/preferencesStore': { usePreferencesStore: () => ({}) },
      '../stores/useStarredStore': { useStarredStore: () => ({ toggleFavorite() {}, isFavorited: () => false }) },
      '../utils/emojiUtils': { applySkinTone: value => value },
      '../utils/responsive': { scale: value => value, verticalScale: value => value, moderateScale: value => value },
      '../hooks/useResponsive': { __esModule: true, default: () => ({ width: 390 }) },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
      '../utils/fileDownload': { downloadAndSaveFile: async (...args) => { downloads.push(args); } },
      '../services/FileService': {}, '../services/FileClipboardService': {},
      '../utils/mediaUtils': mediaUtils, '../utils/mediaDownload': { getDownloadableMedia },
    }).default;
    const render = (attachment = image, message = { _id: 'message-B', content: '', attachments: [image, video] }) => {
      index = 0; effects = [];
      return Sheet({ visible: true, onClose: () => closes++, attachment, message, colors: {}, user: { _id: 'self' } });
    };
    const button = tree => walk(tree).find(node => node.type === 'TouchableOpacity' &&
      [].concat(node.props?.children || []).some(child => child?.type === 'Text' && child.props.children === 'Download'));
    assert.equal(button(render(null, { _id: 'text', content: 'hello' })), undefined);
    assert.equal(button(render({ url: 'https://cdn.example/document.pdf', mimeType: 'application/pdf' })), undefined);
    button(render(video)).props.onPress();
    assert.equal(downloads.length, 0);
    const dismissing = render(video);
    assert.equal(dismissing.props.visible, false);
    if (platform === 'ios') dismissing.props.onDismiss();
    else effects.forEach(effect => effect());
    dismissing.props.onDismiss(); // Native duplicate callback cannot save twice.
    assert.equal(downloads.length, 1); assert.equal(closes, 1);
    assert.deepEqual(downloads[0], [video.url, 'B.mp4', 'video/mp4']);
  }

  // Exercise real optimistic REST reconciliation twice, as can happen after
  // the socket has already supplied the same confirmed message ID.
  const client = new QueryClient();
  const hook = load('src/hooks/queries/useMessages.js', {
    '@tanstack/react-query': { useQueryClient: () => client, useMutation: config => config },
    '../../services/api': { __esModule: true, default: {}, fileAPI: {}, messageAPI: {} },
    '../../queries/queryKeys': { queryKeys: { messages: id => ['messages', id] } },
    '../../stores/authStore': { useAuthStore: { getState: () => ({ user: { _id: 'self', name: 'Sender' } }) } },
    '../../services/offlineQueue': {}, '../../stores/chatStore': {},
  }).useSendMessage();
  const variables = { channelId: 'channel', tempId: 'temp-A', content: '', options: { fileReferences: ['A'] } };
  await hook.onMutate(variables);
  const result = { reply: { _id: 'server-A', fileReferences: [{ fileId: image }] } };
  hook.onSuccess(result, variables); hook.onSuccess(result, variables);
  assert.equal(client.getQueryData(['messages', 'channel']).pages[0].items.length, 1);
  assert.equal(client.getQueryData(['messages', 'channel']).pages[0].items[0]._id, 'server-A');
  const cache = load('src/queries/cacheUtils.js', {
    './queryClient': { queryClient: client },
    './queryKeys': { queryKeys: { messages: id => ['messages', id] } },
  });
  cache.reconcileMessageInCache('channel', 'temp-A', result.reply);
  cache.addMessageToCache('channel', result.reply);
  assert.equal(client.getQueryData(['messages', 'channel']).pages[0].items.length, 1);
  client.setQueryData(['messages', 'receiver'], { pages: [{ items: [] }], pageParams: [null] });
  for (const id of ['A', 'B', 'C']) {
    cache.addMessageToCache('receiver', { _id: id, attachments: [image], createdAt: new Date().toISOString() });
    cache.addMessageToCache('receiver', { _id: id, attachments: [image], createdAt: new Date().toISOString() });
  }
  assert.equal(client.getQueryData(['messages', 'receiver']).pages[0].items.length, 3);
  cache.addReactionToMessageCache('receiver', 'B', '👍', { _id: 'reactor' });
  const received = client.getQueryData(['messages', 'receiver']).pages[0].items;
  assert.equal(received.find(item => item._id === 'B').reactions.length, 1);
  assert.equal(received.find(item => item._id === 'A').reactions, undefined);
  assert.equal(received.find(item => item._id === 'C').reactions, undefined);
  client.clear();
  console.log('PASS: separate persisted-send calls, selection order, mixed media, independent failures/retries, stable retry IDs, exact media target, media-only eligibility, native add-only saving/share fallback, protected URL headers and optimistic reconciliation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
