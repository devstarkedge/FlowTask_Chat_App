import Notification from './Notification.model.js';
import { emitToUser } from '../../sockets/socketManager.js';
import { SOCKET_EVENTS } from '../../config/constants.js';
import logger from '../../utils/logger.js';

/**
 * Notification Service — business logic for creating, retrieving,
 * and managing persistent notifications.
 *
 * Notifications are workspace-scoped and emitted in real-time via socket.
 * Old notifications auto-expire after 90 days via TTL index.
 */
class NotificationService {
  /**
   * Create a notification, persist it, and emit via socket.
   * Respects channel mute preferences — suppresses notification if muted.
   */
  async create({ workspaceId, recipientId, type, title, body, sourceType, sourceId, channelId, threadId, senderId, senderName, channelName }) {
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
      channelName,
    });

    // Emit real-time notification to the recipient's personal room
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
        channelName: notification.channelName,
        isRead: false,
        createdAt: notification.createdAt,
      },
    });

    return notification;
  }

  /**
   * Create a mention notification.
   */
  async createMentionNotification({ workspaceId, recipientId, senderId, senderName, channelId, channelName, messageId, preview }) {
    return this.create({
      workspaceId,
      recipientId,
      type: 'mention',
      title: `${senderName} mentioned you in #${channelName}`,
      body: preview || '',
      sourceType: 'message',
      sourceId: messageId,
      channelId,
      senderId,
      senderName,
      channelName,
    });
  }

  /**
   * Create a DM notification.
   */
  async createDMNotification({ workspaceId, recipientId, senderId, senderName, channelId, messageId, preview }) {
    return this.create({
      workspaceId,
      recipientId,
      type: 'dm',
      title: `New message from ${senderName}`,
      body: preview || '',
      sourceType: 'message',
      sourceId: messageId,
      channelId,
      senderId,
      senderName,
      channelName: senderName,
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
   * Create a thread reply notification.
   */
  async createThreadReplyNotification({ workspaceId, recipientId, senderId, senderName, channelId, channelName, threadId, messageId, preview }) {
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
      senderName,
      channelName,
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
  async markAsRead(notificationId, recipientId) {
    const notification = await Notification.markRead(notificationId, recipientId);
    if (!notification) {
      logger.warn('Notification not found or not owned by user', { notificationId, recipientId });
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
  async deleteNotification(notificationId, recipientId) {
    return Notification.findOneAndDelete({ _id: notificationId, recipientId });
  }
}

export default new NotificationService();
