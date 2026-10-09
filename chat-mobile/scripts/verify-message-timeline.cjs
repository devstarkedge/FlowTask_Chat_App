const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const { QueryClient } = require('@tanstack/react-query');
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
const timeline = load('src/utils/messageTimeline.js');
const id = number => `6700000000000000000000${number.toString(16).padStart(2, '0')}`;
const file = (name, mime) => ({ _id: `file-${name}`, originalName: name, mimeType: mime, url: `https://cdn.example/${name}` });
const imageA = file('A.png', 'image/png'), imageB = file('B.jpg', 'image/jpeg'), videoC = file('C.mp4', 'video/mp4');
const record = (number, content, attachment, author = 'sender') => ({
  _id: id(number), createdAt: '2026-10-09T10:00:00.000Z', authorId: { _id: author, name: author },
  contentType: 'text', content, fileReferences: attachment ? [{ fileId: attachment }] : [], attachments: [],
});
const mixed = [record(1, '', imageA), record(2, 'hello'), record(3, '', imageB, 'other'), record(4, '', videoC), record(5, 'done')];
const ids = messages => messages.map(message => message._id);
async function main() {
  assert.deepEqual(ids(timeline.orderMessageRecords([mixed[3], mixed[1], mixed[4], mixed[0], mixed[2]])), ids(mixed));
  assert.deepEqual(ids(timeline.orderMessageRecords([mixed[0], mixed[1], mixed[0], mixed[2]])), ids(mixed.slice(0, 3)));
  const clockSkew = [{ ...mixed[0], createdAt: '2026-10-09T12:00:00Z' }, { ...mixed[1], createdAt: '2026-10-09T09:00:00Z' }];
  assert.deepEqual(ids(timeline.orderMessageRecords(clockSkew.reverse())), ids(mixed.slice(0, 2)), 'Match backend _id order, even with misleading timestamps');
  const pending = { _id: 'temp-X', pending: true, createdAt: '2026-10-09T09:00:00Z', attachments: [imageA] };
  const confirmed = { ...mixed[0], clientMessageId: 'temp-X' };
  assert.deepEqual(ids(timeline.orderMessageRecords([pending, confirmed])), [confirmed._id]);
  assert.equal(timeline.orderMessageRecords([{ ...mixed[0], tempId: 'same' }, { ...mixed[1], tempId: 'same' }]).length, 2, 'Different backend IDs are never merged by alias');
  assert.deepEqual(ids(timeline.orderMessageRecords([pending, mixed[0]])), [mixed[0]._id, 'temp-X']);
  const pages = [{ items: mixed.slice(2) }, { items: mixed.slice(0, 4) }];
  assert.deepEqual(ids(timeline.messagesFromPages(pages)), ids(mixed));
  assert.equal(timeline.messagesFromPages(pages)[2].fileReferences[0].fileId, imageB);

  const client = new QueryClient();
  const queryKeys = { messages: channelId => ['messages', channelId] };
  const cache = load('src/queries/cacheUtils.js', { './queryClient': { queryClient: client }, './queryKeys': { queryKeys } });
  for (const message of [mixed[3], mixed[0], mixed[4], mixed[2], mixed[1], mixed[2]]) cache.addMessageToCache('channel', message);
  assert.deepEqual(ids(timeline.messagesFromPages(client.getQueryData(['messages', 'channel']).pages)), ids(mixed));
  assert.equal(client.getQueryState(['messages', 'channel']).isInvalidated, true, 'Socket seed must still fetch complete history');
  client.setQueryData(['messages', 'channel'], { pages, pageParams: [null, id(3)] });
  cache.addMessageToCache('channel', mixed[0]);
  assert.equal(client.getQueryData(['messages', 'channel']).pages[0].items.some(message => message._id === mixed[0]._id), false, 'Do not append an older-page duplicate');

  let apiItems = [mixed[0], mixed[2], mixed[3], mixed[4]];
  client.setQueryData(['messages', 'channel'], { pages: [{ items: [mixed[1], pending] }], pageParams: [null] });
  const hooks = load('src/hooks/queries/useMessages.js', {
    '@tanstack/react-query': { useInfiniteQuery: config => config, useMutation: config => config, useQueryClient: () => client },
    '../../services/api': { __esModule: true, default: { get: async () => ({ data: { data: { items: apiItems, hasMore: true } } }) } },
    '../../queries/queryKeys': { queryKeys }, '../../stores/authStore': { useAuthStore: { getState: () => ({ user: { _id: 'sender' } }) } }, '../../services/offlineQueue': {}, '../../stores/chatStore': {},
  });
  const history = await hooks.useMessages('channel').queryFn({ pageParam: null });
  assert.deepEqual(ids(history.items), [...ids(mixed), 'temp-X']);
  assert.equal(history.nextCursor, mixed[0]._id);
  apiItems = [{ ...mixed[0], clientMessageId: 'temp-X' }, ...mixed.slice(1)];
  const refreshed = await hooks.useMessages('channel').queryFn({ pageParam: null });
  assert.deepEqual(ids(refreshed.items), ids(mixed));
  assert.deepEqual(ids(refreshed.items), ids(timeline.messagesFromPages([{ items: mixed }])));
  const stagedMutation = hooks.useSendMessage();
  const stagingArgs = { channelId: 'staged-channel', content: '', tempId: 'temp-media-stage', options: { _stageOnly: true, optimisticAttachments: [imageA] } };
  await stagedMutation.onMutate(stagingArgs);
  const beforeUpload = client.getQueryData(['messages', 'staged-channel']).pages[0].items[0];
  assert.equal(beforeUpload._id, stagingArgs.tempId);
  assert.equal(beforeUpload.optimisticAttachments[0].url, imageA.url);
  const stageResult = await stagedMutation.mutationFn(stagingArgs);
  assert.equal(stageResult.isStaged, true, 'Staging creates only a local row, not a backend message');
  stagedMutation.onSuccess(stageResult, stagingArgs);
  await stagedMutation.onMutate({ ...stagingArgs, options: { fileReferences: ['file-A'], optimisticAttachments: [imageA] } });
  assert.equal(client.getQueryData(['messages', 'staged-channel']).pages[0].items.length, 1);
  assert.equal(client.getQueryData(['messages', 'staged-channel']).pages[0].items[0].createdAt, beforeUpload.createdAt, 'Upload completion must not reorder the staged row');
  client.setQueryData(['messages', 'channel'], {
    pages: [{ items: mixed.slice(2), nextCursor: mixed[2]._id }], pageParams: [null],
  });
  apiItems = mixed.slice(0, 2);
  const older = await hooks.useMessages('channel').queryFn({ pageParam: mixed[2]._id });
  assert.deepEqual(ids(older.items), ids(mixed.slice(0, 2)), 'An older-page fetch must not merge the previous newer page');
  client.setQueryData(['messages', 'channel'], { pages: [{ items: [pending, mixed[1]] }], pageParams: [null] });
  cache.reconcileMessageInCache('channel', 'temp-X', confirmed);
  cache.addMessageToCache('channel', confirmed);
  assert.deepEqual(ids(timeline.messagesFromPages(client.getQueryData(['messages', 'channel']).pages)), ids(mixed.slice(0, 2)));

  const preview = load('src/utils/filePreviewInfo.js');
  const media = load('src/utils/mediaUtils.js', {
    '../config/environment': { __esModule: true, default: { API_BASE_URL: 'https://chat.example/api/chat' } }, './filePreviewInfo': preview,
  });
  const native = { Platform: { OS: 'ios' }, StyleSheet: { create: value => value } };
  for (const name of ['View', 'Text', 'TouchableOpacity', 'Pressable']) native[name] = name;
  const mocks = {
    'react-native': native, 'lucide-react-native': { Reply: 'Reply', Pin: 'Pin', Bookmark: 'Bookmark' },
    '../utils/dateUtils': { formatTime: () => '10:00', isSameDay: () => true },
    '../utils/responsive': { scale: value => value, moderateScale: value => value, verticalScale: value => value },
    '../stores/laterStore': { useLaterStore: selector => selector({ savedMessageIds: [] }) },
    '../utils/logger': { __esModule: true, default: { info() {} } }, '../utils/mediaUtils': media,
    '../utils/replyUtils': { hasValidReplyTo: () => false },
    '../utils/composerAttachments': load('src/utils/composerAttachments.js'),
  };
  for (const name of ['common/AppAvatar', 'AudioMessagePlayer', 'VideoMessagePlayer', 'GifRenderer', 'RichText', 'common/MobileFileCard', 'MessageStatusTicks', 'ReactionBar', 'ReplyQuotePreview']) {
    mocks[`./${name}`] = { __esModule: true, default: name };
  }
  const Row = load('src/components/ChatMessageItem.jsx', mocks).default.type;
  function walk(node, found = []) {
    if (Array.isArray(node)) node.forEach(item => walk(item, found));
    else if (node && typeof node === 'object') { found.push(node); walk(node.props?.children, found); }
    return found;
  }
  const actions = [], reactions = [];
  const render = (item, prevItem = null, nextItem = null, viewer = 'viewer') => Row({
    item, prevItem, nextItem, user: { _id: viewer },
    colors: { messageBubbleSent: 'sent', messageBubbleReceived: 'received', border: 'border' },
    styles: { bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 } }, searchResults: [],
    channelMembers: [], renderDateSeparator: () => React.createElement('Date'),
    showMessageActions: (message, attachment) => actions.push({ message, attachment }),
    addReaction: (messageId, emoji) => reactions.push({ messageId, emoji }),
  });
  const tree = render(mixed[2], mixed[1], mixed[3]);
  const card = walk(tree).find(node => node.type === 'common/MobileFileCard');
  card.props.onLongPress();
  assert.equal(actions[0].message._id, mixed[2]._id); assert.equal(actions[0].attachment.url, imageB.url);
  walk(tree).find(node => node.type === 'ReactionBar').props.onAddReaction('👍');
  assert.deepEqual(reactions, [{ messageId: mixed[2]._id, emoji: '👍' }]);
  const historical = { ...record(6, ''), fileReferences: [], attachments: [imageA, imageB, videoC] };
  assert.equal(render(record(10, '[flowtask-file:abc123]')), null, 'Legacy marker-only rows are not visible messages');
  const copiedCaption = render({ ...record(11, 'check this [flowtask-file:abc123]', imageA), htmlContent: '<p>check this [flowtask-file:abc123]</p>' });
  const copiedText = walk(copiedCaption).find(node => node.type === 'RichText');
  assert.equal(copiedText.props.text, 'check this ');
  assert.equal(copiedText.props.html, '<p>check this </p>');
  assert.equal(walk(copiedCaption).filter(node => node.type === 'common/MobileFileCard').length, 1);
  assert.equal(timeline.orderMessageRecords([historical]).length, 1);
  assert.equal(walk(render(historical)).filter(node => ['common/MobileFileCard', 'VideoMessagePlayer'].includes(node.type)).length, 3);
  const mediaNodes = tree => walk(tree).filter(node => ['common/MobileFileCard', 'VideoMessagePlayer'].includes(node.type));
  const paintedCards = tree => walk(tree).filter(node =>
    [node.props?.style].flat(Infinity).some(style => ['sent', 'received'].includes(style?.backgroundColor)));
  for (const viewer of ['viewer', 'sender']) {
    const groupedTree = render(historical, null, null, viewer);
    assert.equal(paintedCards(groupedTree).length, 3, 'Same per-attachment bounds for incoming and outgoing');
    assert.deepEqual(paintedCards(groupedTree).map(card => mediaNodes(card).length), [1, 1, 1], 'No painted container spans multiple attachments');
    const cards = mediaNodes(groupedTree);
    assert.deepEqual(cards.map(card => card.props.file?.url || card.props.videoUrl), [imageA.url, imageB.url, videoC.url]);
    cards[1].props.onLongPress();
    assert.equal(actions.at(-1).message._id, historical._id);
    assert.equal(actions.at(-1).attachment.url, imageB.url);
    assert.equal(walk(groupedTree).find(node => node.type === 'ReactionBar').props.messageId, historical._id);
  }
  const portraitVideo = { ...videoC, width: 1080, height: 1920 };
  const groupedVideos = { ...historical, contentType: 'video', attachments: [portraitVideo, { ...portraitVideo, _id: 'video-D', url: 'https://cdn.example/D.mp4' }] };
  const videoTree = render(groupedVideos);
  assert.equal(mediaNodes(videoTree).length, 2, 'A video-typed historical message must retain every video');
  assert.equal(mediaNodes(videoTree)[0].props.width, 1080);
  assert.equal(mediaNodes(videoTree)[0].props.height, 1920);
  assert.equal(paintedCards(videoTree).length, 2);
  client.removeQueries({ queryKey: ['messages', 'channel'] });
  apiItems = [historical];
  const groupedHistory = await hooks.useMessages('channel').queryFn({ pageParam: null });
  cache.addMessageToCache('grouped-channel', historical);
  cache.addMessageToCache('grouped-channel', historical);
  const groupedLive = timeline.messagesFromPages(client.getQueryData(['messages', 'grouped-channel']).pages);
  assert.equal(groupedLive.length, 1);
  assert.equal(groupedHistory.items.length, 1);
  for (const message of [groupedLive[0], groupedHistory.items[0]]) {
    assert.equal(message._id, historical._id);
    assert.deepEqual(mediaNodes(render(message)).map(card => card.props.file?.url || card.props.videoUrl), [imageA.url, imageB.url, videoC.url]);
    assert.equal(paintedCards(render(message)).length, 3);
  }
  const separate = [record(7, '', imageA), record(8, '', imageB), record(9, '', videoC)];
  const rows = separate.map((message, index) => render(message, separate[index - 1], separate[index + 1]));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => walk(row).filter(node => ['common/MobileFileCard', 'VideoMessagePlayer'].includes(node.type)).length), [1, 1, 1]);

  // Execute the real text renderer; inspecting RichText props alone misses its HTML path.
  const RichText = load('src/components/RichText.jsx', {
    react: { ...React, useMemo: calculate => calculate() },
    'react-native': { ...native, Image: 'Image', Linking: {} },
    '../utils/formatConverter': load('src/utils/formatConverter.js'),
    '../utils/responsive': mocks['../utils/responsive'],
    '../utils/mediaUtils': media,
  }).default.type;
  const examples = ['fvjsd', 'dfghdfk', 'dbfmjjshdkl'].map((content, index) => record(20 + index, content));
  function renderedText(node) {
    if (Array.isArray(node)) return node.map(renderedText).join('');
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    return node && typeof node === 'object' ? renderedText(node.props?.children) : '';
  }
  const recordedLines = ['dnfjksdjkg', 'gnskdng', 'dsjmdg', 'dgfshdl', 'gjsdhjg'];
  for (const breakTag of ['<br>', '<br/>', '<br />', '<br class="line-break">']) {
    const html = `<p>${recordedLines.join(breakTag)}</p>`;
    assert.equal(renderedText(RichText({ html, text: recordedLines.join('\n'), colors: {} })), recordedLines.join('\n'),
      `Desktop hard breaks must survive HTML conversion: ${breakTag}`);
  }
  const converter = load('src/utils/formatConverter.js');
  assert.equal(converter.pellToTipTap('<p><img src="photo.jpg"><b>bold</b><i>italic</i></p>'),
    '<p><img src="photo.jpg"><strong>bold</strong><em>italic</em></p>');
  for (const format of ['plain', 'paragraph', 'bold']) {
    const incoming = examples.map(message => ({
      ...message,
      htmlContent: format === 'plain' ? undefined : format === 'bold'
        ? `<p><strong>${message.content}</strong></p>` : `<p>${message.content}</p>`,
    }));
    client.removeQueries({ queryKey: ['messages', 'example'] });
    incoming.forEach(message => cache.addMessageToCache('example', message));
    // Repeated socket delivery must not duplicate rows or combine different IDs.
    cache.addMessageToCache('example', incoming[1]);
    const live = timeline.messagesFromPages(client.getQueryData(['messages', 'example']).pages);
    client.removeQueries({ queryKey: ['messages', 'channel'] });
    apiItems = [...incoming].reverse();
    const fetched = await hooks.useMessages('channel').queryFn({ pageParam: null });
    const historyRecords = timeline.messagesFromPages([{ items: fetched.items }]);
    for (const records of [live, historyRecords]) {
      assert.equal(records.length, 3, `${format}: three independent message records`);
      assert.deepEqual(ids(records), ids(examples));
      assert.deepEqual(records.map(message => message.content), examples.map(message => message.content));
      records.forEach((message, index) => {
        const row = render(message, records[index - 1], records[index + 1]);
        const textNodes = walk(row).filter(node => node.type === 'RichText');
        assert.equal(textNodes.length, 1, 'Each message owns its own text renderer');
        assert.equal(renderedText(RichText(textNodes[0].props)), examples[index].content);
        const reaction = walk(row).find(node => node.type === 'ReactionBar');
        reaction.props.onAddReaction('❤️');
        assert.equal(reactions.at(-1).messageId, message._id);
      });
    }
  }
  client.clear();
  console.log('PASS: canonical same-time/mixed/sender order; socket/history parity; pagination dedup; ACK identities; independent row actions/reactions; real RichText message boundaries; historical groups preserved');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
