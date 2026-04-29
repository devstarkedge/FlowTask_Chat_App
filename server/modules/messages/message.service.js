import messageRepository from './message.repository.js';
import channelRepository from '../channels/channel.repository.js';
import threadRepository from '../threads/thread.repository.js';
import userRepository from '../users/user.repository.js';
import { emitToChannel, emitToUser, getRoomOccupancy } from '../../sockets/socketManager.js';
import { sanitizeHtml, stripHtml, truncate, extractMentions } from '../../utils/sanitize.js';
import { parsePagination, buildCursorFilter, cursorPaginationResponse } from '../../utils/pagination.js';
import { messageSocketPayload, reactionSocketPayload, deleteSocketPayload } from '../../utils/socketPayload.js';
import { logMessageLatency, logDeliveryFailure } from '../../utils/performanceLogger.js';
import logger from '../../utils/logger.js';
import {
  SOCKET_EVENTS,
  MESSAGE_CONTENT_TYPES,
  MENTION_TYPES,
  CHANNEL_TYPES,
  MESSAGE_EDIT_WINDOW_MS,
} from '../../config/constants.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '../../middleware/errorHandler.js';
import FileReference from '../files/FileReference.model.js';

/**
 * Message Service — business logic for sending, editing, deleting messages,
 * reactions, pins, and search.
 *
 * Spec §6: Messages are chat-OWNED data. Content max 10,000 chars.
 * Reactions limited to ALLOWED_REACTIONS set.
 *
 * Enterprise optimizations:
 *  - Sender denormalization (senderSnapshot) for fast reads
 *  - Message ACK system with tempId reconciliation
 *  - Minimal socket payloads via socketPayload utility
 *  - Performance monitoring via performanceLogger
 */

class MessageService {
  _assertWorkspaceMatch(entityWorkspaceId, workspaceId, resource = 'Resource') {
    if (!workspaceId) {
      throw new ValidationError('Workspace context is required');
    }
    if (!entityWorkspaceId || entityWorkspaceId.toString() !== workspaceId.toString()) {
      throw new ForbiddenError(`${resource} does not belong to this workspace`);
    }
  }

  // ──────────────────── Send Message ────────────────────────────────────────

