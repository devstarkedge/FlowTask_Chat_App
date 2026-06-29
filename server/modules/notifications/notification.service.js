import Notification from './Notification.model.js';
import { emitToUser } from '../../sockets/socketManager.js';
import { SOCKET_EVENTS } from '../../config/constants.js';
import logger from '../../utils/logger.js';
import userRepository from '../users/user.repository.js';
import { shouldDeliverNotification } from './dnd.gateway.js';
import pushService from '../../services/push.service.js';

/**
 * Notification Service — business logic for creating, retrieving,
 * and managing persistent notifications.
 *
 * Notifications are workspace-scoped and emitted in real-time via socket.
 * Old notifications auto-expire after 90 days via TTL index.
 * Respects DND schedule and channel mute preferences.
 */
class NotificationService {
  /**
   * Check if a user is currently in DND mode.
   * @param {object} user - ChatUser document (needs chatPreferences)
   * @returns {boolean}
   */
  _isInDND(user) {
    if (!user?.chatPreferences?.dndSchedule?.enabled) return false;
    if (user.onlineStatus === 'dnd') return true;

    const { startHour, endHour } = user.chatPreferences.dndSchedule;
    const now = new Date();
    const currentHour = now.getUTCHours(); // Simplified — timezone handling can be enhanced

    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    }
    // Wraps midnight (e.g., 22:00 – 08:00)
    return currentHour >= startHour || currentHour < endHour;
  }

  /**
   * Create a notification, persist it, and emit via socket.
   * Respects DND and channel mute preferences.
   */
  async create({
    workspaceId,
    recipientId,
    type,
    title,
    body,
    sourceType,
    sourceId,
    channelId,
    threadId,
    senderId,
    senderName,
    senderAvatar,
    channelName,
    conversationId,
    conversationType,
    messagePreview,
  }) {
    // Don't send notification to yourself
    if (senderId && recipientId && senderId.toString() === recipientId.toString()) {
      return null;
    }

    const notification = await Notification.create({
      workspaceId,
      recipientId,
      type,
      title,
      body,
      sourceType,
      sourceId,
      channelId,
      threadId,
      senderId,
      senderName,
      senderAvatar,
      channelName,
      conversationId: conversationId || channelId || null,
      conversationType: conversationType || 'channel',
      messagePreview: messagePreview || body || '',
    });

    // Emit real-time notification to the recipient's personal room
    // Use the centralized DND gateway to decide whether to emit.
    let suppressEmit = false;
    try {
      const deliver = await shouldDeliverNotification(recipientId, senderId);
      suppressEmit = !deliver;
    } catch (err) {
      logger.warn('Failed to run DND gateway for notification', { recipientId, error: err.message });
    }

    if (!suppressEmit) {
      emitToUser(recipientId.toString(), SOCKET_EVENTS.NOTIFICATION, {
        notification: {
          _id: notification._id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          sourceType: notification.sourceType,
          sourceId: notification.sourceId,
          channelId: notification.channelId,
          threadId: notification.threadId,
          senderId: notification.senderId,
          senderName: notification.senderName,
          senderAvatar: notification.senderAvatar,
          channelName: notification.channelName,
          conversationId: notification.conversationId,
          conversationType: notification.conversationType,
          messageId: notification.sourceType === 'message' ? notification.sourceId : null,
          messagePreview: notification.messagePreview || notification.body || '',
          isRead: false,
          createdAt: notification.createdAt,
        },
      }, workspaceId?.toString());
    }

    // Also attempt web push if desktopNotifications setting is enabled
    try {
      const recipient = await userRepository.findById(recipientId);
      const desktopEnabled = recipient?.chatPreferences?.desktopNotifications;
      if (desktopEnabled) {
        const payload = {
          title: notification.title,
          body: notification.body,
          data: { notificationId: notification._id, workspaceId },
        };
        pushService.sendToUser(recipientId.toString(), payload).catch((err) => {
          logger.warn('Push send failed', { recipientId, error: err?.message || err })
        })
      }
    } catch (err) {
      logger.warn('Failed to evaluate push sending for notification', { recipientId, error: err.message })
    }

    return notification;
  }

  /**
   * Create a mention notification.
   */
  async createMentionNotification({
    workspaceId,
    recipientId,
    senderId,
    senderName,
    senderAvatar,
    channelId,
    channelName,
    messageId,
    preview,
    conversationId,
    conversationType,
  }) {
    const safeSenderName = senderName || 'Someone';
    const safeChannelName = channelName || 'channel';
    return this.create({
      workspaceId,
      recipientId,
      type: 'mention',
      title: `${safeSenderName} mentioned you in #${safeChannelName}`,
      body: preview || '',
      sourceType: 'message',
      sourceId: messageId,
      channelId,
      senderId,
      senderName: safeSenderName,
      senderAvatar: senderAvatar || null,
      channelName: safeChannelName,
      conversationId: conversationId || channelId,
      conversationType: conversationType || 'channel',
      messagePreview: preview || '',
    });
  }

  /**
   * Create a DM notification.
   */
  async createDMNotification({
    workspaceId,
    recipientId,
    senderId,
    senderName,
    senderAvatar,
    channelId,
    messageId,
    preview,
  }) {
    const safeSenderName = senderName || 'Someone';
    return this.create({
      workspaceId,
      recipientId,
      type: 'dm',
      title: `New message from ${safeSenderName}`,
      body: preview || '',
      sourceType: 'message',
      sourceId: messageId,
      channelId,
      senderId,
      senderName: safeSenderName,
      senderAvatar: senderAvatar || null,
      channelName: safeSenderName,
      conversationId: channelId,
      conversationType: 'dm',
      messagePreview: preview || '',
    });
  }

  /**
   * Create a channel invite notification.
   */
  async createChannelInviteNotification({ workspaceId, recipientId, channelId, channelName, inviterName, inviterId }) {
    return this.create({
      workspaceId,
      recipientId,
      type: 'channel_invite',
      title: `${inviterName} added you to #${channelName}`,
      body: '',
      sourceType: 'channel',
      sourceId: channelId,
      channelId,
      senderId: inviterId,
      senderName: inviterName,
      channelName,
    });
  }

  /**
   * Create a channel remove notification.
   */
  async createChannelRemoveNotification({ workspaceId, recipientId, channelId, channelName, removerName, removerId }) {
    const safeRemoverName = removerName || 'Someone';
    const safeChannelName = channelName || 'channel';
    return this.create({
      workspaceId,
      recipientId,
      type: 'channel_remove',
      title: removerId?.toString() === recipientId?.toString()
        ? `You left #${safeChannelName}`
        : `${safeRemoverName} removed you from #${safeChannelName}`,
      body: '',
      sourceType: 'channel',
      sourceId: channelId,
      channelId,
      senderId: removerId,
      senderName: safeRemoverName,
      channelName: safeChannelName,
    });
  }

  /**
   * Create a thread reply notification.
   */
  async createThreadReplyNotification({ workspaceId, recipientId, senderId, senderName, senderAvatar, channelId, channelName, threadId, messageId, preview }) {
    return this.create({
      workspaceId,
      recipientId,
      type: 'thread_reply',
      title: `${senderName} replied in a thread in #${channelName}`,
      body: preview || '',
      sourceType: 'message',
      sourceId: messageId,
      channelId,
      threadId,
      senderId,
      senderName: senderName || 'Someone',
      senderAvatar: senderAvatar || null,
      channelName,
      conversationId: channelId,
      conversationType: 'channel',
      messagePreview: preview || '',
    });
  }

  /**
   * Create a task update notification.
   */
  async createTaskNotification({ workspaceId, recipientId, title, body, channelId, channelName, senderId, senderName }) {
    return this.create({
      workspaceId,
      recipientId,
      type: 'task_update',
      title,
      body,
      sourceType: 'task',
      channelId,
      senderId,
      senderName,
      channelName,
    });
  }

  /**
   * Get notifications for a user with cursor-based pagination.
   */
  async getNotifications(recipientId, workspaceId, { cursor, limit = 30 } = {}) {
    const notifications = await Notification.getForUser(recipientId, workspaceId, { cursor, limit });
    const hasMore = notifications.length > limit;
    if (hasMore) notifications.pop();

    return {
      notifications,
      hasMore,
      nextCursor: hasMore && notifications.length > 0
        ? notifications[notifications.length - 1]._id
        : null,
    };
  }

  /**
   * Get unread notification count for a user in a workspace.
   */
  async getUnreadCount(recipientId, workspaceId) {
    return Notification.getUnreadCount(recipientId, workspaceId);
  }

  /**
   * Get unread counts per workspace (for workspace switcher badges).
   */
  async getUnreadCountsByWorkspace(recipientId) {
    return Notification.getUnreadCountsByWorkspace(recipientId);
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId, recipientId, workspaceId) {
    const notification = await Notification.markRead(notificationId, recipientId, workspaceId);
    if (!notification) {
      logger.warn('Notification not found or not owned by user', { notificationId, recipientId, workspaceId });
    }
    return notification;
  }

  /**
   * Mark all notifications as read for a user in a workspace.
   */
  async markAllAsRead(recipientId, workspaceId) {
    const result = await Notification.markAllRead(recipientId, workspaceId);
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Delete a single notification.
   */
  async deleteNotification(notificationId, recipientId, workspaceId) {
    return Notification.findOneAndDelete({ _id: notificationId, recipientId, workspaceId });
  }
}

export default new NotificationService();
