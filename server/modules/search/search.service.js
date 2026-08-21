import mongoose from 'mongoose';
import Channel from '../channels/Channel.model.js';
import ChannelMember from '../channels/ChannelMember.model.js';
import ChannelPin from '../channels/ChannelPin.model.js';
import ChatUser from '../users/ChatUser.model.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import Message from '../messages/Message.model.js';
import FileAsset from '../files/FileAsset.model.js';
import FileReference from '../files/FileReference.model.js';
import { CHANNEL_TYPES } from '../../config/constants.js';

const SCOPED_MESSAGE_LIMIT = 20;
const MAX_SCOPED_MESSAGE_LIMIT = 100;
const SEARCH_OPERATOR_PATTERN = /(?:^|\s)(in|from):(?:"([^"]+)"|(\S+))/gi;

const SECTION_LIMITS = {
  topMatches: 5,
  users: 5,
  messages: 5,
  channels: 5,
  dms: 5,
  files: 5,
  links: 5,
  pages: 5,
};

const PAGE_RESULTS = [
  { id: 'profile', label: 'Profile', path: 'profile', keywords: ['profile', 'me', 'account', 'status'] },
  { id: 'settings', label: 'Settings', path: 'settings', keywords: ['settings', 'preferences', 'appearance', 'theme'] },
  { id: 'notifications', label: 'Notifications', path: 'activity', keywords: ['notifications', 'activity', 'mentions'] },
  { id: 'threads', label: 'Threads', path: 'threads', keywords: ['threads', 'replies'] },
  { id: 'starred', label: 'Starred', path: 'starred', keywords: ['starred', 'saved'] },
  { id: 'directories', label: 'Directories', path: 'directories', keywords: ['directory', 'directories', 'people', 'users'] },
  { id: 'files', label: 'Files', path: 'files', keywords: ['files', 'documents', 'uploads'] },
];

function escapeRegex(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanQuery(value = '') {
  return value.toString().trim().slice(0, 120);
}

function cleanScope(value = '') {
  const cleaned = (value ?? '').toString().trim().slice(0, 160);
  return cleaned || null;
}

function normalizeScopedLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return SCOPED_MESSAGE_LIMIT;
  }

  return Math.min(parsed, MAX_SCOPED_MESSAGE_LIMIT);
}

function encodeMessageCursor(message) {
  if (!message?._id || !message?.createdAt) return null;

  return Buffer.from(JSON.stringify({
    id: message._id.toString(),
    createdAt: new Date(message.createdAt).toISOString(),
  }), 'utf8').toString('base64');
}

function decodeMessageCursor(value = '') {
  const raw = value?.toString?.().trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (!parsed?.id || !mongoose.isValidObjectId(parsed.id)) return null;

    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;

    return {
      id: parsed.id,
      createdAt,
    };
  } catch {
    return null;
  }
}

function normalizeText(value = '') {
  return (value ?? '')
    .toString()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreText(query, ...values) {
  const q = normalizeText(query);
  if (!q) return 0;

  const tokens = q.split(' ').filter(Boolean);
  let best = 0;

  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;

    let score = 0;
    if (text === q) score = 160;
    else if (text.startsWith(q)) score = 130;
    else if (text.includes(` ${q}`)) score = 105;
    else if (text.includes(q)) score = 75;

    if (tokens.length > 1) {
      const matchedTokens = tokens.filter((token) => text.includes(token)).length;
      if (matchedTokens === tokens.length) {
        score = Math.max(score, 96 + matchedTokens * 4);
      } else if (matchedTokens > 0) {
        score = Math.max(score, 28 + matchedTokens * 12);
      }
    }

    best = Math.max(best, score);
  }

  return best;
}

function scoreRecency(value, maxPoints = 20) {
  const timestamp = new Date(value || 0).getTime();
  if (!timestamp) return 0;

  const ageInDays = (Date.now() - timestamp) / (24 * 60 * 60 * 1000);
  if (ageInDays <= 1) return maxPoints;
  if (ageInDays <= 3) return Math.max(maxPoints - 4, 0);
  if (ageInDays <= 7) return Math.max(maxPoints - 8, 0);
  if (ageInDays <= 30) return Math.max(maxPoints - 14, 0);
  return 0;
}

