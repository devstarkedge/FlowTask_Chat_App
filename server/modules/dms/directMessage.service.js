import directMessageRepository from './directMessage.repository.js';
import logger from '../../utils/logger.js';

class DirectMessageService {
  async ensureForChannel({ workspaceId, memberIds, legacyChannelId, createdBy }) {
    if (!workspaceId || !Array.isArray(memberIds) || (memberIds.length !== 1 && memberIds.length !== 2)) {
      return null;
    }

    const sortedIds = [...memberIds].map((id) => id.toString()).sort();
    let dm = await directMessageRepository.findByParticipants(sortedIds, workspaceId);

    if (dm) {
      if (legacyChannelId && (!dm.legacyChannelId || dm.legacyChannelId.toString() !== legacyChannelId.toString())) {
        dm = await directMessageRepository.linkLegacyChannel(dm._id, legacyChannelId, workspaceId);
      }
      return dm;
    }

    try {
      return await directMessageRepository.create({
        workspaceId,
        memberIds: sortedIds,
        legacyChannelId,
        createdBy,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return directMessageRepository.findByParticipants(sortedIds, workspaceId);
      }
      logger.error('Failed to ensure direct message record', {
        workspaceId: workspaceId?.toString?.() || workspaceId,
        legacyChannelId: legacyChannelId?.toString?.() || legacyChannelId,
        error: error.message,
      });
      throw error;
    }
  }
}

export default new DirectMessageService();
