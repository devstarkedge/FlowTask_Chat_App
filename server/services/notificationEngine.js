import NotificationPreference from '../modules/notifications/NotificationPreference.model.js';
import Notification from '../modules/notifications/Notification.model.js';
import userRepository from '../modules/users/user.repository.js';
import channelRepository from '../modules/channels/channel.repository.js';
import { isReportingChannel, reportingRecipients } from '../modules/reporting/reportingAccess.js';
import { isAttendanceNotificationEvent } from '../modules/reporting/attendanceNotification.js';
import { emitNotificationToUser, getIO } from '../sockets/socketManager.js';
import pushService from './push.service.js';
import logger from '../utils/logger.js';
import {
  SOCKET_EVENTS,
  CHANNEL_TYPES,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_CATEGORIES,
  MENTION_TYPES,
  buildRoomName,
} from '../config/constants.js';
import { stripHtml, truncate } from '../utils/sanitize.js';
import { getAttachmentPreview } from '../utils/getNotificationPreview.js';
import { shouldSendMobilePush } from '../utils/mobilePushDelivery.js';
import DeviceInstallation from '../modules/push/DeviceInstallation.model.js';
import notificationOutboxService from './notificationOutbox.service.js';

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

      const isAttendanceReport = isReportingChannel(channel) && Boolean(message.reportingEventId)
        && isAttendanceNotificationEvent(message.reportingMeta?.eventType);
      if (isReportingChannel(channel)) {
        // A queued channel snapshot can outlive an archive or access change.
        channel = await channelRepository.findById(channelIdStr, { workspaceId });
        if (!isReportingChannel(channel) || channel.isArchived) return;
      }

      // Detect conversation type
      const convType = isAttendanceReport ? 'department' : this._getConversationType(channel);

      // Get all recipients (members minus sender)
      const recipientIds = [...new Set(
        (await this._getRecipients(channel, senderIdStr, workspaceId))
          .map((id) => (id?._id || id)?.toString())
          .filter((id) => id && id !== senderIdStr)
      )];
      if (recipientIds.length === 0) return;

      // Extract mention target IDs for quick lookup
      const mentionedUserIds = new Set();
      const hasBroadcastMention = { channel: false, here: false, everyone: false };

      for (const mention of mentions) {
        const typeStr = (mention.type || '').toLowerCase();
        const rawTargetId = mention.targetId ?? mention.userId ?? mention.id;
        const targetIdStr = (rawTargetId?._id || rawTargetId || '').toString();
        const nameStr = (mention.name || '').toLowerCase();

        if (targetIdStr === 'channel' || nameStr === 'channel' || nameStr === 'everyone' || typeStr === 'channel') {
          hasBroadcastMention.channel = true;
        } else if (targetIdStr === 'here' || nameStr === 'here') {
          hasBroadcastMention.here = true;
        } else if (mention.type === MENTION_TYPES.USER || !mention.type) {
          if (mention.targetId && mention.targetId !== 'channel') {
            mentionedUserIds.add(mention.targetId.toString());
          }
        }
      }

      // Check for broadcast mentions in content
      const rawText = isAttendanceReport ? '' : `${message.content || ''} ${message.htmlContent || ''}`;
      if (/\b@channel\b/i.test(rawText) || /\b@everyone\b/i.test(rawText)) {
        hasBroadcastMention.channel = true;
      }
      if (/\b@here\b/i.test(rawText)) {
        hasBroadcastMention.here = true;
      }

      // Restrict @channel, @everyone, and @here to authorized senders
      if (hasBroadcastMention.channel || hasBroadcastMention.here || hasBroadcastMention.everyone) {
        const canBroadcast = await this._canSenderBroadcast(senderIdStr, channel, workspaceId, message);
        if (!canBroadcast) {
          logger.info('NotificationEngine: unauthorized broadcast mention suppressed', {
            senderId: senderIdStr,
            channelId: channelIdStr,
            workspaceId,
          });
          hasBroadcastMention.channel = false;
          hasBroadcastMention.here = false;
          hasBroadcastMention.everyone = false;
        }
      }

      // Build message preview — fall back to attachment label when there is no text
      const textPreview = truncate(stripHtml(message.content || ''), 120);
      const attachmentPreview = getAttachmentPreview(message);
      const isCheckIn = message.reportingMeta?.eventType === 'attendance.checked_in';
      const attendanceAction = isCheckIn ? 'checked in' : 'checked out';
      const employeeName = message.reportingMeta?.employeeName || '';
      const preview = isAttendanceReport
        ? `${truncate(stripHtml(employeeName), 90) || 'A team member'} ${attendanceAction}.`
        : textPreview || attachmentPreview || '';
      const senderName = message.senderSnapshot?.name || 'Someone';
      const senderAvatar = message.senderSnapshot?.avatar || null;
      const channelName = channel.name || 'channel';

      // Resolve original-message snapshot for reply linking in Activity
      const replyToPreview = await this._resolveReplyToPreview(message, threadId, workspaceId);

      const processRecipient = recipientId => this._processRecipient({
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
        replyToPreview,
        isAttendanceReport,
      });
      // Bound provider and DB fan-out during bursts of department check-ins.
      const batchSize = isAttendanceReport ? 8 : recipientIds.length;
      const results = [];
      for (let offset = 0; offset < recipientIds.length; offset += batchSize) {
        results.push(...await Promise.allSettled(recipientIds.slice(offset, offset + batchSize).map(processRecipient)));
      }

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
    replyToPreview = null,
    isAttendanceReport = false,
  }) {
    const recipientIdStr = recipientId.toString();

    // 1. Get user's notification preferences
    const prefs = await NotificationPreference.getOrCreate(recipientIdStr, workspaceId);

    // 2. Global kill switch
    if (!prefs.global?.enabled) {
      return { sent: false, reason: 'global_disabled' };
    }
    const recipient = await userRepository.findById(recipientIdStr);
    if (isAttendanceReport && (!recipient || recipient.isActive === false)) {
      return { sent: false, reason: 'inactive_recipient' };
    }
    if (!isAttendanceReport) {
      try {
        const { default: WorkspaceMembership } = await import('../modules/workspaces/WorkspaceMembership.model.js');
        const membership = await WorkspaceMembership.findOne({
          workspaceId,
          userId: recipientIdStr,
          isActive: { $ne: false },
        }).select('_id').lean();
        if (!membership) {
          return { sent: false, reason: 'not_workspace_member' };
        }
      } catch (err) {
        logger.debug('NotificationEngine: workspace membership check skipped', { error: err?.message });
      }
    }

    // 3. Check if sender is VIP (bypasses pause/DND)
    const isVIP = prefs.vipUsers?.some((id) => id.toString() === senderIdStr);

    // 4. Check pause / quiet hours (VIP bypasses)
    if (!isVIP) {
      const isPaused = await NotificationPreference.isPaused(recipientIdStr, workspaceId);
      if (isPaused) {
        return { sent: false, reason: 'paused' };
      }

      const globalDnd = recipient?.chatPreferences?.dnd;
      const isGlobalPaused = globalDnd?.enabled && (!globalDnd.endAt || new Date(globalDnd.endAt) > new Date());
      if (isGlobalPaused) {
        return { sent: false, reason: 'paused_global' };
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

    // 6. Determine if this message qualifies for notification based on level
    const isMentioned = mentionedUserIds.has(recipientIdStr);
    const isBroadcast = hasBroadcastMention.channel || hasBroadcastMention.everyone;
    const isHereMention = hasBroadcastMention.here;
    const isDM = convType === 'dm';
    const isThreadReply = !!threadId;

    // Direct mentions and authorized @channel/@everyone mentions bypass channel mute,
    // but an explicitly muted DM suppresses alerts while remaining in unread feed.
    const isChannelMuted = !channelLevel.shouldNotify || channelLevel.muted;
    if (isChannelMuted && (isDM || (!isMentioned && !isBroadcast))) {
      return { sent: false, reason: isDM ? 'dm_muted' : 'channel_muted' };
    }

    let shouldNotify = false;
    let notificationType = NOTIFICATION_TYPES.CHANNEL_MESSAGE;
    let priority = NOTIFICATION_PRIORITIES.LOW;
    let category = NOTIFICATION_CATEGORIES.CHANNEL_MESSAGE;

    if (isDM && !isThreadReply) {
      // DMs always notify (highest priority) — but NOT for thread replies
      shouldNotify = true;
      notificationType = NOTIFICATION_TYPES.DM;
      priority = NOTIFICATION_PRIORITIES.HIGH;
      category = NOTIFICATION_CATEGORIES.DM;
    } else if (isMentioned) {
      // A direct mention in a thread notifies the mentioned user even when
      // they have not participated in the thread yet.
      shouldNotify = true;
      notificationType = NOTIFICATION_TYPES.MENTION;
      priority = NOTIFICATION_PRIORITIES.HIGH;
      category = NOTIFICATION_CATEGORIES.MENTION;
    } else if (isThreadReply) {
      // Thread reply — notify root message author AND all thread participants
      shouldNotify = await this._isThreadParticipantOrAuthor(recipientIdStr, threadId, message, workspaceId);
      if (shouldNotify) {
        notificationType = NOTIFICATION_TYPES.THREAD_REPLY;
        priority = NOTIFICATION_PRIORITIES.MEDIUM;
        category = NOTIFICATION_CATEGORIES.THREAD_REPLY;
      }
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
    if (!shouldNotify && !isAttendanceReport && prefs.keywords?.length > 0) {
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

    // 8. Check presence — skip push/socket toast if user is viewing this exact chat.
    // Prefer in-memory socket.activeChannelId (set synchronously by window:focus)
    // over the async DB chatPreferences.activeWindowChannel field.
    const isOnline = recipient?.socketIds?.length > 0;
    const activeWindowChannel = recipient?.chatPreferences?.activeWindowChannel?.toString?.()
      || recipient?.chatPreferences?.activeWindowChannel
      || null;
    let isViewingSameChat = false;
    let socketFocusChecked = false;
    let hasFocusedConversation = false;
    // For attendance, let each client decide whether it is viewing the report.
    // A focused desktop must not silence a separate background phone.
    const io = isAttendanceReport ? null : getIO();
    if (io && workspaceId) {
      try {
        const userRoom = buildRoomName(workspaceId, 'user', recipientIdStr);
        const sockets = await io.in(userRoom).fetchSockets();
        socketFocusChecked = true;
        hasFocusedConversation = sockets.some(s => Boolean(s.activeChannelId));
        isViewingSameChat = sockets.some(
          (s) => s.activeChannelId && String(s.activeChannelId) === channelIdStr
        );
      } catch (err) {
        logger.debug('NotificationEngine: failed to check socket activeChannelId', {
          recipientId: recipientIdStr,
          error: err?.message,
        });
      }
    }
    if (!socketFocusChecked && isOnline && activeWindowChannel) {
      isViewingSameChat = String(activeWindowChannel) === channelIdStr;
    }

    const isAway = recipient?.onlineStatus === 'away';
    const isOffline = !isOnline;
    // "Blurred" means no focused conversation on any connected client.
    // Do NOT treat missing activeWindowChannel alone as blurred when sockets
    // already report the user is viewing this chat.
    const isWindowBlurred = socketFocusChecked
      ? !hasFocusedConversation
      : !isViewingSameChat && !activeWindowChannel;

    // 9. Build notification title
    const title = isAttendanceReport
      ? (message.reportingMeta.eventType === 'attendance.checked_in' ? 'Attendance check-in' : 'Attendance check-out')
      : this._buildTitle(notificationType, senderName, channelName, convType, isThreadReply, isBroadcast);

    // 10. Build deep-link data
    const deepLink = {
      workspaceId,
      channelId: channelIdStr,
      messageId: message._id?.toString(),
      threadId: threadId?.toString() || null,
      type: isDM ? 'dm' : isThreadReply ? 'thread' : 'channel',
    };
    // 11. Build bundle key for low-priority grouping
    const bundleKey = priority === NOTIFICATION_PRIORITIES.LOW && !isAttendanceReport
      ? `${convType}:${channelIdStr}`
      : null;

    // 12. Create notification record
    const eventKey = `message:${workspaceId}:${message._id}:${recipientIdStr}:${notificationType}`;
    const priorNotification = await Notification.findOne({ eventKey }).select('_id').lean();
    if (priorNotification) return { sent: false, reason: 'duplicate_event' };
    let notification;
    try {
      notification = await Notification.create({
        eventKey,
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
        ...(replyToPreview && { replyTo: replyToPreview }),
        deepLink,
        bundleKey,
      });
    } catch (err) {
      if (err?.code === 11000 && (err?.keyPattern?.eventKey || err?.keyValue?.eventKey)) {
        return { sent: false, reason: 'duplicate_event' };
      }
      throw err;
    }

    // 13. Emit the real-time notification. Desktop and mobile check their own focus for attendance.
    const attendanceDelivery = isAttendanceReport ? {
      reportingEventType: message.reportingMeta.eventType,
      desktopPushEnabled: Boolean(prefs.global.desktopPush),
      mobilePushEnabled: Boolean(prefs.global.mobilePush),
    } : null;
    if (isAttendanceReport || !isViewingSameChat) {
      this._emitSocketNotification(recipientIdStr, notification, workspaceId, {
        desktopPushEnabled: Boolean(prefs.global?.desktopPush),
        mobilePushEnabled: Boolean(prefs.global?.mobilePush),
        ...attendanceDelivery,
      });
    }

    // 14. Send push to configured devices using unified delivery policy.
    const shouldSendDesktopPush = isAttendanceReport || (!isViewingSameChat && (isAway || isOffline || isWindowBlurred));
    const desktopPushEnabled = Boolean(prefs.global?.desktopPush);
    const mobilePushEnabled = shouldSendMobilePush({ mobilePushEnabled: prefs.global?.mobilePush });
    const deliveryMode = prefs.global?.deliveryMode || 'immediately';
    const desktopFirstDelayMs = Math.max(0, Number(prefs.global?.desktopFirstDelaySec ?? 60)) * 1000;
    const desktopCanReceive = deliveryMode === 'desktop_first' && desktopPushEnabled && !isAttendanceReport
      ? await DeviceInstallation.canDesktopReceiveAlerts(recipientIdStr).catch(() => false)
      : false;
    const mobileDelayMs = deliveryMode === 'desktop_first' && desktopCanReceive ? desktopFirstDelayMs : 0;

    logger.info('NotificationEngine: delivery decision', {
      notificationId: notification._id?.toString(),
      eventKey,
      recipientId: recipientIdStr,
      workspaceId,
      channelId: channelIdStr,
      isOnline,
      isViewingSameChat,
      isAway,
      isOffline,
      isWindowBlurred,
      desktopPushEnabled,
      mobilePushEnabled,
      deliveryMode,
      desktopCanReceive,
      mobileDelayMs,
      route: mobilePushEnabled
        ? (mobileDelayMs > 0 ? 'desktop-first-delayed-mobile' : 'immediate-mobile')
        : (shouldSendDesktopPush ? 'desktop-only' : 'socket-only'),
    });

    const payload = this._buildPushPayload(notification, attendanceDelivery, prefs);

    // Web Push (desktop browser) when desktop is not actively viewing this chat
    if (shouldSendDesktopPush && desktopPushEnabled) {
      pushService.sendToUser(recipientIdStr, payload).catch((err) => {
        logger.warn('NotificationEngine: web push failed', {
          recipientId: recipientIdStr,
          error: err?.message || err,
        });
      });
    }

    // Mobile Push via durable outbox (supports immediately & desktop-first modes)
    if (mobilePushEnabled) {
      const enqueuePromise = notificationOutboxService.enqueueMobileOutbox({
        notification,
        recipientId: recipientIdStr,
        workspaceId,
        channelId: channelIdStr,
        messageId: message._id,
        payload,
        delayMs: mobileDelayMs,
      }).catch((err) => {
        logger.warn('NotificationEngine: mobile outbox enqueue failed', {
          recipientId: recipientIdStr,
          error: err?.message || err,
        });
      });
      if (isAttendanceReport) await enqueuePromise;
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

          const recipient = await userRepository.findById(recipientIdStr);
          const globalDnd = recipient?.chatPreferences?.dnd;
          const isGlobalPaused = globalDnd?.enabled && (!globalDnd.endAt || new Date(globalDnd.endAt) > new Date());
          if (isGlobalPaused) return null;
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

      // Send push for high/medium priority (and FlowTask task updates)
      if (priority !== NOTIFICATION_PRIORITIES.LOW || forceNotify) {
        const effectivePrefs = forceNotify
          ? { global: { enabled: true, desktopPush: true, mobilePush: true, deliveryMode: 'immediately', lockScreenPreview: 'full', sound: true } }
          : await NotificationPreference.getOrCreate(recipientIdStr, workspaceId);
        const payload = this._buildPushPayload(notification, null, effectivePrefs);
        if (effectivePrefs.global?.desktopPush) {
          pushService.sendToUser(recipientIdStr, payload).catch(() => {});
        }
        if (shouldSendMobilePush({ mobilePushEnabled: effectivePrefs.global?.mobilePush })) {
          const deliveryMode = effectivePrefs.global?.deliveryMode || 'immediately';
          const delayMs = deliveryMode === 'desktop_first' && effectivePrefs.global?.desktopPush
            && (await DeviceInstallation.canDesktopReceiveAlerts(recipientIdStr).catch(() => false))
            ? Math.max(0, Number(effectivePrefs.global?.desktopFirstDelaySec ?? 60)) * 1000
            : 0;
          notificationOutboxService.enqueueMobileOutbox({
            notification,
            recipientId: recipientIdStr,
            workspaceId,
            channelId,
            payload,
            delayMs,
          }).catch(() => {});
        }
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
   * Check whether the sender is authorized to trigger @channel / @everyone / @here broadcasts.
   * Allowed for system/bot messages, workspace owners/admins, and channel admins/moderators.
   * @private
   */
  async _canSenderBroadcast(senderIdStr, channel, workspaceId, message) {
    try {
      if (message?.isSystem || message?.senderType === 'bot') return true;
      const { default: WorkspaceMembership } = await import('../modules/workspaces/WorkspaceMembership.model.js');
      const wsMembership = await WorkspaceMembership.findOne({
        workspaceId,
        userId: senderIdStr,
        isActive: { $ne: false },
      }).select('role').lean();
      if (wsMembership && ['owner', 'admin'].includes(wsMembership.role)) {
        return true;
      }
      const { default: ChannelMember } = await import('../modules/channels/ChannelMember.model.js');
      const chMembership = await ChannelMember.findOne({
        channelId: channel._id,
        userId: senderIdStr,
      }).select('role').lean();
      return Boolean(chMembership && ['admin', 'moderator'].includes(chMembership.role));
    } catch {
      return false;
    }
  }

  _buildPushPayload(notification, attendanceDelivery = null, prefs = null) {
    return {
      title: notification.title,
      body: notification.body || notification.messagePreview || '',
      icon: notification.senderAvatar || '/icon-192x192.png',
      badge: '/badge.png',
      tag: notification.bundleKey || `notif:${notification._id}`,
      priority: notification.priority === 'low' ? 'default' : 'high',
      sound: prefs?.global?.sound === false ? false : undefined,
      data: {
        notificationId: notification._id?.toString(),
        eventKey: notification.eventKey || undefined,
        deepLink: this._buildDeepLinkUrl(notification.deepLink),
        workspaceId: notification.workspaceId?.toString(),
        channelId: notification.channelId?.toString(),
        messageId: notification.sourceId?.toString(),
        threadId: notification.threadId?.toString(),
        senderId: notification.senderId?.toString(),
        type: notification.type,
        priority: notification.priority,
        ...(attendanceDelivery && { reportingEventType: attendanceDelivery.reportingEventType }),
      },
    };
  }

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
      if (isReportingChannel(channel)) {
        if (channel.isArchived || String(channel.workspaceId) !== workspaceId) return [];
        return (await reportingRecipients(channel)).filter(id => id !== senderIdStr);
      }
      if (channel.type === CHANNEL_TYPES.DM) {
        // DM: get the other participant
        return (channel.dmParticipants || [])
          .map((p) => (p?._id || p).toString())
          .filter((p) => p !== senderIdStr);
      }

      // FlowTask project recipients include current workspace-scoped role
      // access as well as reconciled direct participants.
      const { getAuthorizedProjectUserIds, isFlowTaskProjectChannel } =
        await import('../modules/flowtask/projectAccess.service.js');
      const { default: ChannelMember } = await import('../modules/channels/ChannelMember.model.js');
      const memberIds = isFlowTaskProjectChannel(channel)
        ? await getAuthorizedProjectUserIds(channel, workspaceId)
        : await ChannelMember.getMemberIds(channel._id);
      return memberIds.filter((id) => id !== senderIdStr);
    } catch (error) {
      logger.error('NotificationEngine: _getRecipients failed', {
        channelId: channel._id, error: error.message,
      });
      return [];
    }
  }

  /**
   * Build a replyTo snapshot for Activity: prefer quote-reply data,
   * otherwise fall back to the thread root message.
   * @private
   */
  async _resolveReplyToPreview(message, threadId, workspaceId) {
    try {
      if (message.replyTo?.messageId || message.replyTo?.senderName) {
        const content = truncate(stripHtml(message.replyTo.content || ''), 120);
        const attachmentName = message.replyTo.attachment?.name || '';
        return {
          messageId: message.replyTo.messageId || message.parentMessageId || null,
          senderName: message.replyTo.senderName || 'User',
          content: content || attachmentName || '',
        };
      }

      if (!threadId) return null;

      const { default: threadRepository } = await import('../modules/threads/thread.repository.js');
      const { default: messageRepository } = await import('../modules/messages/message.repository.js');
      const thread = await threadRepository.findById(threadId, { workspaceId });
      if (!thread?.rootMessageId) return null;

      const rootMessage = await messageRepository.findById(
        thread.rootMessageId?.toString() || thread.rootMessageId,
        { workspaceId },
      );
      if (!rootMessage) return null;

      const rootContent = truncate(stripHtml(rootMessage.content || ''), 120);
      const rootAttachment = getAttachmentPreview(rootMessage);
      return {
        messageId: rootMessage._id,
        senderName:
          rootMessage.senderSnapshot?.name ||
          rootMessage.authorId?.name ||
          'User',
        content: rootContent || rootAttachment || '',
      };
    } catch (err) {
      logger.debug('NotificationEngine: _resolveReplyToPreview failed', {
        error: err?.message,
      });
      return null;
    }
  }

  /**
   * Check if a user participated in a thread (posted a reply) OR authored the root message.
   * This ensures the root message author always gets notified when someone replies.
   * @private
   */
  async _isThreadParticipantOrAuthor(userId, threadId, message, workspaceId) {
    try {
      const { default: threadRepository } = await import('../modules/threads/thread.repository.js');
      const thread = await threadRepository.findById(threadId, { workspaceId });
      if (!thread) return false;

      // Check if user is a thread participant (has replied)
      const isParticipant = thread.participantIds?.some((id) => id.toString() === userId);
      if (isParticipant) return true;

      // Check if user is the root message author
      const { default: messageRepository } = await import('../modules/messages/message.repository.js');
      const rootMessage = await messageRepository.findById(
        thread.rootMessageId?.toString() || thread.rootMessageId,
        { workspaceId }
      );
      if (!rootMessage) return false;

      const rootAuthorId = (rootMessage.authorId?._id || rootMessage.authorId)?.toString();
      return rootAuthorId === userId;
    } catch {
      return false;
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
  _buildTitle(type, senderName, channelName, convType, isThread, isBroadcast = false) {
    const safeSender = senderName || 'Someone';
    const safeChannel = channelName || 'channel';

    switch (type) {
      case NOTIFICATION_TYPES.DM:
        return `New message from ${safeSender}`;
      case NOTIFICATION_TYPES.MENTION:
        return isBroadcast
          ? `${safeSender} mentioned @channel in #${safeChannel}`
          : `${safeSender} mentioned you in #${safeChannel}`;
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
  _emitSocketNotification(recipientId, notification, workspaceId, attendanceDelivery = null) {
    try {
      emitNotificationToUser(recipientId, SOCKET_EVENTS.NOTIFICATION, {
        notification: {
          _id: notification._id,
          workspaceId: notification.workspaceId,
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
          replyTo: notification.replyTo || null,
          deepLink: notification.deepLink,
          bundleKey: notification.bundleKey,
          bundleCount: notification.bundleCount || 1,
          isRead: false,
          createdAt: notification.createdAt,
          ...attendanceDelivery,
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
  async _sendPush(recipientId, notification, prefs, attendanceDelivery = null, channels = {}) {
    let accepted = 0;
    const sendWeb = channels.web !== false;
    const sendFCM = channels.fcm !== false;
    const sendExpo = channels.expo !== false;
    const mobileEnabled = shouldSendMobilePush({ mobilePushEnabled: prefs.global?.mobilePush });
    // Skip if no push channel is enabled
    if (!(sendWeb && prefs.global?.desktopPush)
      && !(sendFCM && mobileEnabled)
      && !(sendExpo && mobileEnabled)) return;

    const payload = this._buildPushPayload(notification, attendanceDelivery, prefs);

    // Send via Web Push (VAPID) — desktop browsers
    if (sendWeb && prefs.global?.desktopPush) {
      try {
        const result = await pushService.sendToUser(recipientId, payload);
        accepted += result.sent || 0;
      } catch (err) {
        logger.warn('NotificationEngine: web push failed', {
          recipientId, error: err?.message,
        });
      }
    }

    // Send via FCM — Android/iOS when Firebase is configured
    if (sendFCM && mobileEnabled) {
      try {
        const result = await pushService.sendViaFCM(recipientId, payload);
        accepted += result.sent || 0;
      } catch (err) {
        logger.warn('NotificationEngine: FCM push failed', {
          recipientId, error: err?.message,
        });
      }
    }

    // Send via Expo Push — mobile app (expo-server-sdk)
    if (sendExpo && mobileEnabled) {
      try {
        const result = await pushService.sendViaExpo(recipientId, payload);
        accepted += result.sent || 0;
      } catch (err) {
        logger.warn('NotificationEngine: Expo push failed', {
          recipientId, error: err?.message,
        });
      }
    }
    if (accepted > 0) {
      await Notification.findByIdAndUpdate(notification._id, { $set: { pushSentAt: new Date() } });
    }
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
