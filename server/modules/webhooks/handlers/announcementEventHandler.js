import eventBus from '../../../services/eventBus.js';
import botNotifier from '../../../services/botNotifier.js';
import channelRepository from '../../channels/channel.repository.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SYSTEM_CHANNELS } from '../../../config/constants.js';

/**
 * Announcement Event Handler — cross-posts FlowTask announcements to the announcements system channel.
 *
 * Events:
 *   announcement.created — Post announcement content to #announcements channel
 */

export function registerAnnouncementEventHandlers() {
  eventBus.register(FLOWTASK_EVENTS.ANNOUNCEMENT_CREATED, async (payload) => {
    const { announcement, userId, _workspaceId: wsId } = payload;

    if (!announcement) {
      logger.warn('announcement.created: missing announcement data');
      return;
    }

    // Find the announcements system channel
    const channel = await channelRepository.findBySlug(SYSTEM_CHANNELS.ANNOUNCEMENTS.slug, wsId);
    if (!channel) {
      logger.warn('announcement.created: #announcements channel not found');
      return;
    }

    const author = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const authorName = author?.name || 'Admin';

    const title = announcement.title || 'Announcement';
    const content = announcement.content || announcement.text || '';

    const msg = `📢 **${title}**\n\nBy ${authorName}\n\n${content}`;

    await messageService.sendSystemMessage(
      channel._id,
      msg,
      { entityType: 'announcement', entityId: announcement._id },
      wsId,
    );

    logger.info('announcement.created handled', {
      channelId: channel._id,
      announcementId: announcement._id,
    });

    // Also notify admin channel
    await botNotifier.onAnnouncementCreated(title, authorName, wsId);
  });

  logger.info('Announcement event handlers registered');
}