function scoreChannelSignal(channelSignals, channelId, { pinned = 14, starred = 10 } = {}) {
  if (!channelId) return 0;

  const signal = channelSignals.get(channelId.toString());
  if (!signal) return 0;

  let score = 0;
  if (signal.isPinned) score += pinned;
  if (signal.isStarred) score += starred;
  return score;
}

function applyLimit(items, limit) {
  return {
    items: items.slice(0, limit),
    hasMore: items.length > limit,
  };
}

function sortByRank(items, picker) {
  return [...items]
    .map((item) => ({ item, score: picker(item) || 0 }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bTime = new Date(b.item.lastMessageAt || b.item.createdAt || b.item.updatedAt || 0).getTime();
      const aTime = new Date(a.item.lastMessageAt || a.item.createdAt || a.item.updatedAt || 0).getTime();
      return bTime - aTime;
    })
    .map(({ item, score }) => ({ ...item, rank: score }));
}

function makeSnippet(text = '', query = '') {
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const index = plain.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return plain.slice(0, 180);
  const start = Math.max(0, index - 54);
  const end = Math.min(plain.length, index + query.length + 96);
  return `${start > 0 ? '...' : ''}${plain.slice(start, end)}${end < plain.length ? '...' : ''}`;
}

function extractFirstUrl(text = '') {
  return text.match(/https?:\/\/[^\s<>"']+/i)?.[0] || null;
}

function buildSectionMeta(items, hasMore, nextCursor = null) {
  return {
    returned: items.length,
    hasMore,
    nextCursor,
  };
}

function buildChannelSignalMap(pins = []) {
  return new Map(
    pins.map((pin) => [pin.channelId.toString(), { isPinned: pin.isPinned, isStarred: pin.isStarred }]),
  );
}

function buildEmptyResults(query = '', filters = null, limits = SECTION_LIMITS) {
  return {
    query,
    topMatches: [],
    users: [],
    messages: [],
    channels: [],
    dms: [],
    files: [],
    links: [],
    pages: [],
    meta: {
      engine: 'mongo-native',
      limits,
      filters,
      sections: {
        topMatches: buildSectionMeta([], false),
        users: buildSectionMeta([], false),
        messages: buildSectionMeta([], false),
        channels: buildSectionMeta([], false),
        dms: buildSectionMeta([], false),
        files: buildSectionMeta([], false),
        links: buildSectionMeta([], false),
        pages: buildSectionMeta([], false),
      },
    },
  };
}

function parseSearchOperators(query = '') {
  const filters = {
    in: null,
    from: null,
  };

  const text = query
    .replace(SEARCH_OPERATOR_PATTERN, (match, operator, quotedValue, bareValue) => {
      const value = (quotedValue || bareValue || '').trim();
      if (!value) return ' ';

      if (operator === 'in' && !filters.in) filters.in = value;
      if (operator === 'from' && !filters.from) filters.from = value;
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  return { text, filters };
}

function normalizeScopeValue(value = '') {
  return normalizeText(value).replace(/^[@#]/, '').trim();
}

function resolveScopedChannel(channels, scopeValue) {
  if (!scopeValue) return null;

  const rawValue = scopeValue.toString().trim();
  if (!rawValue) return null;

  const normalizedScope = normalizeScopeValue(rawValue);

  return channels.find((channel) => {
    const channelId = channel._id?.toString?.() || '';
    if (channelId === rawValue) return true;

    const normalizedSlug = normalizeScopeValue(channel.slug || '');
    const normalizedName = normalizeScopeValue(channel.name || '');
    return normalizedScope && (normalizedSlug === normalizedScope || normalizedName === normalizedScope);
  }) || null;
}

async function resolveScopedAuthorId(scopeValue, workspaceId) {
  const rawValue = scopeValue?.toString?.().trim();
  if (!rawValue) return null;

  const memberships = await WorkspaceMembership.find({ workspaceId, isActive: true }).select('userId').lean();
  const memberIds = memberships.map((membership) => membership.userId);
  const filters = [
    { email: new RegExp(`^${escapeRegex(rawValue)}$`, 'i') },
    { name: new RegExp(`^${escapeRegex(rawValue)}$`, 'i') },
    { flowTaskUserId: new RegExp(`^${escapeRegex(rawValue)}$`, 'i') },
  ];

  if (mongoose.isValidObjectId(rawValue)) {
    filters.unshift({ _id: rawValue });
  }

  const user = await ChatUser.findOne({
    _id: { $in: memberIds },
    isActive: true,
    $or: filters,
  })
    .select('_id')
    .lean();

  return user?._id?.toString() || null;
}

async function getAccessibleChannelIds(userId, workspaceId) {
  const memberChannelIds = await ChannelMember.getChannelIdsForUser(userId, workspaceId);
  const channels = await Channel.find({
    workspaceId,
    isArchived: false,
    $or: [
      { visibility: 'public', type: { $ne: CHANNEL_TYPES.DM } },
      { _id: { $in: memberChannelIds } },
      { 'members.userId': userId },
      { dmParticipants: userId.toString() },
    ],
  })
    .select('_id name slug type visibility description topic memberCount lastMessageAt dmParticipants')
    .lean();

  return {
    channelIds: channels.map((channel) => channel._id),
    channels,
  };
}

async function searchUsers(query, regex, workspaceId) {
  const limit = SECTION_LIMITS.users;
  const memberships = await WorkspaceMembership.find({ workspaceId, isActive: true })
    .select('userId role flowTaskAccess.role flowTaskAccess.departmentIds')
    .lean();
  const memberIds = memberships.map((membership) => membership.userId);
  const membershipByUserId = new Map(
    memberships.map((membership) => [membership.userId.toString(), membership]),
  );
  const roleOrDepartmentMatchedIds = memberships
    .filter((membership) => {
      const values = [
        membership.role,
        membership.flowTaskAccess?.role,
        ...(membership.flowTaskAccess?.departmentIds || []),
      ];
      return values.some((value) => typeof value === 'string' && regex.test(value));
    })
    .map((membership) => membership.userId);

  const users = await ChatUser.find({
    _id: { $in: memberIds },
    isActive: true,
    $or: [
      { name: regex },
      { email: regex },
      { onlineStatus: regex },
      { 'customStatus.text': regex },
      { flowTaskUserId: regex },
      ...(roleOrDepartmentMatchedIds.length > 0
        ? [{ _id: { $in: roleOrDepartmentMatchedIds } }]
        : []),
    ],
  })
    .select('name email avatar onlineStatus flowTaskUserId customStatus lastSeenAt updatedAt')
    .limit(limit + 1)
    .lean();

  const ranked = sortByRank(users.map((user) => {
    const membership = membershipByUserId.get(user._id.toString());
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: membership?.role || null,
      workspaceRole: membership?.role || null,
      flowTaskRole: membership?.flowTaskAccess?.role || null,
      status: user.onlineStatus,
      department: membership?.flowTaskAccess?.departmentIds?.join(', ') || '',
      customStatus: user.customStatus,
      flowTaskUserId: user.flowTaskUserId,
      lastSeenAt: user.lastSeenAt,
      updatedAt: user.updatedAt,
      type: 'user',
    };
  }), (item) => (
    scoreText(query, item.name, item.email, item.role, item.status, item.department, item.customStatus?.text)
    + (item.status === 'online' ? 8 : 0)
    + (item.status === 'away' ? 4 : 0)
    + scoreRecency(item.lastSeenAt || item.updatedAt, 10)
  ));

  return applyLimit(ranked, limit);
}

async function searchMessages(query, regex, workspaceId, userId, channelIds, channelSignals, options = {}) {
  if (channelIds.length === 0) {
    return {
      items: [],
      hasMore: false,
      nextCursor: null,
    };
  }

  const limit = options.limit || SECTION_LIMITS.messages;
  const objectUserId = new mongoose.Types.ObjectId(userId);
  const scopedAuthorId = options.authorId && mongoose.isValidObjectId(options.authorId)
    ? new mongoose.Types.ObjectId(options.authorId)
    : null;
  const cursor = decodeMessageCursor(options.cursor);
  const cursorObjectId = cursor ? new mongoose.Types.ObjectId(cursor.id) : null;
  const messages = await Message.find({
    workspaceId,
    channelId: { $in: channelIds },
    isDeleted: false,
    ...(scopedAuthorId ? { authorId: scopedAuthorId } : {}),
    ...(cursor
      ? {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            _id: { $lt: cursorObjectId },
          },
        ],
      }
      : {}),
    $or: [
      { visibleTo: { $exists: false } },
      { visibleTo: { $size: 0 } },
      { visibleTo: { $in: [objectUserId] } },
    ],
    $and: [{
      $or: [
        { content: regex },
        { htmlContent: regex },
        { 'senderSnapshot.name': regex },
        { 'mentions.name': regex },
        { 'activityMeta.taskTitle': regex },
        { 'activityMeta.projectName': regex },
        { 'activityMeta.fileName': regex },
      ],
    }],
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate('authorId', 'name email avatar')
    .populate('channelId', 'name slug type')
    .lean();

  const windowedMessages = messages.slice(0, limit);

  const ranked = sortByRank(windowedMessages.map((message) => ({
    id: message._id.toString(),
    channelId: message.channelId?._id?.toString() || message.channelId?.toString(),
    channelName: message.channelId?.name || 'Conversation',
    channelType: message.channelId?.type,
    senderName: message.senderSnapshot?.name || message.authorId?.name || 'Someone',
    senderAvatar: message.authorId?.avatar || null,
    snippet: makeSnippet(message.content || message.htmlContent || message.activityMeta?.taskTitle, query),
    createdAt: message.createdAt,
    replyCount: message.replyCount || 0,
    type: 'message',
  })), (item) => (
    scoreText(query, item.snippet, item.senderName, item.channelName)
    + scoreRecency(item.createdAt, 18)
    + Math.min(item.replyCount || 0, 4)
    + scoreChannelSignal(channelSignals, item.channelId, { pinned: 16, starred: 12 })
  ));

  return {
    items: ranked,
    hasMore: messages.length > limit,
    nextCursor: messages.length > limit
      ? encodeMessageCursor(windowedMessages[windowedMessages.length - 1])
      : null,
  };
}

function searchChannels(query, regex, channels, channelSignals) {
  const matches = channels
    .filter((channel) => (
      channel.type !== CHANNEL_TYPES.DM && (
        regex.test(channel.name || '')
        || regex.test(channel.slug || '')
        || regex.test(channel.description || '')
        || regex.test(channel.topic || '')
      )
    ))
    .map((channel) => ({
      id: channel._id.toString(),
      name: channel.name,
      slug: channel.slug,
      description: channel.description,
      topic: channel.topic,
      channelType: channel.type,
      type: 'channel',
      visibility: channel.visibility,
      memberCount: channel.memberCount || 0,
      lastMessageAt: channel.lastMessageAt,
    }));

  const ranked = sortByRank(matches, (item) => (
    scoreText(query, item.name, item.slug, item.description, item.topic)
    + scoreRecency(item.lastMessageAt, 14)
    + Math.min(Math.floor((item.memberCount || 0) / 25), 6)
    + scoreChannelSignal(channelSignals, item.id)
  ));

  return {
    channels: applyLimit(ranked, SECTION_LIMITS.channels),
    dms: applyLimit([], SECTION_LIMITS.dms),
  };
}

async function searchFiles(query, regex, workspaceId, channelIds, channelSignals) {
  if (channelIds.length === 0) return applyLimit([], SECTION_LIMITS.files);

  const limit = SECTION_LIMITS.files;
  const assets = await FileAsset.find({
    workspaceId,
    status: 'available',
    $or: [
      { originalName: regex },
      { mimeType: regex },
      { resourceType: regex },
    ],
  })
    .select('_id originalName mimeType resourceType uploadedBy createdAt')
    .limit(limit * 6)
    .lean();

  if (assets.length === 0) return applyLimit([], limit);

  const refs = await FileReference.find({
    workspaceId,
    channelId: { $in: channelIds },
    fileId: { $in: assets.map((asset) => asset._id) },
  })
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .populate('fileId')
    .populate('referencedBy', 'name email avatar')
    .populate('channelId', 'name slug type')
    .lean();

  const ranked = sortByRank(refs.map((ref) => ({
    id: ref.fileId?._id?.toString(),
    referenceId: ref._id.toString(),
    channelId: ref.channelId?._id?.toString() || ref.channelId?.toString(),
    channelName: ref.channelId?.name || 'Conversation',
    messageId: ref.messageId?.toString() || null,
    name: ref.fileId?.originalName || 'Untitled file',
    mimeType: ref.fileId?.mimeType,
    fileSize: ref.fileId?.fileSize,
    url: ref.fileId?.secureUrl,
    thumbnailUrl: ref.fileId?.thumbnailUrl,
    uploadedBy: ref.referencedBy?.name || 'Someone',
    createdAt: ref.createdAt,
    type: 'file',
  })), (item) => (
    scoreText(query, item.name, item.mimeType, item.uploadedBy, item.channelName)
    + scoreRecency(item.createdAt, 12)
    + scoreChannelSignal(channelSignals, item.channelId, { pinned: 12, starred: 8 })
  ));

  return applyLimit(ranked, limit);
}

async function searchLinks(query, regex, workspaceId, userId, channelIds, channelSignals) {
  if (channelIds.length === 0) return applyLimit([], SECTION_LIMITS.links);

  const limit = SECTION_LIMITS.links;
  const objectUserId = new mongoose.Types.ObjectId(userId);

  const messages = await Message.find({
    workspaceId,
    channelId: { $in: channelIds },
    isDeleted: false,
    content: /https?:\/\//i,
    $or: [
      { visibleTo: { $exists: false } },
      { visibleTo: { $size: 0 } },
      { visibleTo: { $in: [objectUserId] } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit * 8)
    .populate('channelId', 'name slug type')
    .lean();

  const ranked = sortByRank(messages
    .map((message) => {
      const url = extractFirstUrl(message.content || message.htmlContent || '');
      if (!url) return null;
      return {
        id: `${message._id}:${url}`,
        messageId: message._id.toString(),
        channelId: message.channelId?._id?.toString() || message.channelId?.toString(),
        channelName: message.channelId?.name || 'Conversation',
        url,
        title: url.replace(/^https?:\/\//, ''),
        snippet: makeSnippet(message.content || url, query),
        createdAt: message.createdAt,
        channelType: message.channelId?.type,
        type: 'link',
      };
    })
    .filter((item) => item && (regex.test(item.url) || regex.test(item.snippet) || regex.test(item.channelName)))
  , (item) => (
    scoreText(query, item.title, item.url, item.snippet, item.channelName)
    + scoreRecency(item.createdAt, 10)
    + scoreChannelSignal(channelSignals, item.channelId, { pinned: 10, starred: 8 })
  ));

  return applyLimit(ranked, limit);
}

function searchPages(query) {
  const regex = new RegExp(escapeRegex(query), 'i');
  const ranked = sortByRank(PAGE_RESULTS
    .filter((page) => regex.test(page.label) || page.keywords.some((keyword) => regex.test(keyword)))
    .map((page) => ({ ...page, type: 'page' })), (item) => scoreText(query, item.label, item.path, ...(item.keywords || [])));

  return applyLimit(ranked, SECTION_LIMITS.pages);
}

function buildTopMatches({ users, channels, messages, files, links, pages, dms = [] }) {
  const typePriority = {
    user: 7,
    dm: 6,
    channel: 5,
    message: 4,
    file: 3,
    link: 2,
    page: 1,
  };

  return [...users, ...channels, ...messages, ...files, ...links, ...pages, ...dms]
    .sort((a, b) => {
      if ((b.rank || 0) !== (a.rank || 0)) {
        return (b.rank || 0) - (a.rank || 0);
      }
      if ((typePriority[b.type] || 0) !== (typePriority[a.type] || 0)) {
        return (typePriority[b.type] || 0) - (typePriority[a.type] || 0);
      }
      const bTime = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
      const aTime = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, SECTION_LIMITS.topMatches);
}

export async function globalSearch({ query, scope = null, limit = null, cursor = null, userId, workspaceId }) {
  const rawQuery = cleanQuery(query);
  const parsedQuery = parseSearchOperators(rawQuery);
  if (!parsedQuery.filters.in) {
    parsedQuery.filters.in = cleanScope(scope);
  }
  const activeQuery = parsedQuery.text;
  const hasScopedFilters = Boolean(parsedQuery.filters.in || parsedQuery.filters.from);
  const scopedMessageLimit = hasScopedFilters
    ? normalizeScopedLimit(limit)
    : SECTION_LIMITS.messages;

  if (!rawQuery || (!activeQuery && !hasScopedFilters)) {
    return buildEmptyResults('', parsedQuery.filters);
  }

  const [{ channelIds, channels: accessibleChannels }, pins] = await Promise.all([
    getAccessibleChannelIds(userId, workspaceId),
    ChannelPin.getPinsForUser(userId, workspaceId),
  ]);

  const channelSignals = buildChannelSignalMap(pins);

  let scopedChannels = accessibleChannels;
  let scopedChannelIds = channelIds;
  let scopedChannel = null;

  if (parsedQuery.filters.in) {
    scopedChannel = resolveScopedChannel(accessibleChannels, parsedQuery.filters.in);
    if (!scopedChannel) {
      return buildEmptyResults(activeQuery, {
        ...parsedQuery.filters,
        scoped: true,
        resolvedChannelId: null,
        resolvedAuthorId: null,
      }, {
        ...SECTION_LIMITS,
        messages: scopedMessageLimit,
      });
    }

    scopedChannels = [scopedChannel];
    scopedChannelIds = [scopedChannel._id];
  }

  let scopedAuthorId = null;
  if (parsedQuery.filters.from) {
    scopedAuthorId = await resolveScopedAuthorId(parsedQuery.filters.from, workspaceId);
    if (!scopedAuthorId) {
      return buildEmptyResults(activeQuery, {
        ...parsedQuery.filters,
        scoped: hasScopedFilters,
        resolvedChannelId: scopedChannel?._id?.toString?.() || null,
        resolvedAuthorId: null,
      }, {
        ...SECTION_LIMITS,
        messages: scopedMessageLimit,
      });
    }
  }

  if (!activeQuery) {
    return buildEmptyResults('', {
      ...parsedQuery.filters,
      scoped: hasScopedFilters,
      resolvedChannelId: scopedChannel?._id?.toString?.() || null,
      resolvedAuthorId: scopedAuthorId,
    }, {
      ...SECTION_LIMITS,
      messages: hasScopedFilters ? scopedMessageLimit : SECTION_LIMITS.messages,
    });
  }

  const regex = new RegExp(escapeRegex(activeQuery), 'i');

  if (hasScopedFilters) {
    const scopedLimits = {
      ...SECTION_LIMITS,
      messages: scopedMessageLimit,
    };
    const messagesResult = await searchMessages(
      activeQuery,
      regex,
      workspaceId,
      userId,
      scopedChannelIds,
      channelSignals,
      {
        limit: scopedMessageLimit,
        authorId: scopedAuthorId,
        cursor,
      },
    );
    const messages = messagesResult.items;
    const topMatches = messages.slice(0, SECTION_LIMITS.topMatches);

    return {
      query: activeQuery,
      topMatches,
      users: [],
      messages,
      channels: [],
      dms: [],
      files: [],
      links: [],
      pages: [],
      meta: {
        engine: 'mongo-native',
        limits: scopedLimits,
        filters: {
          ...parsedQuery.filters,
          scoped: true,
          resolvedChannelId: scopedChannel?._id?.toString?.() || null,
          resolvedAuthorId: scopedAuthorId,
        },
        sections: {
          topMatches: buildSectionMeta(topMatches, messages.length > topMatches.length),
          users: buildSectionMeta([], false),
          messages: buildSectionMeta(messages, messagesResult.hasMore, messagesResult.nextCursor),
          channels: buildSectionMeta([], false),
          dms: buildSectionMeta([], false),
          files: buildSectionMeta([], false),
          links: buildSectionMeta([], false),
          pages: buildSectionMeta([], false),
        },
      },
    };
  }

  const [usersResult, messagesResult, channelResults, filesResult, linksResult, pagesResult] = await Promise.all([
    searchUsers(activeQuery, regex, workspaceId),
    searchMessages(activeQuery, regex, workspaceId, userId, scopedChannelIds, channelSignals),
    Promise.resolve(searchChannels(activeQuery, regex, scopedChannels, channelSignals)),
    searchFiles(activeQuery, regex, workspaceId, scopedChannelIds, channelSignals),
    searchLinks(activeQuery, regex, workspaceId, userId, scopedChannelIds, channelSignals),
    Promise.resolve(searchPages(activeQuery)),
  ]);

  const users = usersResult.items;
  const messages = messagesResult.items;
  const regularChannels = channelResults.channels.items;
  const files = filesResult.items;
  const links = linksResult.items;
  const pages = pagesResult.items;

  // Find project channels that the matched users are members of.
  // Must be accessible to the searching user (i.e. in scopedChannels).
  let projectsForUsers = [];
  if (users.length > 0) {
    try {
      const matchedUserIds = users.map((u) => u.id);
      const memberships = await ChannelMember.find({
        userId: { $in: matchedUserIds.map((id) => new mongoose.Types.ObjectId(id)) },
        workspaceId,
        isActive: true,
      }).select('channelId').lean();

      const matchedUserChannelIds = new Set(memberships.map((m) => m.channelId.toString()));

      // Filter to only keep projects (type === 'project') that the current user has access to
      const matchingChannels = scopedChannels.filter((channel) =>
        channel.type === 'project' && matchedUserChannelIds.has(channel._id.toString())
      );

      const matches = matchingChannels.map((channel) => ({
        id: channel._id.toString(),
        name: channel.name,
        slug: channel.slug,
        description: channel.description,
        topic: channel.topic,
        channelType: channel.type,
        type: 'channel', // Render as a regular channel (using # or prefix)
        visibility: channel.visibility,
        memberCount: channel.memberCount || 0,
        lastMessageAt: channel.lastMessageAt,
      }));

      projectsForUsers = sortByRank(matches, (item) => (
        scoreText(activeQuery, item.name, item.slug, item.description, item.topic)
        + scoreRecency(item.lastMessageAt, 14)
        + Math.min(Math.floor((item.memberCount || 0) / 25), 6)
        + scoreChannelSignal(channelSignals, item.id)
      ));
    } catch (err) {
      logger.error('Failed to search projects for matched users', { error: err.message });
    }
  }

  const dmsLimitResult = applyLimit(projectsForUsers, SECTION_LIMITS.dms);
  const dms = dmsLimitResult.items;

  const topMatches = buildTopMatches({ users, channels: regularChannels, messages, files, links, pages, dms });

  return {
    query: activeQuery,
    topMatches,
    users,
    messages,
    channels: regularChannels,
    dms,
    files,
    links,
    pages,
    meta: {
      engine: 'mongo-native',
      limits: SECTION_LIMITS,
      filters: {
        ...parsedQuery.filters,
        scoped: false,
        resolvedChannelId: null,
        resolvedAuthorId: null,
      },
      sections: {
        topMatches: buildSectionMeta(topMatches, false),
        users: buildSectionMeta(users, usersResult.hasMore),
        messages: buildSectionMeta(messages, messagesResult.hasMore, messagesResult.nextCursor),
        channels: buildSectionMeta(regularChannels, channelResults.channels.hasMore),
        dms: buildSectionMeta(dms, dmsLimitResult.hasMore),
        files: buildSectionMeta(files, filesResult.hasMore),
        links: buildSectionMeta(links, linksResult.hasMore),
        pages: buildSectionMeta(pages, pagesResult.hasMore),
      },
    },
  };
}
