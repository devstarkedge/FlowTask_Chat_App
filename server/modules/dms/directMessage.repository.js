import DirectMessage from './DirectMessage.model.js';
import { injectWorkspaceFilterRequired } from '../../middleware/workspaceContext.js';

class DirectMessageRepository {
  async create(data) {
    const dm = new DirectMessage(data);
    return dm.save();
  }

  async findByParticipants(memberIds, workspaceId) {
    const sorted = [...memberIds].map((id) => id.toString()).sort();
    const dmKey = DirectMessage.buildDmKey(sorted);
    const filter = injectWorkspaceFilterRequired(
      { dmKey, isActive: true },
      workspaceId,
      'direct message participant lookup',
    );
    return DirectMessage.findOne(filter);
  }

  async findByLegacyChannelId(legacyChannelId, workspaceId) {
    const filter = injectWorkspaceFilterRequired(
      { legacyChannelId, isActive: true },
      workspaceId,
      'direct message channel lookup',
    );
    return DirectMessage.findOne(filter);
  }

  async linkLegacyChannel(dmId, legacyChannelId, workspaceId) {
    const filter = injectWorkspaceFilterRequired(
      { _id: dmId },
      workspaceId,
      'direct message channel link update',
    );
    return DirectMessage.findOneAndUpdate(
      filter,
      { $set: { legacyChannelId } },
      { new: true },
    );
  }

  async touchActivity(dmId, lastMessageId, workspaceId) {
    const filter = injectWorkspaceFilterRequired(
      { _id: dmId },
      workspaceId,
      'direct message activity update',
    );
    return DirectMessage.findOneAndUpdate(
      filter,
      {
        $set: {
          lastMessageId,
          lastActivityAt: new Date(),
        },
      },
      { new: true },
    );
  }
}

export default new DirectMessageRepository();
