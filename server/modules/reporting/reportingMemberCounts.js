import mongoose from 'mongoose';
import ChannelMember from '../channels/ChannelMember.model.js';
import { isReportingChannel } from './reportingAccess.js';

// Reporting membership lives in ChannelMember, not Channel.members. Read its
// current count in one query so list refreshes cannot restore the default zero.
export async function withReportingMemberCounts(channels, workspaceId) {
  const reporting = channels.filter(channel => isReportingChannel(channel)
    && String(channel.workspaceId) === String(workspaceId));
  if (!reporting.length) return channels;
  const channelIds = [...new Set(reporting.map(channel => String(channel._id)))];
  const rows = await ChannelMember.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(String(workspaceId)), isActive: true,
      channelId: { $in: channelIds.map(id => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: '$channelId', memberCount: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map(row => [String(row._id), row.memberCount]));
  const ids = new Set(channelIds);
  return channels.map(channel => ids.has(String(channel._id))
    && String(channel.workspaceId) === String(workspaceId)
    ? { ...(channel.toObject ? channel.toObject() : channel), memberCount: counts.get(String(channel._id)) || 0 }
    : channel);
}
