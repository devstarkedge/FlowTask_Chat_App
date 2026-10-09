const assert = require('node:assert/strict');

async function main() {
  const { buildNewMessageSections: build } = await import('../src/utils/newMessageSections.js');
  const dms = [
    { _id: 'z', type: 'dm', name: 'Zara', dmRecipientId: 'user-z' },
    { _id: 'a', type: 'dm', name: 'anil', dmParticipants: ['self', { _id: 'user-a', flowTaskUserId: 'external-a' }] },
  ];
  const channels = [{ _id: 'c10', name: 'Team 10' }, { _id: 'c2', name: 'Team 2' }];
  const people = [
    { _id: 'user-z', name: 'Zara' },
    { _id: 'external-a', name: 'anil' },
    { _id: 'new-z', name: 'Zoe' },
    { _id: 'new-a', name: 'Arun' },
    { _id: 'new-a', name: 'Arun' },
  ];
  const input = { dms, channels, people, recent: [...dms], filtered: false, currentUserId: 'self' };
  const snapshot = JSON.stringify(input);
  let sections = build(input);
  assert.deepEqual(sections.map(s => s.title), ['Direct Messages', 'Channels']);
  assert.deepEqual(sections[0].data.map(x => x.name), ['anil', 'Arun', 'Zara', 'Zoe']);
  assert.deepEqual(sections[1].data.map(x => x.name), ['Team 2', 'Team 10']);
  assert.equal(JSON.stringify(input), snapshot, 'Do not mutate shared query data');
  assert.equal(sections[0].data[0], dms[1], 'Keep original navigation data');
  sections = build({ ...input, dms: [...dms, dms[0]], channels: [...channels, channels[0]] });
  assert.equal(sections[0].data.length, 4); assert.equal(sections[1].data.length, 2);
  const recent = [{ _id: 'r2', name: 'Zulu', dmRecipientId: 'r-user' }, { _id: 'r1', name: 'Alpha' }];
  sections = build({ ...input, recent });
  assert.deepEqual(sections.map(s => s.type), ['direct', 'channel', 'dm']);
  assert.deepEqual(sections[2].data.map(x => x._id), ['r2', 'r1'], 'Keep Recent in incoming recency order');
  sections = build({ ...input, filtered: true });
  assert.equal(sections.some(s => s.title === 'Recent'), false);
  sections = build({ ...input, dms: [], recent: [], people: [] });
  assert.deepEqual(sections.map(s => s.title), ['Channels']);
  assert.deepEqual(build({ ...input, dms: [], channels: [], recent: [], people: [] }), []);
  sections = build({ ...input, people: [{ _id: 'different', name: 'Zara' }] });
  assert.ok(sections[0].data.some(item => item._id === 'different'), 'Never deduplicate people by name');
  sections = build({ ...input, people: [{ _id: 'self', name: 'You' }] });
  assert.equal(sections[0].data.some(item => item._id === 'self'), false);
  sections = build({ ...input, dms: [], recent: [] });
  assert.equal(sections[0].title, 'Direct Messages', 'Members without chats must come before Channels');
  assert.equal(sections[1].title, 'Channels');
  // Execute the screen's actual row dispatcher: an existing conversation opens
  // directly, while a member without a conversation uses the create-DM action.
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const { parse } = require('@babel/parser');
  const { transformSync } = require('esbuild');
  const source = fs.readFileSync(path.join(__dirname, '../src/screens/NewMessageScreen.jsx'), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const statements = ast.program.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'NewMessageScreen').declarations[0].init.body.body;
  const callback = statements.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'renderItem').declarations[0].init.arguments[0];
  const code = transformSync(`var render = ${source.slice(callback.start, callback.end)};`, { loader: 'jsx' }).code;
  const context = {
    React: { createElement: (type, props) => ({ type, props }) },
    UserListItem: 'user', DMListItem: 'dm', ChannelListItem: 'channel', colors: {},
    handleUserPress: () => {}, handleChannelPress: () => {},
  };
  vm.runInNewContext(code, context);
  const existing = context.render({ item: dms[0], section: { type: 'direct' } });
  assert.equal(existing.type, 'dm'); assert.equal(existing.props.onPress, context.handleChannelPress);
  const fresh = context.render({ item: people[2], section: { type: 'direct' } });
  assert.equal(fresh.type, 'user'); assert.equal(fresh.props.onPress, context.handleUserPress);
  assert.equal(fresh.props.user, people[2]);
  console.log('PASS: A–Z/numeric order, identity deduplication, external IDs, recency preservation, search, empty states, immutable data and unchanged navigation objects');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
