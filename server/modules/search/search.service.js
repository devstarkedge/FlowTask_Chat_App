import mongoose from 'mongoose';
import Channel from '../channels/Channel.model.js';
import ChannelMember from '../channels/ChannelMember.model.js';
import ChatUser from '../users/ChatUser.model.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import Message from '../messages/Message.model.js';
import FileAsset from '../files/FileAsset.model.js';
import FileReference from '../files/FileReference.model.js';
import { CHANNEL_TYPES } from '../../config/constants.js';

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

function scoreText(query, ...values) {
  const q = query.toLowerCase();
  let best = 0;

  for (const value of values) {
    const text = (value || '').toString().toLowerCase();
    if (!text) continue;
    if (text === q) best = Math.max(best, 120);
    else if (text.startsWith(q)) best = Math.max(best, 90);
    else if (text.includes(q)) best = Math.max(best, 55);
  }

  return best;
}

function sortByRank(query, items, picker) {
  return [...items]
    .map((item) => ({ item, score: picker(item) || 0 }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bTime = new Date(b.item.lastMessageAt || b.item.createdAt || b.item.updatedAt || 0).getTime();
      const aTime = new Date(a.item.lastMessageAt || a.item.createdAt || a.item.updatedAt || 0).getTime();
      return bTime - aTime;
    })
    .map(({ item, score }) => ({ ...item, rank: score || scoreText(query, item.name, item.label, item.title) }));
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
  const memberships = await WorkspaceMembership.find({ workspaceId, isActive: true }).select('userId').lean();
  const memberIds = memberships.map((membership) => membership.userId);

  const users = await ChatUser.find({
    _id: { $in: memberIds },
    isActive: true,
    $or: [
      { name: regex },
      { email: regex },
      { role: regex },
      { onlineStatus: regex },
      { flowTaskUserId: regex },
    ],
  })
    .select('name email avatar role onlineStatus flowTaskUserId customStatus')
    .limit(8)
    .lean();

  return sortByRank(query, users.map((user) => ({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    status: user.onlineStatus,
    customStatus: user.customStatus,
    flowTaskUserId: user.flowTaskUserId,
    type: 'user',
  })), (item) => scoreText(query, item.name, item.email, item.role, item.status));
}

async function searchMessages(query, regex, workspaceId, userId, channelIds) {
  if (channelIds.length === 0) return [];

  const objectUserId = new mongoose.Types.ObjectId(userId);
  const messages = await Message.find({
    workspaceId,
    channelId: { $in: channelIds },
    isDeleted: false,
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
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('authorId', 'name email avatar')
    .populate('channelId', 'name slug type')
    .lean();

  return sortByRank(query, messages.map((message) => ({
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
  })), (item) => scoreText(query, item.snippet, item.senderName, item.channelName));
}

function searchChannels(query, regex, channels) {
  const matches = channels
    .filter((channel) => (
      regex.test(channel.name || '')
      || regex.test(channel.slug || '')
      || regex.test(channel.description || '')
      || regex.test(channel.topic || '')
    ))
    .slice(0, 8)
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

  return sortByRank(query, matches, (item) => scoreText(query, item.name, item.slug, item.description, item.topic));
}

async function searchFiles(query, regex, workspaceId, channelIds) {
  if (channelIds.length === 0) return [];

  const assets = await FileAsset.find({
    workspaceId,
    status: 'available',
    $or: [
      { originalName: regex },
      { mimeType: regex },
      { resourceType: regex },
    ],
  })
    .select('_id')
    .limit(30)
    .lean();

  if (assets.length === 0) return [];

  const refs = await FileReference.find({
    workspaceId,
    channelId: { $in: channelIds },
    fileId: { $in: assets.map((asset) => asset._id) },
  })
    .sort({ createdAt: -1 })
    .limit(8)
    .populate('fileId')
    .populate('referencedBy', 'name email avatar')
    .populate('channelId', 'name slug type')
    .lean();

  return sortByRank(query, refs.map((ref) => ({
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
  })), (item) => scoreText(query, item.name, item.mimeType, item.uploadedBy, item.channelName));
}

async function searchLinks(query, regex, workspaceId, userId, channelIds) {
  if (channelIds.length === 0) return [];
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
    .limit(25)
    .populate('channelId', 'name slug type')
    .lean();

  return messages
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
        type: 'link',
      };
    })
    .filter((item) => item && (regex.test(item.url) || regex.test(item.snippet) || regex.test(item.channelName)))
    .slice(0, 5);
}

function searchPages(query) {
  const regex = new RegExp(escapeRegex(query), 'i');
  return sortByRank(query, PAGE_RESULTS
    .filter((page) => regex.test(page.label) || page.keywords.some((keyword) => regex.test(keyword)))
    .map((page) => ({ ...page, type: 'page' }))
    .slice(0, 6), (item) => scoreText(query, item.label, item.path, ...(item.keywords || [])));
}

function buildTopMatches({ users, channels, messages, files, links, pages, dms = [] }) {
  return [...users, ...channels, ...messages, ...files, ...links, ...pages, ...dms]
    .sort((a, b) => (b.rank || 0) - (a.rank || 0))
    .slice(0, 6);
}

export async function globalSearch({ query, userId, workspaceId }) {
  const q = cleanQuery(query);
  if (!q) {
    return {
      query: '',
      topMatches: [],
      users: [],
      messages: [],
      channels: [],
      files: [],
      links: [],
      pages: [],
    };
  }

  const regex = new RegExp(escapeRegex(q), 'i');
  const { channelIds, channels: accessibleChannels } = await getAccessibleChannelIds(userId, workspaceId);

  const [users, messages, channelResults, files, links, pages] = await Promise.all([
    searchUsers(q, regex, workspaceId),
    searchMessages(q, regex, workspaceId, userId, channelIds),
    Promise.resolve(searchChannels(q, regex, accessibleChannels)),
    searchFiles(q, regex, workspaceId, channelIds),
    searchLinks(q, regex, workspaceId, userId, channelIds),
    Promise.resolve(searchPages(q)),
  ]);

  const dms = channelResults.filter(c => c.channelType === 'dm').map(c => ({ ...c, type: 'dm' }));
  const regularChannels = channelResults.filter(c => c.channelType !== 'dm');

  return {
    query: q,
    topMatches: buildTopMatches({ users, channels: regularChannels, messages, files, links, pages, dms }),
    users,
    messages,
    channels: regularChannels,
    dms,
    files,
    links,
    pages,
  };
}