  /**
   * Send a new message to a channel.
   * Supports optimistic UI via tempId — client generates a temporary ID,
   * server includes it in the ACK so the client can reconcile.
   */
  async sendMessage({ channelId, authorId, content, htmlContent, contentType, attachments, fileReferences, flowTaskRef, threadId, tempId, workspaceId, mentions }) {
    const startTime = performance.now();

    // Validate channel exists and is not archived
    const channel = await channelRepository.findById(channelId, { workspaceId });
    if (!channel) throw new NotFoundError('Channel not found');
    if (channel.isArchived) throw new ForbiddenError('Channel is archived');

    // Sanitize content
    const sanitizedContent = content ? sanitizeHtml(content) : '';
    const sanitizedHtml = htmlContent ? sanitizeHtml(htmlContent) : sanitizedContent;

    if (!sanitizedContent && (!attachments || attachments.length === 0) && (!fileReferences || fileReferences.length === 0)) {
      throw new ValidationError('Message must have content or attachments');
    }

    // Process structured mentions or fallback to extracting from HTML
    let processedMentions = [];
    if (mentions && Array.isArray(mentions) && mentions.length > 0) {
      processedMentions = mentions.map(m => ({
        targetId: m.userId,
        name: m.username || 'Unknown',
        type: m.type || MENTION_TYPES.USER
      }));
    } else {
      // Fallback for older clients
      const extracted = extractMentions(sanitizedContent);
      processedMentions = extracted.map(m => ({
        targetId: m.id,
        name: m.name,
        type: m.type || MENTION_TYPES.USER
      }));
    }

    // Fetch sender data for snapshot denormalization
    const sender = await userRepository.findById(authorId);
    const senderSnapshot = sender
      ? { name: sender.name, avatar: sender.avatar || null }
      : { name: 'Unknown User', avatar: null };

    // Build message data
    const messageData = {
      channelId,
      authorId,
      content: sanitizedContent,
      htmlContent: sanitizedHtml,
      contentType: contentType || MESSAGE_CONTENT_TYPES.TEXT,
      mentions: processedMentions,
      attachments: attachments || [],
      senderSnapshot,
      ...(workspaceId && { workspaceId }),
    };

    if (flowTaskRef) {
      messageData.flowTaskRef = flowTaskRef;
    }

    let actualThreadId = null;
    let thread = null;

    if (threadId) {
      const threadWorkspaceId = workspaceId || channel.workspaceId;
      thread = await threadRepository.findById(threadId, { workspaceId: threadWorkspaceId?.toString() });
      if (!thread) {
        // Create the thread if this is the first reply to a message
        thread = await threadRepository.create({
          workspaceId: threadWorkspaceId,
          channelId,
          rootMessageId: threadId,
          participantIds: [authorId],
        });
      }
      actualThreadId = thread._id;
      messageData.threadId = actualThreadId;
    }

    // Persist
    const message = await messageRepository.create(messageData);

    if (fileReferences && fileReferences.length > 0) {
      const refContextType = actualThreadId
        ? 'thread'
        : channel.type === CHANNEL_TYPES.DM
          ? 'dm'
          : 'channel';
      const refsToCreate = fileReferences.map((fileId) => ({
        fileId,
        channelId,
        messageId: message._id,
        threadId: actualThreadId || null,
        referencedBy: authorId,
        contextType: refContextType,
        ...(workspaceId && { workspaceId }),
      }));
      await FileReference.insertMany(refsToCreate);
    }

    // Populate author and fileReferences for emission
    let populated = await messageRepository.findById(message._id, {
      workspaceId: (workspaceId || channel.workspaceId)?.toString(),
    });

    // Check delivery status BEFORE building the socket payload so the ACK / CREATE event
    // inherently contains the 'delivered' state. This prevents a race condition in the UI!
    if (channel.type === CHANNEL_TYPES.DM) {
      await this._updateDeliveryStatus(populated, channel, authorId).catch(() => {});
    }

    // Update channel's last message and emit socket event so sidebar reorders in real-time
    const preview = truncate(stripHtml(sanitizedContent), 100);
    const wsId = (workspaceId || channel.workspaceId)?.toString();
    const lastMessageAt = new Date();
    channelRepository.updateLastMessage(channelId, preview, lastMessageAt, wsId)
      .then(() => {
        // Emit channel:updated so all connected clients update lastMessageAt / lastMessagePreview
        // without needing a full page refresh. This drives sidebar reordering.
        emitToChannel(channelId.toString(), SOCKET_EVENTS.CHANNEL_UPDATED, {
          channelId: channelId.toString(),
          updates: {
            lastMessageAt: lastMessageAt.toISOString(),
            lastMessagePreview: preview,
          },
        }, wsId);
      })
      .catch((err) => {
        logger.error('Failed to update last message', { channelId, error: err.message });
      });

    // If this is a thread reply, update thread stats
    if (actualThreadId) {
      threadRepository.onReply(actualThreadId, authorId)
        .then((thread) => {
          if (thread?.rootMessageId) {
            return messageRepository.incrementReplyCount(thread.rootMessageId);
          }
        })
        .catch((err) => {
          logger.error('Failed to update thread on reply', { threadId: actualThreadId, error: err.message });
        });
    }

    // Build minimal socket payload
    const socketPayload = messageSocketPayload(populated, { tempId: tempId || null });

    // Emit to channel (real-time)
    try {
      if (actualThreadId) {
        // Thread reply → dedicated event (not injected into main chat)
        const resolvedRootMessageId = (thread?.rootMessageId || threadId).toString();
        emitToChannel(channelId.toString(), SOCKET_EVENTS.THREAD_REPLY, {
          message: socketPayload,
          threadId: actualThreadId.toString(),
          rootMessageId: resolvedRootMessageId,
        }, wsId);
      } else {
        // Main message → standard event
        emitToChannel(channelId.toString(), SOCKET_EVENTS.MESSAGE_CREATE, {
          message: socketPayload,
        }, wsId);
      }
    } catch (err) {
      logDeliveryFailure(message._id, err);
    }

    // Emit ACK to the sender specifically (for optimistic UI reconciliation)
    if (tempId) {
      try {
        const ackPayload = {
          tempId,
          message: socketPayload,
        };
        // Include rootMessageId for thread replies so frontend can reconcile
        // against the correct threadRepliesByRoot store key
        if (actualThreadId && thread) {
          ackPayload.rootMessageId = (thread.rootMessageId || threadId).toString();
        }
        emitToUser(authorId.toString(), SOCKET_EVENTS.MESSAGE_ACK, ackPayload, wsId);
      } catch (err) {
        logDeliveryFailure(message._id, err);
      }
    }

    // Update unread counts for other members
    this._incrementUnreadForChannel(channelId, authorId, wsId).catch(() => {});

    // ── Unified Notification Engine ──────────────────────────────────────
    // The engine handles ALL notification logic: mentions, DMs, thread replies,
    // keyword triggers, presence-based suppression, priority, and push delivery.
    import('../../services/notificationEngine.js').then(({ default: notificationEngine }) => {
      notificationEngine.processMessage(populated, channel, {
        threadId: actualThreadId || null,
        mentions: processedMentions,
      }).catch((err) => {
        logger.error('Notification engine failed', { messageId: message._id, error: err.message });
      });
    }).catch(() => {});

    // Remove draft for this conversation (non-blocking)
    this._removeDraftOnSend(authorId, channelId, actualThreadId, wsId).catch(() => {});

    // Log performance
    logMessageLatency(startTime, message._id.toString(), channelId.toString());

    logger.debug('Message sent', {
      messageId: message._id,
      channelId,
      authorId,
      threadId: threadId || null,
      tempId: tempId || null,
    });

    return populated;
  }

