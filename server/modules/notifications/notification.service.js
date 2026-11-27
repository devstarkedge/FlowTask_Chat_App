import mongoose from 'mongoose';
import Notification from './Notification.model.js';
import { emitNotificationToUser, emitToUser } from '../../sockets/socketManager.js';
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
      deepLink: {
        workspaceId,
        channelId: channelId || conversationId || null,
        messageId: sourceType === 'message' ? sourceId : null,
        threadId: threadId || null,
        type: conversationType || (type === 'dm' ? 'dm' : 'channel'),
      },
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
      emitNotificationToUser(recipientId.toString(), SOCKET_EVENTS.NOTIFICATION, {
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
          replyTo: notification.replyTo || null,
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
  async createChannelInviteNotification({ workspaceId, recipientId, channelId, channelName, inviterName, inviterId, inviterAvatar }) {
    const safeInviterName = inviterName || 'Someone';
    const safeChannelName = channelName || 'channel';
    const titleText = `${safeInviterName} added you to #${safeChannelName}`;
    return this.create({
      workspaceId,
      recipientId,
      type: 'channel_invite',
      title: titleText,
      body: titleText,
      messagePreview: titleText,
      sourceType: 'channel',
      sourceId: channelId,
      channelId,
      senderId: inviterId,
      senderName: safeInviterName,
      senderAvatar: inviterAvatar || null,
      channelName: safeChannelName,
      conversationId: channelId,
      conversationType: 'channel',
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
  async createThreadReplyNotification({ workspaceId, recipientId, senderId, senderName, senderAvatar, channelId, channelName, threadId, messageId, preview, replyTo }) {
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
      ...(replyTo && { replyTo }),
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
  async getNotifications(recipientId, workspaceId, { cursor, limit = 30, filter } = {}) {
    const notifications = await Notification.getForUser(recipientId, workspaceId, { cursor, limit, filter });
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
   * Emits socket events for cross-device sync and unread count update.
   */
  async markAsRead(notificationId, recipientId, workspaceId, options = {}) {
    const notification = await Notification.markRead(notificationId, recipientId, workspaceId);
    if (!notification) {
      logger.warn('Notification not found or not owned by user', { notificationId, recipientId, workspaceId });
      return null;
    }
    import('../../services/notificationOutbox.service.js')
      .then(({ default: outbox }) => outbox.cancelForNotification(notificationId, 'already_read'))
      .catch(() => {});

    // If this notification is tied to a message and shouldSyncMessage is not disabled, mark the message as read too
    if (!options.skipMessageSync && (notification.sourceType === 'message' || notification.deepLink?.messageId)) {
      const messageId = notification.sourceId || notification.deepLink?.messageId;
      if (messageId) {
        try {
          const { markAsRead: markMessageAsRead } = await import('../readReceipts/readReceipt.service.js');
          await markMessageAsRead(messageId, notification.channelId, recipientId, workspaceId, { skipNotificationSync: true });
        } catch (err) {
          logger.warn('Failed to sync message read status from notification', { notificationId, messageId, error: err.message });
        }
      }
    }

    // Get updated unread count for this user in this workspace
    const effectiveWorkspaceId = workspaceId || notification.workspaceId;
    const unreadCount = await Notification.getUnreadCount(recipientId, effectiveWorkspaceId);

    const messageIdStr = (notification.sourceId || notification.deepLink?.messageId)?.toString() || null;

    // Emit NOTIFICATION_READ_SYNC to sync read state across all connected devices
    emitToUser(recipientId.toString(), SOCKET_EVENTS.NOTIFICATION_READ_SYNC, {
      notificationId: notification._id,
      notificationIds: [notification._id.toString()],
      messageId: messageIdStr,
      channelId: notification.channelId,
      workspaceId: effectiveWorkspaceId?.toString(),
    }, effectiveWorkspaceId?.toString());

    // Emit updated unread count so notification badges update in real-time
    emitToUser(recipientId.toString(), SOCKET_EVENTS.NOTIFICATION_UNREAD_UPDATED, {
      unreadCount,
      workspaceId: effectiveWorkspaceId?.toString(),
    }, effectiveWorkspaceId?.toString());

    return notification;
  }

  /**
   * Mark any notifications associated with a message as read for a recipient.
   * Emits socket events for real-time synchronization across all sessions.
   *
   * @param {string|ObjectId} messageId
   * @param {string|ObjectId} recipientId
   * @param {string|ObjectId} [workspaceId]
   * @returns {Promise<Array<object>>} Updated notifications
   */
  async markMessageNotificationsAsRead(messageId, recipientId, workspaceId) {
    if (!messageId || !recipientId) return [];

    const messageIdStr = messageId.toString();
    const recipientIdStr = recipientId.toString();

    if (!mongoose.Types.ObjectId.isValid(recipientIdStr) || !mongoose.Types.ObjectId.isValid(messageIdStr)) {
      return [];
    }

    const messageObjectId = new mongoose.Types.ObjectId(messageIdStr);
    const recipientObjectId = new mongoose.Types.ObjectId(recipientIdStr);

    const query = {
      recipientId: recipientObjectId,
      isRead: false,
      $or: [
        { sourceId: messageObjectId },
        { 'deepLink.messageId': messageObjectId },
      ],
    };

    if (workspaceId && mongoose.Types.ObjectId.isValid(workspaceId)) {
      query.workspaceId = new mongoose.Types.ObjectId(workspaceId);
    }

    const unreadNotifs = await Notification.find(query).lean();
    if (!unreadNotifs || unreadNotifs.length === 0) {
      return [];
    }

    const notifIds = unreadNotifs.map((n) => n._id);
    const now = new Date();

    await Notification.updateMany(
      { _id: { $in: notifIds } },
      { $set: { isRead: true, readAt: now } }
    );

    const effectiveWorkspaceId = workspaceId || unreadNotifs[0]?.workspaceId;
    const unreadCount = await Notification.getUnreadCount(
      recipientObjectId || recipientIdStr,
      effectiveWorkspaceId
    );

    emitToUser(recipientIdStr, SOCKET_EVENTS.NOTIFICATION_READ_SYNC, {
      notificationIds: notifIds.map((id) => id.toString()),
      notificationId: notifIds[0].toString(),
      messageId: messageIdStr,
      channelId: unreadNotifs[0]?.channelId?.toString() || null,
      workspaceId: effectiveWorkspaceId?.toString(),
    }, effectiveWorkspaceId?.toString());

    emitToUser(recipientIdStr, SOCKET_EVENTS.NOTIFICATION_UNREAD_UPDATED, {
      unreadCount,
      workspaceId: effectiveWorkspaceId?.toString(),
    }, effectiveWorkspaceId?.toString());

    return unreadNotifs;
  }

  /**
   * Mark any notifications associated with multiple messages as read for a recipient.
   */
  async markMessagesNotificationsAsRead(messageIds, recipientId, workspaceId) {
    if (!Array.isArray(messageIds) || messageIds.length === 0 || !recipientId) return [];

    const recipientIdStr = recipientId.toString();
    if (!mongoose.Types.ObjectId.isValid(recipientIdStr)) return [];
    const recipientObjectId = new mongoose.Types.ObjectId(recipientIdStr);

    const validObjectIds = messageIds
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id.toString()))
      .map((id) => new mongoose.Types.ObjectId(id.toString()));

    if (validObjectIds.length === 0) return [];

    const query = {
      recipientId: recipientObjectId,
      isRead: false,
      $or: [
        { sourceId: { $in: validObjectIds } },
        { 'deepLink.messageId': { $in: validObjectIds } },
      ],
    };

    if (workspaceId && mongoose.Types.ObjectId.isValid(workspaceId)) {
      query.workspaceId = new mongoose.Types.ObjectId(workspaceId);
    }

    const unreadNotifs = await Notification.find(query).lean();
    if (!unreadNotifs || unreadNotifs.length === 0) {
      return [];
    }

    const notifIds = unreadNotifs.map((n) => n._id);
    const now = new Date();

    await Notification.updateMany(
      { _id: { $in: notifIds } },
      { $set: { isRead: true, readAt: now } }
    );

    const effectiveWorkspaceId = workspaceId || unreadNotifs[0]?.workspaceId;
    const unreadCount = await Notification.getUnreadCount(
      recipientObjectId || recipientIdStr,
      effectiveWorkspaceId
    );

    emitToUser(recipientIdStr, SOCKET_EVENTS.NOTIFICATION_READ_SYNC, {
      notificationIds: notifIds.map((id) => id.toString()),
      notificationId: notifIds[0].toString(),
      messageIds: validObjectIds.map((id) => id.toString()),
      channelId: unreadNotifs[0]?.channelId?.toString() || null,
      workspaceId: effectiveWorkspaceId?.toString(),
    }, effectiveWorkspaceId?.toString());

    emitToUser(recipientIdStr, SOCKET_EVENTS.NOTIFICATION_UNREAD_UPDATED, {
      unreadCount,
      workspaceId: effectiveWorkspaceId?.toString(),
    }, effectiveWorkspaceId?.toString());

    return unreadNotifs;
  }

  /**
   * Mark message notifications in a channel as read up to a message (or all if not specified).
   * Does NOT mark unrelated notifications (e.g. other channels, non-message notifications).
   */
  async markChannelMessagesNotificationsAsRead(channelId, recipientId, workspaceId, lastReadMessageId = null) {
    if (!channelId || !recipientId) return [];

    const channelIdStr = channelId.toString();
    const recipientIdStr = recipientId.toString();

    if (!mongoose.Types.ObjectId.isValid(recipientIdStr) || !mongoose.Types.ObjectId.isValid(channelIdStr)) {
      return [];
    }

    const channelObjectId = new mongoose.Types.ObjectId(channelIdStr);
    const recipientObjectId = new mongoose.Types.ObjectId(recipientIdStr);

    const query = {
      recipientId: recipientObjectId,
      channelId: channelObjectId,
      sourceType: 'message',
      isRead: false,
    };

    if (workspaceId && mongoose.Types.ObjectId.isValid(workspaceId)) {
      query.workspaceId = new mongoose.Types.ObjectId(workspaceId);
    }

    if (lastReadMessageId) {
      try {
        const { default: Message } = await import('../messages/Message.model.js');
        const lastMsg = await Message.findById(lastReadMessageId).select('createdAt').lean();
        if (lastMsg?.createdAt) {
          query.createdAt = { $lte: lastMsg.createdAt };
        } else {
          const lastMsgIdStr = lastReadMessageId.toString();
          const lastMsgObjId = mongoose.Types.ObjectId.isValid(lastMsgIdStr)
            ? new mongoose.Types.ObjectId(lastMsgIdStr)
            : null;
          const orList = [
            { sourceId: lastMsgIdStr },
            { 'deepLink.messageId': lastMsgIdStr },
          ];
          if (lastMsgObjId) {
            orList.push({ sourceId: lastMsgObjId });
            orList.push({ 'deepLink.messageId': lastMsgObjId });
          }
          query.$or = orList;
        }
      } catch (err) {
        logger.debug('Failed to look up lastReadMessage for notification filter', { error: err.message });
      }
    }

    const unreadNotifs = await Notification.find(query).lean();
    if (!unreadNotifs || unreadNotifs.length === 0) return [];

    const notifIds = unreadNotifs.map((n) => n._id);
    const now = new Date();

    await Notification.updateMany(
      { _id: { $in: notifIds } },
      { $set: { isRead: true, readAt: now } }
    );

    const effectiveWorkspaceId = workspaceId || unreadNotifs[0]?.workspaceId;
    const unreadCount = await Notification.getUnreadCount(
      recipientObjectId || recipientIdStr,
      effectiveWorkspaceId
    );

    emitToUser(recipientIdStr, SOCKET_EVENTS.NOTIFICATION_READ_SYNC, {
      notificationIds: notifIds.map((id) => id.toString()),
      notificationId: notifIds[0].toString(),
      channelId: channelIdStr,
      workspaceId: effectiveWorkspaceId?.toString(),
    }, effectiveWorkspaceId?.toString());

    emitToUser(recipientIdStr, SOCKET_EVENTS.NOTIFICATION_UNREAD_UPDATED, {
      unreadCount,
      workspaceId: effectiveWorkspaceId?.toString(),
    }, effectiveWorkspaceId?.toString());

    return unreadNotifs;
  }

  /**
   * Mark all notifications as read for a user in a workspace.
   * Emits socket events for cross-device sync and unread count update.
   */
  async markAllAsRead(recipientId, workspaceId) {
    const result = await Notification.markAllRead(recipientId, workspaceId);
    import('../../services/notificationOutbox.service.js')
      .then(async ({ default: outbox }) => {
        const NotificationOutbox = (await import('./NotificationOutbox.model.js')).default;
        await NotificationOutbox.updateMany(
          { recipientId, workspaceId, status: 'pending' },
          { $set: { status: 'cancelled', cancelReason: 'already_read' } },
        );
      })
      .catch(() => {});

    // Emit NOTIFICATION_READ_SYNC to sync read state across all devices
    emitToUser(recipientId.toString(), SOCKET_EVENTS.NOTIFICATION_READ_SYNC, {
      notificationId: null, // null = mark all as read
      allRead: true,
      channelId: null,
      workspaceId: workspaceId?.toString(),
    }, workspaceId?.toString());

    // Emit updated unread count (should be 0)
    emitToUser(recipientId.toString(), SOCKET_EVENTS.NOTIFICATION_UNREAD_UPDATED, {
      unreadCount: 0,
      workspaceId: workspaceId?.toString(),
    }, workspaceId?.toString());

    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Delete a single notification.
   * Emits socket events for cross-device sync and unread count update.
   */
  async deleteNotification(notificationId, recipientId, workspaceId) {
    const notification = await Notification.findOneAndDelete({ _id: notificationId, recipientId, workspaceId });

    if (notification) {
      // Keep deletion in sync with every other session for this account.
      emitToUser(recipientId.toString(), SOCKET_EVENTS.NOTIFICATION_DISMISS, {
        notificationId: notification._id.toString(),
      }, workspaceId?.toString());

      // Get updated unread count
      const unreadCount = await Notification.getUnreadCount(recipientId, workspaceId);

      // Emit updated unread count
      emitToUser(recipientId.toString(), SOCKET_EVENTS.NOTIFICATION_UNREAD_UPDATED, {
        unreadCount,
        workspaceId: workspaceId?.toString(),
      }, workspaceId?.toString());
    }

    return notification;
  }
}

export default new NotificationService();
