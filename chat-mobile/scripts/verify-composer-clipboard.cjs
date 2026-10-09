const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { parse } = require('@babel/parser');
const React = require('react');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const filename = path.join(root, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, filename);
  return mod.exports;
}
const helpers = load('src/utils/composerAttachments.js');
const source = fs.readFileSync(path.join(root, 'src/components/MessageComposer.jsx'), 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const component = ast.program.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'MessageComposer');
const body = component.declarations[0].init.arguments[0].body.body;
function callback(name, context) {
  const node = body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === name).declarations[0].init.arguments[0];
  return vm.runInNewContext(`(${source.slice(node.start, node.end)})`, context);
}
async function main() {
  // Conditional JSX branches must resolve their components even when the
  // default composer state doesn't render them (e.g. full-screen video preview).
  const traverse = require('@babel/traverse').default;
  traverse(ast, { JSXOpeningElement(element) {
    const name = element.node.name;
    if (name.type === 'JSXIdentifier' && /^[A-Z]/.test(name.name)) {
      assert.ok(element.scope.hasBinding(name.name), `Undefined composer component: ${name.name}`);
    }
  } });
  let thumbnailKey, thumbnailSource;
  traverse(ast, { JSXOpeningElement(element) {
    for (const attr of element.node.attributes) {
      if (attr.type !== 'JSXAttribute' || attr.value?.type !== 'JSXExpressionContainer') continue;
      const value = attr.value.expression;
      const snippet = source.slice(value.start, value.end);
      if (attr.name.name === 'key' && snippet.startsWith('file._tempUri')) thumbnailKey = snippet;
      if (attr.name.name === 'source' && snippet.includes('file.localPreviewUri')) thumbnailSource = snippet;
    }
  } });
  const pendingPreview = { _tempUri: 'file:///B.jpg', url: 'https://cdn.example/B.jpg' };
  assert.equal(vm.runInNewContext(thumbnailKey, { file: pendingPreview, i: 1 }), vm.runInNewContext(thumbnailKey, { file: { ...pendingPreview, _id: 'uploaded-B' }, i: 0 }),
    'Sending/removing the first file must not change the remaining preview key');
  assert.equal(vm.runInNewContext(`(${thumbnailSource})`, { file: pendingPreview }).uri, pendingPreview._tempUri,
    'Composer preview must not switch to a network URL when upload finishes');
  const marker = '[flowtask-file:abc123]';
  const file = { _id: 'pdf', originalName: 'Query.pdf', mimeType: 'application/pdf', url: 'https://cdn.example/query.pdf' };
  const parsed = await helpers.consumeComposerAttachments({ html: `<p>check this ${marker}</p>`, text: `check this ${marker}` }, async () => file);
  assert.equal(parsed.text, 'check this '); assert.equal(parsed.html, '<p>check this </p>'); assert.equal(parsed.files[0]._id, 'pdf');
  assert.equal(helpers.stripFileMarkers('[ordinary brackets]'), '[ordinary brackets]');
  await assert.rejects(helpers.consumeComposerAttachments({ html: marker, text: marker }, async () => null), /expired or unavailable/);
  assert.equal(helpers.appendComposerAttachments(parsed.files, parsed.files).length, 1);
  // Files -> clipboard -> paste -> send uses the existing image reference,
  // never downloads/decodes/reuploads the image through binary clipboard data.
  let clipboardText, storedClipboard, copyFailure = false;
  const clipboard = load('src/services/FileClipboardService.js', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async () => storedClipboard, setItem: async (_, value) => { storedClipboard = value; },
    } },
    'expo-clipboard': { setStringAsync: async value => { if (copyFailure) throw new Error('Clipboard unavailable'); clipboardText = value; },
      setImageAsync: () => { throw new Error('Binary clipboard must not be used'); } },
    '../stores/authStore': { useAuthStore: { getState: () => ({ user: { _id: 'user' } }) } },
    '../stores/workspaceStore': { useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'workspace' }) } },
    '../utils/logger': { __esModule: true, default: { info() {}, warn() {}, error() {} } },
  }).default;
  const filesSource = fs.readFileSync(path.join(root, 'src/screens/FilesScreen.jsx'), 'utf8');
  const filesAst = parse(filesSource, { sourceType: 'module', plugins: ['jsx'] });
  const copyNode = filesAst.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration.body.body
    .find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'handleCopyLink').declarations[0].init;
  let copying = {}, notifications = [];
  const copy = vm.runInNewContext(`(${filesSource.slice(copyNode.start, copyNode.end)})`, {
    copyingFiles: copying, setCopyingFiles: update => { copying = update(copying); },
    getFileKind: () => 'image', FileClipboardService: clipboard,
    FileService: { copyImage() { throw new Error('Binary image copy must not be used'); } },
    messageAPI: { getFileProxyUrl: id => `https://chat.example/files/${id}` },
    Toast: { show: value => notifications.push(value) }, logger: { error() {} },
  });
  await copy({ id: 'image-file', mimeType: 'image/jpeg', originalName: 'photo.jpg' });
  assert.match(clipboardText, /^\[flowtask-file:[a-zA-Z0-9]+\]$/);
  assert.equal(notifications.at(-1).type, 'success'); assert.equal(copying['image-file'], false);
  const copiedImage = await helpers.consumeComposerAttachments({ html: `<p>${clipboardText}</p>`, text: clipboardText }, value => clipboard.resolveMarker(value));
  assert.equal(copiedImage.files[0]._id, 'image-file');
  assert.equal(copiedImage.files[0].url, 'https://chat.example/files/image-file');
  const reused = await load('src/utils/mediaSendBatch.js', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-file-system/legacy': {},
    '../services/api': { fileAPI: { uploadFiles() { throw new Error('Existing file must not be uploaded'); } } },
  }).prepareMediaFile(copiedImage.files[0], 'channel');
  assert.equal(reused._id, 'image-file');
  for (const mimeType of ['image/jpeg', 'image/heic']) {
    await copy({ _id: 'camera-photo', mimeType, originalName: 'camera-photo', width: 8064, height: 6048, size: 18000000 });
    const camera = await helpers.consumeComposerAttachments({ html: `<p>${clipboardText}</p>`, text: clipboardText }, value => clipboard.resolveMarker(value));
    assert.equal(camera.files[0]._id, 'camera-photo');
    assert.equal(camera.files[0].mimeType, mimeType);
    assert.equal(camera.files[0].width, 8064);
    assert.equal(camera.files[0].status, 'completed');
    assert.equal(camera.files[0].uri, undefined, 'Copied camera image never becomes a Base64 upload');
  }
  copyFailure = true; await copy({ _id: 'failed-copy', mimeType: 'image/jpeg' });
  assert.equal(notifications.at(-1).type, 'error'); assert.equal(copying['failed-copy'], false);
  const writes = [], uploadBodies = [];
  const OriginalFormData = global.FormData;
  global.FormData = class { constructor() { this.entries = []; } append(...entry) { this.entries.push(entry); } };
  try {
    const prepare = load('src/utils/mediaSendBatch.js', {
      'react-native': { Platform: { OS: 'android' } },
      'expo-file-system/legacy': { cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
        writeAsStringAsync: async (...args) => writes.push(args), downloadAsync: async uri => ({ uri, status: 200 }) },
      '../services/api': { fileAPI: { uploadFiles: async (_, body) => {
        uploadBodies.push(body.entries); return { data: { data: { files: [{ _id: 'uploaded' }] } } };
      } } },
    }).prepareMediaFile;
    const prepared = await prepare({ uri: 'data:video/mp4;base64,aGVsbG8=', name: 'clip.mp4', mimeType: 'video/mp4' }, 'channel');
    assert.equal(writes[0][1], 'aGVsbG8='); assert.equal(writes[0][2].encoding, 'base64');
    assert.match(uploadBodies[0][0][1].uri, /^file:\/\/\/cache\/paste_/);
    assert.equal(uploadBodies[0][0][1].type, 'video/mp4'); assert.equal(prepared._id, 'uploaded');
  } finally { global.FormData = OriginalFormData; }
  for (const tag of ['<img src="data:image/png;base64,aGVsbG8=">', '<video src="data:video/mp4;base64,aGVsbG8="></video>']) {
    const result = await helpers.consumeComposerAttachments({ html: `<p>${tag}</p>`, text: '' }, async () => null);
    assert.equal(result.files.length, 1); assert.equal(result.text, ''); assert.equal(result.html, '<p></p>');
  }
  const sends = [], alerts = [];
  const build = load('src/components/chat/buildChatEditorHtml.js', {
    '../../screens/Canvas/EditorHtml': { EDITOR_HTML: '<html><style></style><body></body></html>' },
  }).buildChatEditorHtml;
  const generated = build();
  const canvas = load('src/screens/Canvas/EditorHtml.js');
  const realBuild = load('src/components/chat/buildChatEditorHtml.js', {
    '../../screens/Canvas/EditorHtml': canvas,
  }).buildChatEditorHtml;
  const realDocument = realBuild();
  // Test the actual bundle: it contains </body> inside a DOMParser string.
  // The former first-match insertion split its script and exposed JavaScript text.
  const bundleStart = canvas.EDITOR_HTML.indexOf('function br(n)');
  assert.ok(bundleStart >= 0);
  const bundleSnippet = canvas.EDITOR_HTML.slice(bundleStart, bundleStart + 180);
  assert.ok(realDocument.includes(bundleSnippet), 'Clipboard bridge must not modify the bundled DOMParser code');
  const pasteStart = realDocument.indexOf("document.addEventListener('paste'");
  assert.ok(pasteStart > realDocument.lastIndexOf('window.addEventListener(\'message\''), 'Paste listener follows the complete editor scripts');
  assert.ok(realDocument.slice(pasteStart).endsWith('</html>\n') || realDocument.trim().endsWith('</html>'));
  const { JSDOM } = require('jsdom');
  const document = new JSDOM(realDocument).window.document;
  for (const script of document.querySelectorAll('script')) {
    new vm.Script(script.textContent); // A split bundle must fail, not leak as body text.
  }
  const visibleBody = document.body.cloneNode(true);
  visibleBody.querySelectorAll('script, style').forEach(node => node.remove());
  assert.equal(visibleBody.textContent.includes('window.DOMParser'), false, 'Editor code is never visible composer content');
  assert.equal(document.querySelector('script:last-of-type').textContent.includes("document.addEventListener('paste'"), true);
  const pasteScript = [...generated.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const bridgeEvents = [];
  let pasteHandler;
  vm.runInNewContext(pasteScript, {
    document: { addEventListener: (name, handler, capture) => { assert.equal(name, 'paste'); assert.equal(capture, true); pasteHandler = handler; } },
    FileReader: class { readAsDataURL(file) { this.result = file.data; this.onload(); } },
    sendToRN: (type, payload) => bridgeEvents.push({ type, payload }),
  });
  let prevented = false;
  pasteHandler({ clipboardData: { items: [{ kind: 'file', getAsFile: () => ({ name: 'clip.mp4', type: 'video/mp4', data: 'data:video/mp4;base64,aGVsbG8=' }) }] },
    preventDefault: () => { prevented = true; }, stopImmediatePropagation() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prevented, true); assert.equal(bridgeEvents[0].type, 'pasteFiles');
  assert.equal(bridgeEvents[0].payload.files[0].mimeType, 'video/mp4');
  const ref = { current: null };
  const Editor = load('src/components/chat/ChatRichTextEditor.jsx', {
    react: { ...React, useCallback: fn => fn, useMemo: fn => fn(), useRef: value => ({ current: value }),
      useState: value => [value, () => {}], useEffect() {}, useImperativeHandle: (ref, create) => { ref.current = create(); } },
    'react-native': { View: 'View', StyleSheet: { create: x => x }, Platform: { OS: 'ios' } },
    'react-native-webview': { WebView: 'WebView' }, './buildChatEditorHtml': { buildChatEditorHtml: () => '<html></html>' },
    '../../utils/responsive': { moderateScale: x => x, verticalScale: x => x }, '../../utils/logger': {},
  }).default.render;
  Editor({}, ref);
  ref.current.setContent(`<p>${marker}</p>`, marker);
  ref.current.setContent('<p></p>', '');
  assert.equal(ref.current.getContent().text, '', 'Cleaning HTML also clears cached plain text synchronously');
  let state = [];
  const context = {
    ...helpers, pendingPasteRef: { current: Promise.resolve() }, pendingFilesRef: { current: [] }, draftTimerRef: { current: null },
    latestContentRef: { current: { html: '', text: '' } },
    editorRef: { current: { html: marker, text: marker, setContent(html, text) { this.html = html; this.text = text; }, getContent() { return { html: this.html, text: this.text }; }, clear() { this.html = ''; this.text = ''; } } },
    FileClipboardService: { resolveMarker: async () => file },
    setPendingFiles(value) { state = typeof value === 'function' ? value(state) : value; },
    onChangeText() {}, channelId: 'channel', emitTyping() {}, typingTimeoutRef: { current: null },
    logger: { warn() {} }, Alert: { alert: (...args) => alerts.push(args) }, clearTimeout, setTimeout,
    sendLock: { current: false }, setIsSending() {}, text: '', pendingFiles: [], pendingMentions: [], replyingTo: null, members: [], editingMessage: null,
    onStageMedia: undefined, onMediaFailed: undefined,
    onSend: async (content, options) => sends.push({ content, options }),
    sendMediaBatch: async options => { for (const item of options.files) await options.onSend('', { fileReferences: [item._id] }); return []; },
    activeWorkspaceId: 'workspace', setPendingMentions() {}, clearDraft() {}, saveDraftNow() {}, onCancelReply() {}, lastSavedRef: { current: '' },
    stripHtml: html => html.replace(/<[^>]*>/g, '').trim(),
    markdownToHtml: text => text ? `<p>${text}</p>` : '',
  };
  await callback('handleEditorUpdate', context)({ html: `<p>${marker}</p>`, text: marker });
  assert.equal(context.latestContentRef.current.text, ''); assert.equal(context.editorRef.current.text, '');
  assert.equal(context.pendingFilesRef.current.length, 1);
  await callback('handleSend', context)();
  assert.equal(sends.length, 1); assert.equal(sends[0].content, ''); assert.equal(sends[0].options.fileReferences[0], 'pdf'); assert.equal(alerts.length, 0);
  for (const mimeType of ['image/png', 'video/mp4', 'application/pdf']) {
    sends.length = 0;
    context.pendingFilesRef.current = [{ _id: mimeType, mimeType }];
    context.editorRef.current.html = ''; context.editorRef.current.text = '';
    await callback('handleSend', context)();
    assert.equal(sends.length, 1); assert.equal(sends[0].content, '');
  }
  sends.length = 0; context.pendingFilesRef.current = [];
  await callback('handleSend', context)(); assert.equal(sends.length, 0);
  const originalBatch = context.sendMediaBatch;
  const selected = [{ _id: 'selected-A', _tempUri: 'file:///A.jpg' }, { _id: 'selected-B', _tempUri: 'file:///B.jpg' }];
  state = selected;
  context.pendingFilesRef.current = selected;
  let batchOptions, finishBatch;
  context.sendMediaBatch = options => {
    batchOptions = options;
    assert.equal(state.length, 0, 'Composer clears selected thumbnails before uploads begin');
    return new Promise(resolve => { finishBatch = resolve; });
  };
  const handingOff = callback('handleSend', context)();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.sendLock.current, true);
  batchOptions.onRemainingFiles(selected);
  assert.equal(state.length, 0, 'Uploading/queued files do not reappear in composer');
  const fresh = { _id: 'new-C', _tempUri: 'file:///C.jpg' };
  state = [fresh]; context.pendingFilesRef.current = state;
  const failed = { ...selected[0], status: 'failed', error: 'Network failure', _clientMessageId: 'retry-A' };
  batchOptions.onRemainingFiles([failed, selected[1]]);
  assert.deepEqual(Array.from(state, file => file._id), ['selected-A', 'new-C'], 'Only failures return; a newly selected file is preserved');
  finishBatch([failed]); await handingOff;
  assert.deepEqual(Array.from(state, file => file._id), ['selected-A', 'new-C']);
  assert.equal(state[0]._clientMessageId, 'retry-A');
  context.sendMediaBatch = originalBatch;
  const originalSend = context.onSend;
  state = selected; context.pendingFilesRef.current = selected;
  context.editorRef.current.html = '<p>caption</p>'; context.editorRef.current.text = 'caption';
  context.onSend = async () => { throw new Error('Send rejected'); };
  await callback('handleSend', context)();
  assert.deepEqual(Array.from(state, file => file._id), ['selected-A', 'selected-B'], 'Rejected handoff restores the submitted files');
  context.onSend = originalSend;
  state = []; context.pendingFilesRef.current = [];
  // Run the actual Send handler with a delayed response, then type the next
  // message while it is pending. ACK must never erase that new draft.
  for (const reject of [false, true]) {
    let finish;
    const submitted = { html: '<p>first message</p>', text: 'first message' };
    context.latestContentRef.current = submitted;
    context.editorRef.current.setContent(submitted.html, submitted.text);
    context.onSend = () => new Promise((resolve, fail) => { finish = reject ? () => fail(new Error('Offline')) : resolve; });
    const sending = callback('handleSend', context)();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(context.editorRef.current.text, '', 'Text leaves composer before network response');
    assert.equal(context.latestContentRef.current.text, '');
    const next = { html: '<p>next message</p>', text: 'next message' };
    context.latestContentRef.current = next;
    context.editorRef.current.setContent(next.html, next.text);
    finish(); await sending;
    assert.equal(context.editorRef.current.text, reject ? 'first message\nnext message' : 'next message', 'Failure restores submission; success preserves new typing');
    assert.equal(context.sendLock.current, false);
  }
  context.onSend = originalSend;
  context.MediaLibrary = { getAssetInfoAsync: async () => ({ localUri: 'file:///photo.jpg' }) };
  context.pendingFiles = [];
  await callback('handleFilesSelected', context)([{ uri: 'ph://photo-id', assetId: 'photo-id', fileName: 'photo.jpg', mimeType: 'image/jpeg' }]);
  assert.equal(state[0]._tempUri, 'file:///photo.jpg', 'Photo assets become local files before composer preview');
  context.MediaLibrary.getAssetInfoAsync = async () => null;
  const beforeMissingAsset = state;
  await callback('handleFilesSelected', context)([{ uri: 'ph://missing', assetId: 'missing' }]);
  assert.equal(state, beforeMissingAsset, 'Unavailable photo assets do not enter native image views');
  assert.equal(alerts.at(-1)[0], 'Media could not be opened');
  // Match the installed RN API: absoluteFillObject has been removed.
  const native = { StyleSheet: { create: x => x }, View: 'View', TouchableOpacity: 'TouchableOpacity', Modal: 'Modal', SafeAreaView: 'SafeAreaView' };
  const Video = load('src/components/VideoMessagePlayer.jsx', {
    react: { ...React, useState: value => [value, () => {}], useRef: () => ({ current: null }) },
    'react-native': native, './common/AppVideo': { __esModule: true, default: 'AppVideo' },
    'lucide-react-native': { Play: 'Play', X: 'X', Loader2: 'Loader2' },
    '../utils/responsive': { scale: x => x, moderateScale: x => x }, '../utils/mediaUtils': { normalizeMediaUrl: x => x }, '../utils/logger': {},
  }).default;
  function walk(node) { return Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : []; }
  for (const [width, height] of [[1920, 1080], [1080, 1920], [400, 400]]) {
    const nodes = walk(Video({ videoUrl: 'https://cdn.example/video.mp4', width, height }));
    const preview = nodes.find(node => node.type === 'TouchableOpacity');
    const overlay = nodes.find(node => node.props?.pointerEvents === 'none');
    assert.equal(overlay.props.style.alignItems, 'center'); assert.equal(overlay.props.style.justifyContent, 'center');
    assert.equal(overlay.props.style.top, 0); assert.equal(overlay.props.style.bottom, 0);
    const previewLayer = nodes.find(node => node.type === 'AppVideo');
    assert.equal(previewLayer.props.style.position, 'absolute');
    assert.equal(previewLayer.props.style.bottom, 0);
    assert.equal(previewLayer.props.style.right, 0);
    assert.equal(nodes.find(node => node.type === 'Play').props.style, undefined);
    assert.equal(preview.props.style[1].height, 220 / (width / height));
  }
  console.log('PASS: resolved clipboard tokens consumed; captions/brackets preserved; unavailable references rejected; inline media queued; PDF/image/video-only actual sends; empty send rejected; preview-relative video overlay');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