  /**
   * Send a system message (bot, event notification).
   */
  async sendSystemMessage(
  channelId,
  content,
  flowTaskRef,
  workspaceId,
  visibleTo = [],
  activityMeta = null
) {
  const botUser = await userRepository.ensureBotUser();

  // Normalize visibleTo — empty array means "visible to all channel members"
  let normalizedVisibleTo = [];
  if (Array.isArray(visibleTo) && visibleTo.length > 0) {
    normalizedVisibleTo = [...new Set(visibleTo.map(id => id.toString()))];
  }

  const messageData = {
    channelId,
    authorId: botUser._id,
    content,
    htmlContent: content,
    contentType: activityMeta ? MESSAGE_CONTENT_TYPES.ACTIVITY : MESSAGE_CONTENT_TYPES.SYSTEM,
    senderSnapshot: {
      name: botUser.name,
      avatar: botUser.avatar,
    },
    ...(workspaceId && { workspaceId }),
    // Empty array = visible to all channel members (DB query: visibleTo.$size:0 matches all)
    // Non-empty array = restricted to specific users
    visibleTo: normalizedVisibleTo,
  };

  if (flowTaskRef) {
    messageData.flowTaskRef = flowTaskRef;
  }

  if (activityMeta) {
    messageData.activityMeta = activityMeta;
  }

  logger.info('sendSystemMessage', {
    channelId,
    visibleToCount: normalizedVisibleTo.length,
    hasActivityMeta: !!activityMeta,
    workspaceId,
  });

  const message = await messageRepository.create(messageData);

  // Diagnostic: log created system message and room occupancy to help debug
  try {
    const roomOcc = getRoomOccupancy(workspaceId?.toString(), 'channel', channelId.toString());
    logger.info('sendSystemMessage: created', {
      messageId: message._id?.toString(),
      channelId,
      workspaceId: workspaceId?.toString(),
      visibleToCount: normalizedVisibleTo.length,
      flowTaskRef: message.flowTaskRef || null,
      activityMeta: message.activityMeta || null,
      roomOccupancy: roomOcc,
    });
  } catch (err) {
    logger.warn('sendSystemMessage: room occupancy check failed', { error: err.message });
  }

  const preview = truncate(stripHtml(content), 100);
  channelRepository
    .updateLastMessage(channelId, preview, new Date(), workspaceId?.toString())
    .catch(() => {});

  const socketPayload = messageSocketPayload(message);

  // Emit via socket
  if (normalizedVisibleTo.length > 0) {
    // Restricted visibility — send only to specific users
    normalizedVisibleTo.forEach(uid => {
      emitToUser(uid, SOCKET_EVENTS.MESSAGE_CREATE, { message: socketPayload }, workspaceId?.toString());
    });
  } else {
    // Broadcast to entire channel (task events, general system messages)
    emitToChannel(channelId.toString(), SOCKET_EVENTS.MESSAGE_CREATE, { message: socketPayload }, workspaceId?.toString());
  }

  return message;
}

