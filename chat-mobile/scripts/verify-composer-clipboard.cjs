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
  const marker = '[flowtask-file:abc123]';
  const file = { _id: 'pdf', originalName: 'Query.pdf', mimeType: 'application/pdf', url: 'https://cdn.example/query.pdf' };
  const parsed = await helpers.consumeComposerAttachments({ html: `<p>check this ${marker}</p>`, text: `check this ${marker}` }, async () => file);
  assert.equal(parsed.text, 'check this '); assert.equal(parsed.html, '<p>check this </p>'); assert.equal(parsed.files[0]._id, 'pdf');
  assert.equal(helpers.stripFileMarkers('[ordinary brackets]'), '[ordinary brackets]');
  await assert.rejects(helpers.consumeComposerAttachments({ html: marker, text: marker }, async () => null), /expired or unavailable/);
  assert.equal(helpers.appendComposerAttachments(parsed.files, parsed.files).length, 1);
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
    ...helpers, pendingPasteRef: { current: Promise.resolve() }, pendingFilesRef: { current: [] },
    latestContentRef: { current: { html: '', text: '' } },
    editorRef: { current: { html: marker, text: marker, setContent(html, text) { this.html = html; this.text = text; }, getContent() { return { html: this.html, text: this.text }; }, clear() {} } },
    FileClipboardService: { resolveMarker: async () => file },
    setPendingFiles(value) { state = typeof value === 'function' ? value(state) : value; },
    onChangeText() {}, channelId: 'channel', emitTyping() {}, typingTimeoutRef: { current: null },
    logger: { warn() {} }, Alert: { alert: (...args) => alerts.push(args) }, clearTimeout, setTimeout,
    sendLock: { current: false }, setIsSending() {}, text: '', pendingFiles: [], pendingMentions: [], replyingTo: null, members: [], editingMessage: null,
    onSend: async (content, options) => sends.push({ content, options }),
    sendMediaBatch: async options => { for (const item of options.files) await options.onSend('', { fileReferences: [item._id] }); return []; },
    activeWorkspaceId: 'workspace', setPendingMentions() {}, clearDraft() {}, saveDraftNow() {}, onCancelReply() {}, lastSavedRef: { current: '' },
    stripHtml: html => html.replace(/<[^>]*>/g, '').trim(),
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
