import eventBus from '../../../services/eventBus.js';
import botNotifier from '../../../services/botNotifier.js';
import channelRepository from '../../channels/channel.repository.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SYSTEM_CHANNELS } from '../../../config/constants.js';

/**
 * Announcement Event Handler — sync FlowTask announcements with ChatApp
 */

export function registerAnnouncementEventHandlers() {

  /**
   *  CREATE ANNOUNCEMENT
   */
  eventBus.register(
    FLOWTASK_EVENTS.ANNOUNCEMENT_CREATED,
    async (payload) => {
      const { announcement, userId, _workspaceId: wsId } = payload;

      if (!announcement) {
        logger.warn('announcement.created: missing announcement data');
        return;
      }

      const channel = await channelRepository.findBySlug(
        SYSTEM_CHANNELS.ANNOUNCEMENTS.slug,
        wsId
      );

      if (!channel) {
        logger.warn('announcement.created: #announcements channel not found');
        return;
      }

      

      const author = userId
        ? await userRepository.findByFlowTaskId(userId, wsId)
        : null;

      const authorName = author?.name || 'Admin';

      const title = announcement.title || 'Announcement';
      const description = announcement.description || '';
      const expiry = announcement.expiry
        ? `\n\nExpires on: ${new Date(announcement.expiry).toLocaleString()}`
        : '';
      const content = announcement.content || announcement.text || '';
      const category = announcement.category
        ? `Category: ${announcement.category}\n\n`
        : '';

      const msg = [
        `📢 ${title}`,
        `👤 Author: ${authorName}`,
        description && `📝 ${description}`,
        expiry && `⏳ Expires: ${expiry}`,
        category && `🏷 ${category}`,
        content && `📄 ${content}`,
      ]
        .filter(Boolean)
        .join('  •  ');

      const subscriberIds = announcement.subscriberIds || [];

      await messageService.sendSystemMessage(
        channel._id,
        msg,
        { entityType: 'announcement', entityId: announcement._id },
        wsId,
        subscriberIds
      );

      logger.info('announcement.created handled', {
        channelId: channel._id,
        announcementId: announcement._id,
      });

      await botNotifier.onAnnouncementCreated(title, authorName, wsId);
    },
    "announcementCreatedHandler"
  );

  /**
   *  DELETE ANNOUNCEMENT
   */
 eventBus.register(FLOWTASK_EVENTS.ANNOUNCEMENT_DELETED, async (payload) => {
  console.log(" DELETE HANDLER HIT", payload);

  const { announcement, announcementId: directId, _workspaceId: wsId } = payload;

  const announcementId =
  directId ||
  announcement?._id ||
  announcement?.id;

  if (!announcementId) {
    logger.warn('announcement.deleted: missing announcementId', payload);
    return;
  }

  try {
    await messageService.deleteByFlowTaskRef(
      'announcement',
      announcementId,
      wsId
    );

    logger.info('announcement.deleted handled', {
      announcementId,
    });
  } catch (err) {
    logger.error('announcement.deleted failed', {
      error: err.message,
      announcementId,
    });
  }
});

  logger.info(' Announcement event handlers registered');
}