  // ──────────────────── Get Messages ────────────────────────────────────────

  /**
   * Get messages for a channel with cursor-based pagination.
   */
  async getChannelMessages(channelId, query = {}, workspaceId, userId, user) {
    const { limit, cursor } = parsePagination(query);
    const direction = query.direction || 'before';

    const messages = await messageRepository.getChannelMessages(
      channelId,
      { limit, cursor, direction, workspaceId, userId,  isAdmin: user?.role === 'admin' },
    );
    return cursorPaginationResponse(messages, limit, '_id');
  }

  /**
   * Get a context window around a target message for deep-link navigation.
   */
  async getMessagesAround(channelId, messageId, query = {}, workspaceId) {
    const channel = await channelRepository.findById(channelId, { workspaceId });
    if (!channel) throw new NotFoundError('Channel not found');

    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 4), 80);
    const around = await messageRepository.getMessagesAround(channelId, messageId, {
      limit,
      workspaceId,
    });

    if (!around) {
      throw new NotFoundError('Message not found in this channel');
    }

    return {
      items: around.messages,
      highlightedMessageId: around.highlightedMessageId,
      hasMoreBefore: around.hasMoreBefore,
      hasMoreAfter: around.hasMoreAfter,
      pagination: { limit },
    };
  }

  /**
   * Get thread replies for a root message.
   */
  async getThreadReplies(threadId, query = {}, workspaceId) {
    const { limit, cursor } = parsePagination(query);
    const cursorFilter = cursor ? buildCursorFilter(cursor, 'after') : {};
    const cursorValue = cursorFilter?._id?.$gt || null;

    const messages = await messageRepository.getThreadReplies(threadId, {
      limit,
      cursor: cursorValue,
      workspaceId,
    });

    return cursorPaginationResponse(messages, limit, '_id');
  }

  /**
   * Get a single message by ID.
   */
  async getMessageById(messageId, workspaceId) {
    const message = await messageRepository.findById(messageId, { workspaceId });
    if (!message) throw new NotFoundError('Message not found');
    this._assertWorkspaceMatch(message.workspaceId, workspaceId, 'Message');
    return message;
  }

  // ──────────────────── Edit / Delete ───────────────────────────────────────

  /**
   * Edit a message. Only the author can edit. Stores edit history.
   */
  async editMessage(messageId, userId, newContent, workspaceId) {
    const message = await messageRepository.findById(messageId, { workspaceId });
    if (!message) throw new NotFoundError('Message not found');
    this._assertWorkspaceMatch(message.workspaceId, workspaceId, 'Message');

    const authorIdStr = message.authorId?._id?.toString() || message.authorId?.toString();
    if (authorIdStr !== userId.toString()) {
      throw new ForbiddenError('Can only edit your own messages');
    }

    if (message.isDeleted) {
      throw new ForbiddenError('Cannot edit a deleted message');
    }

    // Enforce edit time window
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    if (messageAge > MESSAGE_EDIT_WINDOW_MS) {
      throw new ForbiddenError('Edit window expired. Messages can only be edited within 10 minutes.');
    }

    const sanitizedContent = sanitizeHtml(newContent);
    if (!sanitizedContent) {
      throw new ValidationError('Content cannot be empty');
    }

    const updatedMessage = await messageRepository.update(messageId, {
      content: sanitizedContent,
      htmlContent: sanitizedContent,
      isEdited: true,
      $push: {
        editHistory: {
          content: message.content,
          editedAt: new Date(),
        },
      },
    }, workspaceId);

    const populated = await messageRepository.findById(messageId, { workspaceId });
    const socketPayload = messageSocketPayload(populated);

    // Resolve workspaceId: prefer message, then channel
    let wsId = (message.workspaceId || populated.workspaceId)?.toString();
    if (!wsId) {
      const ch = await channelRepository.findById(message.channelId, { workspaceId });
      wsId = ch?.workspaceId?.toString();
    }
    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.MESSAGE_UPDATE, {
      message: socketPayload,
    }, wsId);

    return populated;
  }

  /**
   * Soft-delete a message. Author or admin can delete.
   */
  async deleteMessage(messageId, userId, isAdmin = false, workspaceId) {
    const message = await messageRepository.findById(messageId, { workspaceId });
    if (!message) throw new NotFoundError('Message not found');
    this._assertWorkspaceMatch(message.workspaceId, workspaceId, 'Message');

    const authorIdStr = message.authorId?._id?.toString() || message.authorId?.toString();
    if (authorIdStr !== userId.toString() && !isAdmin) {
      throw new ForbiddenError('Can only delete your own messages');
    }

    await messageRepository.softDelete(messageId, userId, workspaceId);

    // Resolve workspaceId: prefer message, then channel
    let wsId = message.workspaceId?.toString();
    if (!wsId) {
      const ch = await channelRepository.findById(message.channelId, { workspaceId });
      wsId = ch?.workspaceId?.toString();
    }

    // Emit soft-delete event with isDeleted flag so clients render tombstone
    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.MESSAGE_DELETE, {
      messageId: messageId.toString(),
      channelId: message.channelId.toString(),
      isDeleted: true,
    }, wsId);

    return { messageId };
  }

  // ──────────────────── Reactions ────────────────────────────────────────────

  /**
   * Add a reaction to a message.
   */
  async addReaction(messageId, userId, emoji, workspaceId) {
    const message = await messageRepository.findById(messageId, { workspaceId });
    if (!message) throw new NotFoundError('Message not found');
    this._assertWorkspaceMatch(message.workspaceId, workspaceId, 'Message');

    // Repository expects arguments as (messageId, emoji, userId)
    const updated = await messageRepository.addReaction(messageId, emoji, userId);

    const wsId = message.workspaceId?.toString() || (await channelRepository.findById(message.channelId, { workspaceId }))?.workspaceId?.toString();
    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.REACTION_ADD,
      reactionSocketPayload({ messageId, channelId: message.channelId, userId, emoji }),
      wsId,
    );

    return updated;
  }

  /**
   * Remove a reaction from a message.
   */
  async removeReaction(messageId, userId, emoji, workspaceId) {
    const message = await messageRepository.findById(messageId, { workspaceId });
    if (!message) throw new NotFoundError('Message not found');
    this._assertWorkspaceMatch(message.workspaceId, workspaceId, 'Message');

    // Repository expects arguments as (messageId, emoji, userId)
    const updated = await messageRepository.removeReaction(messageId, emoji, userId);

    const wsId = message.workspaceId?.toString() || (await channelRepository.findById(message.channelId, { workspaceId }))?.workspaceId?.toString();
    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.REACTION_REMOVE,
      reactionSocketPayload({ messageId, channelId: message.channelId, userId, emoji }),
      wsId,
    );

    return updated;
  }

  // ──────────────────── Pins ────────────────────────────────────────────────

  /**
   * Pin a message in its channel.
   */
  async pinMessage(messageId, userId, workspaceId) {
    const message = await messageRepository.findById(messageId, { workspaceId });
    if (!message) throw new NotFoundError('Message not found');
    this._assertWorkspaceMatch(message.workspaceId, workspaceId, 'Message');

    await messageRepository.pin(messageId, userId, workspaceId);

    const wsId = message.workspaceId?.toString() || (await channelRepository.findById(message.channelId, { workspaceId }))?.workspaceId?.toString();
    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.MESSAGE_PINNED, {
      messageId,
      channelId: message.channelId,
      pinnedBy: userId,
    }, wsId);

    return message;
  }

  /**
   * Unpin a message.
   */
  async unpinMessage(messageId, userId, workspaceId) {
    const message = await messageRepository.findById(messageId, { workspaceId });
    if (!message) throw new NotFoundError('Message not found');
    this._assertWorkspaceMatch(message.workspaceId, workspaceId, 'Message');

    await messageRepository.unpin(messageId, workspaceId);

    const wsId = message.workspaceId?.toString() || (await channelRepository.findById(message.channelId, { workspaceId }))?.workspaceId?.toString();
    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.MESSAGE_UNPINNED, {
      messageId,
      channelId: message.channelId,
      unpinnedBy: userId,
    }, wsId);

    return message;
  }

  /**
   * Get pinned messages for a channel.
   */
  async getPinnedMessages(channelId, workspaceId) {
    return messageRepository.getPinnedMessages(channelId, workspaceId);
  }

  // ──────────────────── Search ──────────────────────────────────────────────

  /**
   * Full-text search across messages.
   * Filters results to channels the user has access to.
   */
  async searchMessages(query, userId, channelId, options = {}, workspaceId) {
    const { limit } = parsePagination(options);

    // If no specific channel, restrict search to user's channels
    if (!channelId) {
      const userChannels = await channelRepository.findByMember(userId, { workspaceId });
      const channelIds = userChannels.map((c) => c._id);
      return messageRepository.search(query, { channelIds, limit, workspaceId });
    }

    return messageRepository.search(query, { channelId, limit, workspaceId });
  }

  // ──────────────────── Internal Helpers ────────────────────────────────────

  /**
   * Update delivery status for DM messages.
   * If recipient is online, mark as delivered immediately.
   * @private
   */
  async _updateDeliveryStatus(message, channel, senderUserId) {
    try {
      const senderIdStr = senderUserId.toString();
      // dmParticipants now always stores ChatUser _id values
      const recipientParticipantId = channel.dmParticipants?.find(
        (p) => p.toString() !== senderIdStr
      );
      if (!recipientParticipantId) return;

      // Look up recipient by ChatUser _id (consistent with dmParticipants format)
      const recipient = await userRepository.findById(recipientParticipantId);
      if (!recipient) return;

      // Check if recipient is online (has active sockets)
      if (recipient.socketIds && recipient.socketIds.length > 0) {
        const now = new Date();
        message.status = 'delivered';
        message.deliveredAt = now;
        
        await messageRepository.update(message._id, {
          status: 'delivered',
          deliveredAt: now,
        }, channel.workspaceId?.toString());

        // Notify the sender about delivery
        emitToUser(senderUserId.toString(), SOCKET_EVENTS.MESSAGE_STATUS, {
          messageId: message._id.toString(),
          channelId: channel._id.toString(),
          status: 'delivered',
          deliveredAt: now,
        }, channel.workspaceId?.toString());
      }
    } catch (error) {
      logger.error('Failed to update delivery status', {
        messageId: message._id,
        error: error.message,
      });
    }
  }

  /**
   * Mark messages as seen in a DM channel.
   * Called when a user opens/views a DM conversation.
   */
  async markDMMessagesAsSeen(channelId, userId, workspaceId) {
    try {
      const channel = await channelRepository.findById(channelId, { workspaceId });
      if (!channel || channel.type !== CHANNEL_TYPES.DM) return;
      this._assertWorkspaceMatch(channel.workspaceId, workspaceId, 'Channel');

      const Message = (await import('./Message.model.js')).default;
      const now = new Date();

      // Find undelivered/unseen messages NOT from this user FIRST
      const unseenMessages = await Message.find({
        channelId,
        workspaceId,
        authorId: { $ne: userId },
        status: { $in: ['sent', 'delivered'] },
        isDeleted: false,
      }).select('_id authorId').lean();

      if (unseenMessages.length > 0) {
        const messageIds = unseenMessages.map(m => m._id);
        
        // Update the EXACT messages we just found
        await Message.updateMany(
          { _id: { $in: messageIds } },
          {
            $set: { status: 'seen', seenAt: now },
            $addToSet: { readBy: { userId, readAt: now } },
          }
        );

        // Group by author and notify each
        const authorIds = [...new Set(unseenMessages.map(m => m.authorId.toString()))];
        for (const authorId of authorIds) {
          const messageIds = unseenMessages
            .filter(m => m.authorId.toString() === authorId)
            .map(m => m._id.toString());

          emitToUser(authorId, SOCKET_EVENTS.MESSAGE_STATUS, {
            channelId: channelId.toString(),
            messageIds,
            status: 'seen',
            seenAt: now,
          }, channel.workspaceId?.toString());
        }
      }
    } catch (error) {
      logger.error('Failed to mark DM messages as seen', {
        channelId,
        userId,
        error: error.message,
      });
    }
  }

  /**
   * Increment unread counts for all channel members except the sender.
   * @private
   */
  async _incrementUnreadForChannel(channelId, senderUserId, workspaceId) {
    try {
      const { default: ReadReceipt } = await import('../readReceipts/ReadReceipt.model.js');

      // ReadReceipt.incrementUnread increments for everyone EXCEPT excludeUserId
      await ReadReceipt.incrementUnread(channelId, senderUserId, false, workspaceId);

      // Emit per-user unread:updated so badge counts update in real-time without refresh
      const updatedReceipts = await ReadReceipt.find({
        channelId,
        ...(workspaceId ? { workspaceId } : {}),
        userId: { $ne: senderUserId },
        unreadCount: { $gt: 0 },
      }).select('userId unreadCount').lean();

      for (const receipt of updatedReceipts) {
        emitToUser(receipt.userId.toString(), SOCKET_EVENTS.UNREAD_UPDATED, {
          channelId: channelId.toString(),
          unreadCount: receipt.unreadCount,
        }, workspaceId);
      }
    } catch (error) {
      logger.error('Failed to increment unread counts', {
        channelId,
        error: error.message,
      });
    }
  }

  /**
   * Notify mentioned users with a socket event and persist notification.
   * @private
   */
  async _notifyMentions(mentions, message, channel) {
    if (!mentions || mentions.length === 0) return;

    const notificationService = (await import('../notifications/notification.service.js')).default;
    const ChannelMember = (await import('../channels/ChannelMember.model.js')).default;

    for (const mention of mentions) {
      if (mention.type === MENTION_TYPES.USER) {
        // Find by ObjectId since targetId is the ChatUser _id
        const chatUser = await userRepository.findById(mention.targetId);
        if (chatUser && chatUser._id.toString() !== message.authorId?.toString()) {
          // Check channel mute preference
          const preferences = chatUser.preferences || {};
          const channelMutes = preferences.channelMutes || {};
          if (channelMutes[channel._id.toString()]) continue;

          // Persist notification
          await notificationService.createMentionNotification({
            workspaceId: message.workspaceId || channel.workspaceId,
            recipientId: chatUser._id,
            senderId: message.authorId?._id || message.authorId,
            senderName: message.senderSnapshot?.name || 'Someone',
            senderAvatar: message.senderSnapshot?.avatar || null,
            channelId: channel._id,
            channelName: channel.name,
            messageId: message._id,
            preview: truncate(stripHtml(message.content), 100),
            conversationId: channel._id,
            conversationType: channel.type === CHANNEL_TYPES.DM ? 'dm' : 'channel',
          });
        }
      } else if (mention.type === MENTION_TYPES.CHANNEL && (mention.name === 'channel' || mention.name === 'here')) {
        // @channel / @here — notify all (or online) channel members
        try {
          const memberIds = await ChannelMember.getMemberIds(channel._id);
          const authorIdStr = (message.authorId?._id || message.authorId)?.toString();

          // For @here, batch-load online status to avoid N+1 queries
          let onlineMemberIds = null;
          if (mention.name === 'here') {
            const members = await userRepository.findByIds(memberIds);
            onlineMemberIds = new Set(
              members.filter((m) => m.onlineStatus !== 'offline').map((m) => m._id.toString())
            );
          }

          for (const memberId of memberIds) {
            if (memberId === authorIdStr) continue;

            // For @here, only notify online users
            if (onlineMemberIds && !onlineMemberIds.has(memberId)) continue;

            await notificationService.createMentionNotification({
              workspaceId: message.workspaceId || channel.workspaceId,
              recipientId: memberId,
              senderId: message.authorId?._id || message.authorId,
              senderName: message.senderSnapshot?.name || 'Someone',
              senderAvatar: message.senderSnapshot?.avatar || null,
              channelId: channel._id,
              channelName: channel.name,
              messageId: message._id,
              preview: truncate(stripHtml(message.content), 100),
              conversationId: channel._id,
              conversationType: channel.type === CHANNEL_TYPES.DM ? 'dm' : 'channel',
            });
          }
        } catch (err) {
          logger.error('Failed to send @channel/@here notifications', {
            channelId: channel._id,
            error: err.message,
          });
        }
      }
    }
  }

  /**
   * Send DM notification to recipient (persisted).
   * Called after message is sent to a DM channel.
   * @private
   */
  async _notifyDMRecipient(message, channel, senderUserId) {
    try {
      const senderIdStr = senderUserId.toString();
      const recipientParticipantId = channel.dmParticipants?.find(
        (p) => p.toString() !== senderIdStr,
      );
      if (!recipientParticipantId) return;

      const recipient = await userRepository.findById(recipientParticipantId);
      if (!recipient) return;

      // Check DM mute preference
      const channelMutes = recipient.preferences?.channelMutes || {};
      if (channelMutes[channel._id.toString()]) return;

      const notificationService = (await import('../notifications/notification.service.js')).default;
      await notificationService.createDMNotification({
        workspaceId: message.workspaceId || channel.workspaceId,
        recipientId: recipient._id,
        senderId: message.authorId?._id || message.authorId,
        senderName: message.senderSnapshot?.name || 'Someone',
        senderAvatar: message.senderSnapshot?.avatar || null,
        channelId: channel._id,
        messageId: message._id,
        preview: truncate(stripHtml(message.content), 100),
      });
    } catch (error) {
      logger.error('Failed to notify DM recipient', {
        messageId: message._id,
        error: error.message,
      });
    }
  }

  /**
   * Remove draft when a message is sent (non-blocking).
   */
  async _removeDraftOnSend(authorId, channelId, threadId, workspaceId) {
    try {
      const draftService = (await import('../drafts/draft.service.js')).default;
      await draftService.removeDraftByConversation(authorId, channelId, threadId, workspaceId);
    } catch (err) {
      logger.debug('Draft removal after send failed (non-critical)', { error: err.message });
    }
  }

    /**
 * Delete messages linked to FlowTask entity (announcement, task, etc.)
 */
async deleteByFlowTaskRef(entityType, entityId, workspaceId) {
  const messages = await messageRepository.findByFlowTaskRef(
    entityType,
    entityId,
    workspaceId
  );

  if (!messages || messages.length === 0) return;

  for (const msg of messages) {
    //  Get updated message (IMPORTANT)
    const updatedMessage = await messageRepository.softDelete(
      msg._id,
      null, // system delete
      workspaceId
    );

    if (!updatedMessage) continue;

    const payload = {
      message: updatedMessage
    };

    //  If message has visibility → send only to those users
    if (updatedMessage.visibleTo && updatedMessage.visibleTo.length > 0) {
      updatedMessage.visibleTo.forEach(userId => {
        emitToUser(
          userId.toString(),
          SOCKET_EVENTS.MESSAGE_UPDATE,
          payload,
          workspaceId?.toString()
        );
      });
    } else {
      //  Public message → broadcast to channel
      emitToChannel(
        updatedMessage.channelId.toString(),
        SOCKET_EVENTS.MESSAGE_UPDATE,
        payload,
        workspaceId?.toString()
      );
    }
  }
}

}


export default new MessageService();
