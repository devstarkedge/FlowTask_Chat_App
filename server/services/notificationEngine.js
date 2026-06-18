import NotificationPreference from '../modules/notifications/NotificationPreference.model.js';
import Notification from '../modules/notifications/Notification.model.js';
import userRepository from '../modules/users/user.repository.js';
import channelRepository from '../modules/channels/channel.repository.js';
import { emitToUser } from '../sockets/socketManager.js';
import pushService from './push.service.js';
import logger from '../utils/logger.js';
import {
  SOCKET_EVENTS,
  CHANNEL_TYPES,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_CATEGORIES,
  MENTION_TYPES,
} from '../config/constants.js';
import { stripHtml, truncate } from '../utils/sanitize.js';

/**
 * Notification Engine — the central brain for all notification decisions.
 *
 * When a message is created, the engine:
 *  1. Detects conversation type (DM / channel / group / thread / bot)
 *  2. Gets all members of the conversation
 *  3. Removes sender from recipients
 *  4. For each recipient, runs the full decision pipeline:
 *     a. Check global enabled toggle
 *     b. Check pause / quiet hours (unless VIP sender)
 *     c. Check per-section preference (channel level, group level, DM toggle)
 *     d. Check mention list (@user, @here, @channel)
 *     e. Check custom keywords in message content
 *     f. Check presence status (active in same chat → skip push)
 *     g. Determine priority level
 *     h. Send push or queue for bundling
 *  5. Save notification log
 *  6. Emit socket event for real-time in-app
 */

