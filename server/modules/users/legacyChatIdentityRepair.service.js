import mongoose from 'mongoose';
import ChatUser from './ChatUser.model.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import Message from '../messages/Message.model.js';
import Channel from '../channels/Channel.model.js';

// Legacy name-only cards cannot establish identity. Operators must provide
// explicit message/user mappings from the source audit records, never names.
export async function repairLegacyChatIdentity(manifest, { apply = false } = {}) {
  const { workspaceId, cards = [], groups = [] } = manifest;
  if (!mongoose.isValidObjectId(workspaceId)) throw new Error('A valid ChatApp workspace ID is required');
  if (!Array.isArray(cards) || !Array.isArray(groups)) throw new Error('Cards and groups must be arrays');
  const plans = [];
  const resolveUser = async (sourceId) => {
    const user = await ChatUser.findOne({ flowTaskUserId: String(sourceId) }).lean();
    if (!user || !await WorkspaceMembership.exists({ workspaceId, userId: user._id, isActive: true })) {
      throw new Error('Source user does not have an active membership in the specified workspace');
    }
    return user;
  };
  for (const entry of cards) {
    if (!mongoose.isValidObjectId(entry.messageId)) throw new Error('Invalid message ID');
    const card = await Message.findOne({ _id: entry.messageId, workspaceId }).lean();
    if (!card?.activityMeta?.eventType) throw new Error('Activity card not found in specified workspace');
    const fields = {};
    const filter = { _id: card._id, workspaceId, $and: [] };
    for (const [prefix, sourceId] of [['actor', entry.actorFlowTaskUserId], ['target', entry.targetFlowTaskUserId]]) {
      if (!sourceId) continue;
      if (prefix === 'target' && !['TASK_ASSIGNED', 'SUBTASK_ASSIGNED', 'NANO_ASSIGNED'].includes(card.activityMeta.eventType)) {
        throw new Error('Target user mappings are only valid for assignment cards');
      }
      const user = await resolveUser(sourceId);
      const idField = prefix === 'actor' ? 'actorId' : 'targetUserId';
      const sourceField = prefix === 'actor' ? 'actorFlowTaskUserId' : 'targetFlowTaskUserId';
      const previous = card.activityMeta[idField];
      if ((previous && String(previous) !== String(user._id))
        || (card.activityMeta[sourceField] && String(card.activityMeta[sourceField]) !== String(sourceId))) {
        throw new Error('Explicit mapping conflicts with existing card identity');
      }
      fields[`activityMeta.${idField}`] = user._id;
      fields[`activityMeta.${sourceField}`] = String(sourceId);
      fields[prefix === 'actor' ? 'activityMeta.actorName' : 'activityMeta.newValue'] = user.name;
      if (prefix === 'actor') fields['activityMeta.actorAvatar'] = user.avatar || null;
      const versionField = prefix === 'actor' ? 'profileUpdatedAt' : 'targetProfileUpdatedAt';
      const version = user.flowTaskProfileUpdatedAt || null;
      fields[`activityMeta.${versionField}`] = version;
      filter.$and.push({ [`activityMeta.${idField}`]: { $in: [null, user._id] } });
      filter.$and.push({ [`activityMeta.${sourceField}`]: { $in: [null, String(sourceId)] } });
      filter.$and.push(version ? { $or: [
        { [`activityMeta.${versionField}`]: null }, { [`activityMeta.${versionField}`]: { $lte: version } },
      ] } : { [`activityMeta.${versionField}`]: null });
    }
    if (!Object.keys(fields).length) throw new Error('Each card requires an explicit source user ID');
    plans.push({ model: Message, id: String(card._id), filter, fields });
  }
  for (const entry of groups) {
    if (!mongoose.isValidObjectId(entry.channelId)) throw new Error('Invalid channel ID');
    const channel = await Channel.findOne({ _id: entry.channelId, workspaceId, type: 'private', visibility: 'private' }).lean();
    if (!channel || channel.flowTaskRef || channel.systemManaged) throw new Error('Native private conversation not found in specified workspace');
    if (entry.nameFromMembers !== undefined && typeof entry.nameFromMembers !== 'boolean') throw new Error('nameFromMembers must be a boolean');
    plans.push({ model: Channel, id: String(channel._id),
      filter: { _id: channel._id, workspaceId, type: 'private', visibility: 'private', flowTaskRef: null },
      fields: { recipientOnly: true, nameFromMembers: entry.nameFromMembers === true } });
  }
  // Validate all IDs before changing any records. Only the explicit records
  // and profile metadata/markers can change; content and memberships cannot.
  const results = [];
  for (const plan of plans) {
    const result = apply ? await plan.model.updateOne(plan.filter, { $set: plan.fields }) : null;
    results.push({ recordId: plan.id, type: plan.model.modelName,
      mode: apply ? 'apply' : 'dry-run', matched: result?.matchedCount ?? null });
  }
  return results;
}
