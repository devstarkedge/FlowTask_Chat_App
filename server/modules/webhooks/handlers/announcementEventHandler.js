import eventBus from '../../../services/eventBus.js';
import botNotifier from '../../../services/botNotifier.js';
import channelRepository from '../../channels/channel.repository.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SYSTEM_CHANNELS } from '../../../config/constants.js';
import mongoose from 'mongoose';

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
    const category = announcement.category || null;

    const msg = [
      `New announcement: **${title}**`,
      `Author: ${authorName}`,
      description && `${description}`,
      category && `Category: ${category}`,
    ]
      .filter(Boolean)
      .join('  •  ');

    const subscriberIds =
      announcement?.subscriberIds ||
      payload?.subscriberIds ||
      [];

    if (!subscriberIds.length) {
      logger.warn("No subscribers → skipping announcement");
      return;
    }

    //  Bulk fetch
    const chatUsers = await userRepository.findByFlowTaskIds(
      subscriberIds,
      wsId
    );

    const chatUserIds = [...new Set(chatUsers.map(u => u._id))];

    if (!chatUserIds.length) {
      logger.warn("No matching Chat users found for subscribers");
      return;
    }

    const activityMeta = {
      eventType: 'ANNOUNCEMENT_CREATED',
      announcementId: announcement._id || announcement.id || null,
      announcementTitle: title,
      actorName: authorName,
      category: category,
      priority: announcement.priority || null,
    };

    await messageService.sendSystemMessage(
      channel._id,
      msg,
      { entityType: 'announcement', entityId: announcement._id },
      wsId,
      chatUserIds,
      activityMeta
    );

    await botNotifier.onAnnouncementCreated(
      title,
      authorName,
      wsId,
      chatUserIds
    );

    logger.info('announcement.created handled', {
      channelId: channel._id,
      announcementId: announcement._id,
      users: chatUserIds.length
    });
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