class NotificationEngine {
  /**
   * Process a new message and generate notifications for relevant recipients.
   * This is the main entry point — called from message.service.js.
   *
   * @param {object} message - The populated message document
   * @param {object} channel - The channel document
   * @param {object} [options] - Additional options
   * @param {string} [options.threadId] - Thread ID if this is a thread reply
   * @param {Array} [options.mentions] - Processed mention objects
   */
  async processMessage(message, channel, options = {}) {
    const startTime = Date.now();
    const { threadId, mentions = [] } = options;

    try {
      const senderIdStr = (message.authorId?._id || message.authorId)?.toString();
      const workspaceId = (message.workspaceId || channel.workspaceId)?.toString();
      const channelIdStr = channel._id.toString();

      if (!senderIdStr || !workspaceId) {
        logger.warn('NotificationEngine: missing sender or workspace', { messageId: message._id });
        return;
      }

      // Detect conversation type
      const convType = this._getConversationType(channel);

      // Get all recipients (members minus sender)
      const recipientIds = await this._getRecipients(channel, senderIdStr, workspaceId);
      if (recipientIds.length === 0) return;

      // Extract mention target IDs for quick lookup
      const mentionedUserIds = new Set();
      const hasBroadcastMention = { channel: false, here: false, everyone: false };

      for (const mention of mentions) {
        if (mention.type === MENTION_TYPES.USER && mention.targetId) {
          mentionedUserIds.add(mention.targetId.toString());
        } else if (mention.type === MENTION_TYPES.CHANNEL) {
          if (mention.name === 'channel' || mention.name === 'everyone') {
            hasBroadcastMention.channel = true;
          }
          if (mention.name === 'here') {
            hasBroadcastMention.here = true;
          }
        }
      }

      // Build message preview — fall back to attachment label when there is no text
      const textPreview = truncate(stripHtml(message.content || ''), 120);
      const attachmentPreview = this._getAttachmentPreview(message.attachments);
      const preview = textPreview || attachmentPreview || '';
      const senderName = message.senderSnapshot?.name || 'Someone';
      const senderAvatar = message.senderSnapshot?.avatar || null;
      const channelName = channel.name || 'channel';

      // Process each recipient
      const results = await Promise.allSettled(
        recipientIds.map((recipientId) =>
          this._processRecipient({
            recipientId,
            senderIdStr,
            workspaceId,
            channelIdStr,
            channelName,
            convType,
            channel,
            message,
            preview,
            senderName,
            senderAvatar,
            threadId,
            mentionedUserIds,
            hasBroadcastMention,
          }),
        ),
      );

      const sent = results.filter((r) => r.status === 'fulfilled' && r.value?.sent).length;
      const skipped = results.filter((r) => r.status === 'fulfilled' && !r.value?.sent).length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      logger.debug('NotificationEngine: processMessage complete', {
        messageId: message._id?.toString(),
        channelId: channelIdStr,
        recipientCount: recipientIds.length,
        sent,
        skipped,
        failed,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      logger.error('NotificationEngine: processMessage failed', {
        messageId: message._id?.toString(),
        error: error.message,
      });
    }
  }

  /**
   * Process notification for a single recipient.
   * Runs the full decision pipeline.
   * @private
   */
  async _processRecipient({
    recipientId,
    senderIdStr,
    workspaceId,
    channelIdStr,
    channelName,
    convType,
    channel,
    message,
    preview,
    senderName,
    senderAvatar,
    threadId,
    mentionedUserIds,
    hasBroadcastMention,
  }) {
    const recipientIdStr = recipientId.toString();

    // 1. Get user's notification preferences
    const prefs = await NotificationPreference.getOrCreate(recipientIdStr, workspaceId);

    // 2. Global kill switch
    if (!prefs.global?.enabled) {
      return { sent: false, reason: 'global_disabled' };
    }

    // 3. Check if sender is VIP (bypasses pause/DND)
    const isVIP = prefs.vipUsers?.some((id) => id.toString() === senderIdStr);

    // 4. Check pause / quiet hours (VIP bypasses)
    if (!isVIP) {
      const isPaused = await NotificationPreference.isPaused(recipientIdStr, workspaceId);
      if (isPaused) {
        return { sent: false, reason: 'paused' };
      }

      const inQuietHours = await NotificationPreference.isInQuietHours(recipientIdStr, workspaceId);
      if (inQuietHours) {
        return { sent: false, reason: 'quiet_hours' };
      }
    }

    // 5. Check per-section preference
    const channelLevel = await NotificationPreference.getChannelLevel(
      recipientIdStr, workspaceId, channelIdStr, convType,
    );

    if (!channelLevel.shouldNotify || channelLevel.muted) {
      return { sent: false, reason: 'channel_muted' };
    }

    // 6. Determine if this message qualifies for notification based on level
    const isMentioned = mentionedUserIds.has(recipientIdStr);
    const isBroadcast = hasBroadcastMention.channel || hasBroadcastMention.everyone;
    const isHereMention = hasBroadcastMention.here;
    const isDM = convType === 'dm';
    const isThreadReply = !!threadId;

    let shouldNotify = false;
    let notificationType = NOTIFICATION_TYPES.CHANNEL_MESSAGE;
    let priority = NOTIFICATION_PRIORITIES.LOW;
    let category = NOTIFICATION_CATEGORIES.CHANNEL_MESSAGE;

    if (isDM) {
      // DMs always notify (highest priority)
      shouldNotify = true;
      notificationType = NOTIFICATION_TYPES.DM;
      priority = NOTIFICATION_PRIORITIES.HIGH;
      category = NOTIFICATION_CATEGORIES.DM;
    } else if (isMentioned) {
      // Direct @mention
      shouldNotify = true;
      notificationType = NOTIFICATION_TYPES.MENTION;
      priority = NOTIFICATION_PRIORITIES.HIGH;
      category = NOTIFICATION_CATEGORIES.MENTION;
    } else if (isBroadcast) {
      // @channel / @everyone
      shouldNotify = true;
      notificationType = NOTIFICATION_TYPES.MENTION;
      priority = NOTIFICATION_PRIORITIES.MEDIUM;
      category = NOTIFICATION_CATEGORIES.MENTION;
    } else if (isHereMention) {
      // @here — only notify online users
      const recipient = await userRepository.findById(recipientIdStr);
      if (recipient?.onlineStatus !== 'offline') {
        shouldNotify = true;
        notificationType = NOTIFICATION_TYPES.MENTION;
        priority = NOTIFICATION_PRIORITIES.MEDIUM;
        category = NOTIFICATION_CATEGORIES.MENTION;
      }
    } else if (isThreadReply) {
      // Thread reply — check if recipient participated in thread
      shouldNotify = await this._isThreadParticipant(recipientIdStr, threadId, workspaceId);
      if (shouldNotify) {
        notificationType = NOTIFICATION_TYPES.THREAD_REPLY;
        priority = NOTIFICATION_PRIORITIES.MEDIUM;
        category = NOTIFICATION_CATEGORIES.THREAD_REPLY;
      }
    } else if (channelLevel.level === 'all') {
      // User opted into all messages for this channel
      shouldNotify = true;
      notificationType = convType === 'private' || convType === 'team'
        ? NOTIFICATION_TYPES.GROUP_MESSAGE
        : NOTIFICATION_TYPES.CHANNEL_MESSAGE;
      priority = NOTIFICATION_PRIORITIES.LOW;
    }
    // level === 'mentions' with no mention → skip
    // level === 'nothing' → already handled above

    // 7. Check custom keywords (triggers regardless of level)
    if (!shouldNotify && prefs.keywords?.length > 0) {
      const contentLower = (message.content || '').toLowerCase();
      const matched = prefs.keywords.some((kw) => contentLower.includes(kw.toLowerCase()));
      if (matched) {
        shouldNotify = true;
        notificationType = NOTIFICATION_TYPES.KEYWORD_MATCH;
        priority = NOTIFICATION_PRIORITIES.HIGH;
        category = NOTIFICATION_CATEGORIES.MENTION;
      }
    }

    if (!shouldNotify) {
      return { sent: false, reason: 'level_filter' };
    }

    // 8. Check presence — skip push if user is viewing this exact chat
    const recipient = await userRepository.findById(recipientIdStr);
    const activeWindowChannel = recipient?.chatPreferences?.activeWindowChannel;
    const isViewingSameChat = activeWindowChannel === channelIdStr;
    const isWindowBlurred = !activeWindowChannel;
    const isOnline = recipient?.socketIds?.length > 0;
    const isAway = recipient?.onlineStatus === 'away';
    const isOffline = !isOnline;

    // 9. Build notification title
    const title = this._buildTitle(notificationType, senderName, channelName, convType, isThreadReply);

    // 10. Build deep-link data
    const deepLink = {
      workspaceId,
      channelId: channelIdStr,
      messageId: message._id?.toString(),
      threadId: threadId?.toString() || null,
      type: isDM ? 'dm' : isThreadReply ? 'thread' : 'channel',
    };

    // 11. Build bundle key for low-priority grouping
    const bundleKey = priority === NOTIFICATION_PRIORITIES.LOW
      ? `${convType}:${channelIdStr}`
      : null;

    // 12. Create notification record
    const notification = await Notification.create({
      workspaceId,
      recipientId: recipientIdStr,
      type: notificationType,
      priority,
      category,
      title,
      body: preview,
      sourceType: 'message',
      sourceId: message._id,
      channelId: channelIdStr,
      threadId: threadId || null,
      senderId: senderIdStr,
      senderName,
      senderAvatar,
      channelName,
      conversationId: channelIdStr,
      conversationType: isDM ? 'dm' : 'channel',
      messagePreview: preview,
      deepLink,
      bundleKey,
    });

    // 13. Emit real-time socket notification (unless viewing same chat)
    if (!isViewingSameChat) {
      this._emitSocketNotification(recipientIdStr, notification, workspaceId);
    }

    // 14. Send push notification (only if NOT viewing same chat)
    const shouldSendPush = !isViewingSameChat && (isAway || isOffline || isWindowBlurred);
    if (shouldSendPush) {
      this._sendPush(recipientIdStr, notification, recipient, prefs).catch((err) => {
        logger.warn('NotificationEngine: push send failed', {
          recipientId: recipientIdStr,
          error: err?.message || err,
        });
      });
    }

    return { sent: true, notificationId: notification._id };
  }

  /**
   * Process a system/bot notification (not triggered by a user message).
   */
  async processSystemNotification({
    workspaceId,
    recipientId,
    type,
    title,
    body,
    priority = NOTIFICATION_PRIORITIES.MEDIUM,
    category = NOTIFICATION_CATEGORIES.SYSTEM,
    channelId = null,
    channelName = null,
    senderId = null,
    senderName = null,
    deepLink = null,
    forceNotify = false,
  }) {
    try {
      const recipientIdStr = recipientId.toString();

      // Check global preference (unless forced)
      if (!forceNotify) {
        const prefs = await NotificationPreference.getOrCreate(recipientIdStr, workspaceId);
        if (!prefs.global?.enabled) return null;

        // Check bot preference
        if (type === NOTIFICATION_TYPES.BOT_ALERT && !prefs.bots?.enabled) return null;

        // Check pause (high-priority system notifications bypass pause)
        if (priority !== NOTIFICATION_PRIORITIES.HIGH) {
          const isPaused = await NotificationPreference.isPaused(recipientIdStr, workspaceId);
          if (isPaused) return null;
        }
      }

      const notification = await Notification.create({
        workspaceId,
        recipientId: recipientIdStr,
        type,
        priority,
        category,
        title,
        body: body || '',
        sourceType: channelId ? 'channel' : 'workspace',
        channelId,
        channelName,
        senderId,
        senderName,
        deepLink: deepLink || { workspaceId, type: 'workspace' },
      });

      this._emitSocketNotification(recipientIdStr, notification, workspaceId);

      // Send push for high/medium priority
      if (priority !== NOTIFICATION_PRIORITIES.LOW) {
        const recipient = await userRepository.findById(recipientIdStr);
        this._sendPush(recipientIdStr, notification, recipient, forceNotify ? { global: { desktopPush: true, mobilePush: true } } : await NotificationPreference.getOrCreate(recipientIdStr, workspaceId)).catch(() => {});
      }

      return notification;
    } catch (error) {
      logger.error('NotificationEngine: processSystemNotification failed', {
        recipientId, type, error: error.message,
      });
      return null;
    }
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────────

  /**
   * Determine conversation type from channel document.
   * @private
   */
  _getConversationType(channel) {
    if (channel.type === CHANNEL_TYPES.DM) return 'dm';
    if (channel.type === CHANNEL_TYPES.PRIVATE || channel.visibility === 'private') return 'private';
    if (channel.type === CHANNEL_TYPES.TEAM) return 'team';
    if (channel.type === CHANNEL_TYPES.DEPARTMENT) return 'department';
    return 'public';
  }

  /**
   * Get all recipient IDs for a channel (minus sender).
   * @private
   */
  async _getRecipients(channel, senderIdStr, workspaceId) {
    try {
      if (channel.type === CHANNEL_TYPES.DM) {
        // DM: get the other participant
        return (channel.dmParticipants || [])
          .map((p) => p.toString())
          .filter((p) => p !== senderIdStr);
      }

      // Channel/group: get all member IDs
      const { default: ChannelMember } = await import('../modules/channels/ChannelMember.model.js');
      const memberIds = await ChannelMember.getMemberIds(channel._id);
      return memberIds.filter((id) => id !== senderIdStr);
    } catch (error) {
      logger.error('NotificationEngine: _getRecipients failed', {
        channelId: channel._id, error: error.message,
      });
      return [];
    }
  }

  /**
   * Check if a user participated in a thread (posted a reply).
   * @private
   */
  async _isThreadParticipant(userId, threadId, workspaceId) {
    try {
      const { default: threadRepository } = await import('../modules/threads/thread.repository.js');
      const thread = await threadRepository.findById(threadId, { workspaceId });
      if (!thread) return false;
      return thread.participantIds?.some((id) => id.toString() === userId);
    } catch {
      return false;
    }
  }

  /**
   * Build human-readable notification title.
   * @private
   */
  _buildTitle(type, senderName, channelName, convType, isThread) {
    const safeSender = senderName || 'Someone';
    const safeChannel = channelName || 'channel';

    switch (type) {
      case NOTIFICATION_TYPES.DM:
        return `New message from ${safeSender}`;
      case NOTIFICATION_TYPES.MENTION:
        return `${safeSender} mentioned you in #${safeChannel}`;
      case NOTIFICATION_TYPES.THREAD_REPLY:
        return `${safeSender} replied in a thread in #${safeChannel}`;
      case NOTIFICATION_TYPES.GROUP_MESSAGE:
        return `${safeSender} in ${safeChannel}`;
      case NOTIFICATION_TYPES.CHANNEL_MESSAGE:
        return `${safeSender} in #${safeChannel}`;
      case NOTIFICATION_TYPES.KEYWORD_MATCH:
        return `${safeSender} in #${safeChannel} (keyword match)`;
      case NOTIFICATION_TYPES.BOT_ALERT:
        return `Bot notification`;
      default:
        return `New notification`;
    }
  }

  /**
   * Emit socket notification to the recipient.
   * @private
   */
  _emitSocketNotification(recipientId, notification, workspaceId) {
    try {
      emitToUser(recipientId, SOCKET_EVENTS.NOTIFICATION, {
        notification: {
          _id: notification._id,
          type: notification.type,
          priority: notification.priority,
          category: notification.category,
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
          messagePreview: notification.messagePreview || notification.body || '',
          deepLink: notification.deepLink,
          bundleKey: notification.bundleKey,
          bundleCount: notification.bundleCount || 1,
          isRead: false,
          createdAt: notification.createdAt,
        },
      }, workspaceId);
    } catch (err) {
      logger.warn('NotificationEngine: socket emit failed', {
        recipientId, error: err?.message,
      });
    }
  }

  /**
   * Send push notification (Web Push + FCM + Expo).
   * @private
   */
  async _sendPush(recipientId, notification, recipient, prefs) {
    // Skip if no push channel is enabled
    if (!prefs.global?.desktopPush && !prefs.global?.mobilePush) return;

    const payload = {
      title: notification.title,
      body: notification.body || notification.messagePreview || '',
      icon: notification.senderAvatar || '/icon-192x192.png',
      badge: '/badge.png',
      tag: notification.bundleKey || `notif:${notification._id}`,
      data: {
        notificationId: notification._id?.toString(),
        deepLink: this._buildDeepLinkUrl(notification.deepLink),
        workspaceId: notification.workspaceId?.toString(),
        channelId: notification.channelId?.toString(),
        messageId: notification.sourceId?.toString(),
        threadId: notification.threadId?.toString(),
        type: notification.type,
        priority: notification.priority,
      },
    };

    // Send via Web Push (VAPID) — desktop browsers
    if (prefs.global?.desktopPush) {
      try {
        await pushService.sendToUser(recipientId, payload);
        await Notification.findByIdAndUpdate(notification._id, {
          $set: { pushSentAt: new Date() },
        });
      } catch (err) {
        logger.warn('NotificationEngine: web push failed', {
          recipientId, error: err?.message,
        });
      }
    }

    // Send via FCM — Android/iOS when Firebase is configured
    if (prefs.global?.mobilePush) {
      try {
        await pushService.sendViaFCM(recipientId, payload);
      } catch (err) {
        logger.warn('NotificationEngine: FCM push failed', {
          recipientId, error: err?.message,
        });
      }
    }

    // Send via Expo Push — mobile app (expo-server-sdk)
    if (prefs.global?.mobilePush) {
      try {
        await pushService.sendViaExpo(recipientId, payload);
      } catch (err) {
        logger.warn('NotificationEngine: Expo push failed', {
          recipientId, error: err?.message,
        });
      }
    }
  }

  /**
   * Get human-readable preview text for attachments.
   * @private
   */
  _getAttachmentPreview(attachments) {
    if (!attachments || attachments.length === 0) return null;

    const first = attachments[0];
    const mimeType = first.mimeType || '';
    const originalName = first.originalName || first.fileName || '';
    const ext = originalName.split('.').pop()?.toLowerCase() || '';

    let label;
    if (mimeType.startsWith('image/')) {
      label = '📷 Image';
    } else if (mimeType.startsWith('video/')) {
      label = '🎥 Video';
    } else if (mimeType.startsWith('audio/')) {
      label = '🎵 Audio';
    } else if (mimeType === 'application/pdf' || ext === 'pdf') {
      label = '📄 PDF File';
    } else if (['doc', 'docx'].includes(ext) || mimeType.includes('word') || mimeType.includes('document')) {
      label = '📄 Word Document';
    } else if (['xls', 'xlsx'].includes(ext) || mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      label = '📊 Excel Spreadsheet';
    } else if (ext === 'csv' || mimeType.includes('csv')) {
      label = '📊 CSV File';
    } else if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) {
      label = '🗜 ZIP Archive';
    } else {
      label = '📎 File Attachment';
    }

    if (attachments.length > 1) {
      return `${label} (${attachments.length} files)`;
    }

    return label;
  }

  /**
   * Build a URL path from deep-link data.
   * @private
   */
  _buildDeepLinkUrl(deepLink) {
    if (!deepLink?.workspaceId) return '/';

    const base = `/workspace/${deepLink.workspaceId}`;

    if (deepLink.type === 'dm' && deepLink.channelId) {
      const path = `${base}/dms/${deepLink.channelId}`;
      return deepLink.messageId ? `${path}/message/${deepLink.messageId}` : path;
    }

    if (deepLink.type === 'thread' && deepLink.channelId && deepLink.threadId) {
      return `${base}/channel/${deepLink.channelId}/message/${deepLink.messageId || deepLink.threadId}`;
    }

    if (deepLink.channelId) {
      const path = `${base}/channel/${deepLink.channelId}`;
      return deepLink.messageId ? `${path}/message/${deepLink.messageId}` : path;
    }

    return base;
  }
}

export default new NotificationEngine();
