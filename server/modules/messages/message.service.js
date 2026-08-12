import messageRepository from './message.repository.js';
import channelRepository from '../channels/channel.repository.js';
import threadRepository from '../threads/thread.repository.js';
import userRepository from '../users/user.repository.js';
import { emitToChannel, emitToUser, getRoomOccupancy, getIO } from '../../sockets/socketManager.js';
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
import { getAttachmentPreview } from '../../utils/getNotificationPreview.js';

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
  async sendMessage({ channelId, authorId, content, htmlContent, contentType, attachments, fileReferences, flowTaskRef, threadId, parentMessageId, tempId, workspaceId, mentions, gifMeta, audioMeta, videoMeta }) {
    const startTime = performance.now();

    // Validate channel exists and is not archived
    const channel = await channelRepository.findById(channelId, { workspaceId });
    if (!channel) throw new NotFoundError('Channel not found');
    if (channel.isArchived) throw new ForbiddenError('Channel is archived');

    // Sanitize content
    const sanitizedContent = content ? sanitizeHtml(content) : '';
    const sanitizedHtml = htmlContent ? sanitizeHtml(htmlContent) : sanitizedContent;

    if (!sanitizedContent && (!attachments || attachments.length === 0) && (!fileReferences || fileReferences.length === 0) && !gifMeta) {
      throw new ValidationError('Message must have content, attachments, or a GIF');
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
      gifMeta: gifMeta || undefined,
      audioMeta: audioMeta || undefined,
      videoMeta: videoMeta || undefined,
      senderSnapshot,
      ...(workspaceId && { workspaceId }),
    };

    if (tempId) {
      messageData.clientMessageId = tempId;
    }

    if (flowTaskRef) {
      messageData.flowTaskRef = flowTaskRef;
    }

    // ─── Resolve parent message (for Quote Replies) ───
    if (parentMessageId) {
      const parentMsg = await messageRepository.findById(parentMessageId, { workspaceId: (workspaceId || channel.workspaceId)?.toString() });
      if (parentMsg) {
        messageData.parentMessageId = parentMessageId;
        const parentAuthorId = parentMsg.authorId?._id || parentMsg.authorId || null;
        let pSenderName =
          parentMsg.senderSnapshot?.name ||
          parentMsg.authorId?.name ||
          null;

        // If snapshot/populate didn't give a name, fetch the user directly
        if (!pSenderName && parentAuthorId) {
          try {
            const parentAuthor = await userRepository.findById(parentAuthorId);
            pSenderName = parentAuthor?.name || parentAuthor?.email?.split?.('@')?.[0] || null;
          } catch (_) {
            // ignore lookup failure
          }
        }
        pSenderName = pSenderName || 'Someone';

        const pContent =
          parentMsg.content ||
          stripHtml(parentMsg.htmlContent || '') ||
          '';
        
        let pAttachment = null;
        // Prefer real media thumbs; skip empty attachment shells that clutter the quote UI
        if (parentMsg.attachments && parentMsg.attachments.length > 0) {
          const firstAtt = parentMsg.attachments[0];
          if (firstAtt?.url || firstAtt?.thumbnailUrl || firstAtt?.originalName || firstAtt?.fileName) {
            pAttachment = {
              type: 'attachment',
              name: firstAtt.originalName || firstAtt.fileName || 'Attachment',
              url: firstAtt.url,
              thumbnailUrl: firstAtt.thumbnailUrl,
            };
          }
        } else if (parentMsg.fileReferences && parentMsg.fileReferences.length > 0) {
          const firstFile = parentMsg.fileReferences[0]?.fileId;
          if (firstFile && (firstFile.secureUrl || firstFile.url || firstFile.originalName)) {
            pAttachment = {
              fileId: firstFile._id,
              type: firstFile.resourceType || 'file',
              name: firstFile.originalName || 'Attachment',
              url: firstFile.secureUrl || firstFile.url,
              thumbnailUrl: firstFile.thumbnailUrl,
            };
          }
        } else if (parentMsg.gifMeta) {
          pAttachment = {
            type: 'gif',
            name: 'GIF',
            url: parentMsg.gifMeta.gifUrl || parentMsg.gifUrl,
          };
        } else if (parentMsg.videoMeta || parentMsg.videoUrl) {
          pAttachment = {
            type: 'video',
            name: 'Video',
            url: parentMsg.videoUrl || parentMsg.videoMeta?.videoUrl,
            thumbnailUrl: parentMsg.thumbnailUrl || parentMsg.videoMeta?.thumbnailUrl,
          };
        } else if (parentMsg.audioMeta || parentMsg.audioUrl) {
           pAttachment = {
             type: 'audio',
             name: 'Audio Voice Note',
             url: parentMsg.audioUrl || parentMsg.audioMeta?.audioUrl,
           };
        }
        
        messageData.replyTo = {
          messageId: parentMsg._id,
          authorId: parentAuthorId,
          senderName: pSenderName,
          content: pContent,
          ...(pAttachment && { attachment: pAttachment }),
        };
      }
    }

    let actualThreadId = null;
    let thread = null;

    if (threadId) {
      const threadWorkspaceId = workspaceId || channel.workspaceId;
      thread = await threadRepository.findById(threadId, { workspaceId: threadWorkspaceId?.toString() });
      if (!thread) {
        // Create the thread if this is the first reply to a message
        // Fetch the root message to get its author and include them as a participant
        const rootMessage = await messageRepository.findById(threadId, { workspaceId: threadWorkspaceId?.toString() });
        const rootAuthorId = rootMessage?.authorId?._id?.toString() || rootMessage?.authorId?.toString();
        
        // Build participant list: always include both the replier AND the root message author
        // This ensures the original message author can see the thread in their thread list
        const participantIds = rootAuthorId
          ? [...new Set([authorId.toString(), rootAuthorId])]
          : [authorId];

        thread = await threadRepository.create({
          workspaceId: threadWorkspaceId,
          channelId,
          rootMessageId: threadId,
          participantIds,
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
          
      // Deduplicate fileIds to prevent E11000 duplicate key error on workspaceId_messageId_fileId index
      const uniqueFileReferences = [...new Set(fileReferences.map(id => id.toString()))];
      
      const refsToCreate = uniqueFileReferences.map((fileId) => ({
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
    // Build preview: text wins, fall back to attachment label so the channel sidebar
    // never shows an empty last-message preview for file-only messages.
    const textPreview = truncate(stripHtml(sanitizedContent), 100);
    const attachmentPreview = getAttachmentPreview(populated);
    const preview = textPreview || attachmentPreview || '';
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

    // If this is a thread reply, update thread stats and broadcast participant info
    if (actualThreadId) {
      threadRepository.onReply(actualThreadId, authorId)
        .then(async (thread) => {
          if (!thread?.rootMessageId) return;
          await messageRepository.incrementReplyCount(thread.rootMessageId);
          // Populate participant user data so clients can show replier avatars
          await thread.populate('participantIds', 'name avatar');
          emitToChannel(channelId.toString(), SOCKET_EVENTS.THREAD_STATS_UPDATED, {
            rootMessageId: thread.rootMessageId.toString(),
            channelId: channelId.toString(),
            replyCount: thread.replyCount,
            lastReplyAt: thread.lastReplyAt,
            participants: (thread.participantIds || []).map((p) => ({
              _id: p?._id,
              name: p?.name || 'Unknown',
              avatar: p?.avatar || null,
            })),          }, wsId);
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
    // We offload this to a background queue to prevent blocking the HTTP response.
    import('../../services/notificationQueue.service.js').then(({ default: notificationQueue }) => {
      notificationQueue.add(populated, channel, {
        threadId: actualThreadId || null,
        mentions: processedMentions,
      }).catch((err) => {
        logger.error('Failed to enqueue notification job', { messageId: message._id, error: err.message });
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
   * Get human-readable preview text for attachments.
   * Delegates to the shared getNotificationPreview utility which supports
   * both embedded attachments and populated fileReferences.
   * @private
   */
  _getAttachmentPreview(message) {
    return getAttachmentPreview(message);
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

    // Guard: skip creation if an identical activity message already exists within
    // the last 30 seconds (defense-in-depth against duplicate webhook deliveries).
    if (activityMeta?.eventType && activityMeta?.taskId) {
      const isDuplicate = await messageRepository.findRecentActivityDuplicate(
        channelId,
        activityMeta.eventType,
        String(activityMeta.taskId),
      );
      if (isDuplicate) {
        logger.warn('sendSystemMessage: duplicate activity suppressed', {
          channelId,
          eventType: activityMeta.eventType,
          taskId: activityMeta.taskId,
          workspaceId,
        });
        return null;
      }
    }

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
  async editMessage(messageId, userId, newContent, workspaceId, htmlContent) {
    const message = await messageRepository.findById(messageId, { workspaceId });
    if (!message) throw new NotFoundError('Message not found');
    this._assertWorkspaceMatch(message.workspaceId, workspaceId, 'Message');

    const authorIdStr = message.authorId?._id?.toString() || message.authorId?.toString();
    if (authorIdStr !== userId.toString()) {
      console.error(`[editMessage] 403: authorIdStr (${authorIdStr}) !== userId (${userId.toString()})`);
      throw new ForbiddenError('Can only edit your own messages');
    }

    if (message.isDeleted) {
      throw new ForbiddenError('Cannot edit a deleted message');
    }

    const sanitizedContent = sanitizeHtml(newContent);
    if (!sanitizedContent) {
      throw new ValidationError('Content cannot be empty');
    }

    const sanitizedHtml = htmlContent ? sanitizeHtml(htmlContent) : sanitizedContent;

    const updatedMessage = await messageRepository.update(messageId, {
      content: sanitizedContent,
      htmlContent: sanitizedHtml,
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
      console.error(`[deleteMessage] 403: authorIdStr (${authorIdStr}) !== userId (${userId.toString()}), isAdmin=${isAdmin}`);
      throw new ForbiddenError('Can only delete your own messages');
    }

    await messageRepository.softDelete(messageId, userId, workspaceId);

    // Resolve workspaceId: prefer message, then channel
    let wsId = message.workspaceId?.toString();
    if (!wsId) {
      const ch = await channelRepository.findById(message.channelId, { workspaceId });
      wsId = ch?.workspaceId?.toString();
    }

    // ── Recalculate channel's last message to handle UI cleanup ──
    const latestMessage = await messageRepository.getLatestInChannel(message.channelId, workspaceId);
    let newPreview = "";
    let newLastMessageAt = null;

    if (latestMessage) {
      const textPreview = truncate(stripHtml(latestMessage.content || latestMessage.htmlContent), 100);
      const attachmentPreview = getAttachmentPreview(latestMessage);
      newPreview = textPreview || attachmentPreview || "";
      newLastMessageAt = latestMessage.createdAt;
    }

    await channelRepository.updateLastMessage(message.channelId, newPreview, newLastMessageAt, wsId).catch(() => {});

    // Emit channel updated event so all clients remove the stale preview immediately
    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.CHANNEL_UPDATED, {
      channelId: message.channelId.toString(),
      updates: {
        lastMessagePreview: newPreview,
        lastMessageAt: newLastMessageAt ? newLastMessageAt.toISOString() : null,
      },
    }, wsId);

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

    // Capture the updated document returned by the repository (returnDocument: 'after')
    const updated = await messageRepository.pin(messageId, userId, workspaceId);

    const wsId = message.workspaceId?.toString() || (await channelRepository.findById(message.channelId, { workspaceId }))?.workspaceId?.toString();

    // Emit full message payload so clients can update pinnedMessagesByChannel without a round-trip
    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.MESSAGE_PINNED, {
      message: messageSocketPayload(updated || message, { pinnedBy: userId, pinnedAt: (updated || message).pinnedAt }),
      messageId,
      channelId: message.channelId,
      pinnedBy: userId,
      pinnedAt: (updated || message).pinnedAt,
    }, wsId);

    return updated || message;
  }

  /**
   * Unpin a message.
   */
  async unpinMessage(messageId, userId, workspaceId) {
    const message = await messageRepository.findById(messageId, { workspaceId });
    if (!message) throw new NotFoundError('Message not found');
    this._assertWorkspaceMatch(message.workspaceId, workspaceId, 'Message');

    // Capture the updated document returned by the repository (returnDocument: 'after')
    const updated = await messageRepository.unpin(messageId, workspaceId);

    const wsId = message.workspaceId?.toString() || (await channelRepository.findById(message.channelId, { workspaceId }))?.workspaceId?.toString();
    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.MESSAGE_UNPINNED, {
      messageId,
      channelId: message.channelId,
      unpinnedBy: userId,
    }, wsId);

    return updated || message;
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
      const recipientParticipantId = channel.dmParticipants?.find(
        (p) => p.toString() !== senderIdStr
      );
      if (!recipientParticipantId) return;

      const recipient = await userRepository.findById(recipientParticipantId);
      if (!recipient) return;

      // Check if recipient is online (has active sockets)
      if (recipient.socketIds && recipient.socketIds.length > 0) {
        const now = new Date();
        const channelIdStr = channel._id.toString();
        const recipientIdStr = recipientParticipantId.toString();

        // ── Check if recipient is actively viewing this DM ──────────────────
        // Use in-memory socket state (socket.activeChannelId) rather than DB
        // because socket.activeChannelId is set synchronously when window:focus
        // fires, while the DB write is async and may lag by milliseconds.
        let recipientIsViewing = false;
        const io = getIO();
        if (io) {
          try {
            const sockets = await io.fetchSockets();
            for (const sock of sockets) {
              const sockUserId = sock.chatUser?._id?.toString?.();
              if (sockUserId === recipientIdStr && sock.activeChannelId === channelIdStr) {
                recipientIsViewing = true;
                break;
              }
            }
          } catch (err) {
            // Fallback to DB-based check if socket fetch fails
            const activeWinChannel = recipient.chatPreferences?.activeWindowChannel?.toString();
            recipientIsViewing = activeWinChannel === channelIdStr;
          }
        } else {
          // Fallback: DB-based check
          const activeWinChannel = recipient.chatPreferences?.activeWindowChannel?.toString();
          recipientIsViewing = activeWinChannel === channelIdStr;
        }

        if (recipientIsViewing) {
          // Recipient has the DM open — skip 'delivered', go straight to 'seen'
          message.status = 'seen';
          message.seenAt = now;

          await messageRepository.update(message._id, {
            status: 'seen',
            seenAt: now,
          }, channel.workspaceId?.toString());

          // Notify the sender with blue double-tick immediately
          emitToUser(senderUserId.toString(), SOCKET_EVENTS.MESSAGE_STATUS, {
            messageId: message._id.toString(),
            channelId: channelIdStr,
            status: 'seen',
            seenAt: now,
          }, channel.workspaceId?.toString());
        } else {
          // Recipient is online but not actively viewing — mark as delivered
          message.status = 'delivered';
          message.deliveredAt = now;

          await messageRepository.update(message._id, {
            status: 'delivered',
            deliveredAt: now,
          }, channel.workspaceId?.toString());

          // Notify the sender about delivery
          emitToUser(senderUserId.toString(), SOCKET_EVENTS.MESSAGE_STATUS, {
            messageId: message._id.toString(),
            channelId: channelIdStr,
            status: 'delivered',
            deliveredAt: now,
          }, channel.workspaceId?.toString());
        }
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
   * Enhanced with active conversation awareness — users viewing the channel
   * will have messages auto-marked as read instead of incrementing unread.
   * @private
   */
  async _incrementUnreadForChannel(channelId, senderUserId, workspaceId) {
    try {
      const { getIO } = await import('../../sockets/socketManager.js');
      const { buildRoomName } = await import('../../config/constants.js');
      const { default: ReadReceipt } = await import('../readReceipts/ReadReceipt.model.js');

      const channel = await channelRepository.findById(channelId, { workspaceId });
      if (!channel) return;

      let memberIds = [];
      if (channel.type === 'dm') {
        memberIds = channel.dmParticipants || [];
      } else {
        memberIds = (channel.members || []).map(m => m.userId.toString());
      }

      const targetUserIds = memberIds.filter(id => id.toString() !== senderUserId.toString());
      if (targetUserIds.length === 0) return;

      // Use bulkWrite with upsert to safely increment or initialize unread counts
      const bulkOps = targetUserIds.map(userId => ({
        updateOne: {
          filter: { userId, channelId, workspaceId },
          update: { $inc: { unreadCount: 1 } },
          upsert: true
        }
      }));
      await ReadReceipt.bulkWrite(bulkOps);

      // Get all members with unread > 0
      const updatedReceipts = await ReadReceipt.find({
        channelId,
        ...(workspaceId ? { workspaceId } : {}),
        userId: { $in: targetUserIds },
        unreadCount: { $gt: 0 },
      }).select('userId unreadCount').lean();

      const io = getIO();
      
      for (const receipt of updatedReceipts) {
        const userId = receipt.userId.toString();
        
        // Check if this user has this channel as active conversation
        let isActiveConversation = false;
        if (io && workspaceId) {
          try {
            const userRoom = buildRoomName(workspaceId, 'user', userId);
            const sockets = await io.in(userRoom).fetchSockets();
            isActiveConversation = sockets.some(s => s.activeChannelId === channelId.toString());
          } catch (err) {
            logger.debug('Failed to check active conversation status', { 
              userId, 
              channelId, 
              error: err.message 
            });
          }
        }
        
        if (isActiveConversation) {
          // User is viewing this channel — don't send unread update
          // Auto-mark as read instead
          logger.debug('Auto-marking as read for active viewer', { 
            userId, 
            channelId 
          });
          await readReceiptRepository.markChannelAsRead(userId, channelId, null, workspaceId);
          
          // Emit zero unread count to client
          emitToUser(userId, SOCKET_EVENTS.UNREAD_UPDATED, {
            channelId: channelId.toString(),
            unreadCount: 0,
          }, workspaceId);
          continue;
        }
        
        // Send unread update only if not actively viewing
        emitToUser(userId, SOCKET_EVENTS.UNREAD_UPDATED, {
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

    // Build preview: prefer text, fall back to attachment label
    const textPreview = truncate(stripHtml(message.content || ''), 100);
    const attachmentPreview = this._getAttachmentPreview(message);
    const preview = textPreview || attachmentPreview || '';

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
            preview,
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
              preview,
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
      const dmTextPreview = truncate(stripHtml(message.content || ''), 100);
      const dmAttachmentPreview = this._getAttachmentPreview(message);
      const dmPreview = dmTextPreview || dmAttachmentPreview || '';
      await notificationService.createDMNotification({
        workspaceId: message.workspaceId || channel.workspaceId,
        recipientId: recipient._id,
        senderId: message.authorId?._id || message.authorId,
        senderName: message.senderSnapshot?.name || 'Someone',
        senderAvatar: message.senderSnapshot?.avatar || null,
        channelId: channel._id,
        messageId: message._id,
        preview: dmPreview,
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
   * @private
   */
  async _removeDraftOnSend(authorId, channelId, threadId, workspaceId) {
    try {
      const draftService = (await import('../drafts/draft.service.js')).default;
      await draftService.removeDraftByConversation(authorId, channelId, threadId, workspaceId);
    } catch (err) {
      logger.debug('Draft removal after send failed (non-critical)', { error: err.message });
    }
  }

  // ──────────────────── Forward Message ──────────────────────────────────────

  /**
   * Forward message(s) to a newly created group channel.
   * Creates a private channel with the given members, then forwards the
   * message(s) into it using the existing forwardMessage() pipeline.
   *
   * @param {Object} params
   * @param {string}   params.messageId        - Single message ID (from URL param)
   * @param {string[]} params.messageIds       - Bulk message IDs (optional)
   * @param {string[]} params.memberIds        - ChatUser IDs to include in the new group
   * @param {string}   params.groupName        - Optional custom group name
   * @param {string[]} params.attachmentFileIds - Optional file filter (single-file forward)
   * @param {string}   params.userId           - Current user ID (creator)
   * @param {string}   params.workspaceId      - Workspace scope
   * @returns {Promise<{ channel: Object, messages: Object[] }>}
   */
  async forwardToNewGroup({ messageId, messageIds, memberIds, groupName, attachmentFileIds, userId, workspaceId, customMessage }) {
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      throw new ValidationError('At least one member is required to create a group');
    }

    // Deduplicate and ensure creator is not in the memberIds (createCustomChannel adds them as owner)
    const uniqueMembers = [...new Set(memberIds.map(String))].filter(
      (id) => id !== userId.toString(),
    );

    // Build a display name if none provided — use member names
    let channelName = groupName?.trim();
    if (!channelName) {
      const allIds = [userId.toString(), ...uniqueMembers];
      const users = await userRepository.findByIds(allIds);
      const names = users.map((u) => u.name || 'Unknown');
      channelName = names.join(', ');
      // Truncate if too long
      if (channelName.length > 80) {
        channelName = channelName.slice(0, 77) + '...';
      }
    }

    // Create a private channel with the selected members
    // Dynamic import to avoid circular dependency (channels ↔ messages)
    const { default: channelService } = await import('../channels/channel.service.js');
    const channel = await channelService.createCustomChannel(
      { name: channelName, visibility: 'private', memberIds: uniqueMembers },
      userId,
      workspaceId,
    );

    // Forward the message(s) to the new channel
    const forwarded = await this.forwardMessage({
      messageId,
      messageIds,
      destinationIds: [channel._id.toString()],
      attachmentFileIds,
      userId,
      workspaceId,
      customMessage,
    });

    return { channel, messages: forwarded };
  }

  /**
   * Forward one or more messages to one or more destination channels.
   * Clones content, htmlContent, attachments, fileReferences, and forwardMeta.
   * Accepts either `messageId` (single) or `messageIds` (bulk) from the controller.
   *
   * `attachmentFileIds` — optional array of Cloudinary file IDs. When provided,
   * only the file references and attachments matching those IDs are cloned.
   * Used when forwarding a single file from a multi-file message.
   */
  async forwardMessage({ messageId, messageIds, destinationIds, attachmentFileIds, userId, workspaceId, customMessage }) {
    if (!destinationIds || !Array.isArray(destinationIds) || destinationIds.length === 0) {
      throw new ValidationError('At least one destination is required');
    }

    // Normalise to an array — support both single and bulk forwarding
    const idsToForward = messageIds && Array.isArray(messageIds) && messageIds.length > 0
      ? messageIds
      : messageId
        ? [messageId]
        : [];

    if (idsToForward.length === 0) {
      throw new ValidationError('At least one message ID is required');
    }

    // Build a Set of file IDs for targeted single-file forwarding
    const fileFilterSet = Array.isArray(attachmentFileIds) && attachmentFileIds.length > 0
      ? new Set(attachmentFileIds.map(String))
      : null;

    // Pre-fetch all original messages in one query for efficiency
    const originals = [];
    for (const id of idsToForward) {
      const orig = await messageRepository.findById(id, { workspaceId });
      if (!orig) throw new NotFoundError(`Message ${id} not found`);
      this._assertWorkspaceMatch(orig.workspaceId, workspaceId, 'Message');
      originals.push(orig);
    }

    const sender = await userRepository.findById(userId);
    const senderSnapshot = sender
      ? { name: sender.name, avatar: sender.avatar || null }
      : { name: 'Unknown User', avatar: null };

    const allForwardedMessages = [];

    for (const original of originals) {
      const sourceChannel = await channelRepository.findById(original.channelId, { workspaceId });
      if (!sourceChannel) throw new NotFoundError('Source channel not found');

      const originalAuthorId = original.authorId?._id || original.authorId;
      const originalAuthorName = original.senderSnapshot?.name || 'Unknown';
      // Format DM channel name to only show the other participants
      let sourceChannelName = sourceChannel.name || 'unknown';
      if (sourceChannel.type === CHANNEL_TYPES.DM) {
        const parts = sourceChannelName.split(',').map(s => s.trim());
        const otherParts = parts.filter(p => p !== senderSnapshot.name);
        sourceChannelName = otherParts.length > 0 ? otherParts.join(', ') : 'Direct Message';
      }

      // Pre-fetch original FileReferences so we can clone them
      let origFileRefs = original.fileReferences && original.fileReferences.length > 0
        ? original.fileReferences
        : await FileReference.find({ messageId: original._id, workspaceId }).lean();

      // Apply file filter: when forwarding a single file from a multi-file message,
      // restrict cloned file references and attachments to only the targeted file(s).
      if (fileFilterSet && origFileRefs.length > 0) {
        origFileRefs = origFileRefs.filter(ref => {
          const refFileId = String(ref.fileId?._id || ref.fileId);
          return fileFilterSet.has(refFileId);
        });
      }

      // Determine attachments to clone (filtered or all)
      let attachmentsToClone = original.attachments || [];
      if (fileFilterSet && attachmentsToClone.length > 0) {
        const filtered = attachmentsToClone.filter(att => {
          // Match by Cloudinary asset ID embedded in the URL path
          if (att.url && [...fileFilterSet].some(id => att.url.includes(id))) return true;
          if (att.cloudinaryId && fileFilterSet.has(String(att.cloudinaryId))) return true;
          if (att._id && fileFilterSet.has(String(att._id))) return true;
          return false;
        });
        // Only use filtered result if we found at least one match (safety fallback to all)
        if (filtered.length > 0) attachmentsToClone = filtered;
      }

      for (const destChannelId of destinationIds) {
        const destChannel = await channelRepository.findById(destChannelId, { workspaceId });
        if (!destChannel) {
          logger.warn('Forward: destination channel not found', { destChannelId });
          continue;
        }
        if (destChannel.isArchived) {
          logger.warn('Forward: destination channel is archived', { destChannelId });
          continue;
        }

        // Clone message data — content, htmlContent, attachments all copied verbatim
        const messageData = {
          channelId: destChannelId,
          authorId: userId,
          content: original.content || '',
          htmlContent: original.htmlContent || original.content || '',
          contentType: original.contentType || MESSAGE_CONTENT_TYPES.TEXT,
          gifMeta: original.gifMeta || null,
          audioMeta: original.audioMeta || null,
          videoMeta: original.videoMeta || null,
          attachments: attachmentsToClone.map(att => ({
            fileName: att.fileName,
            originalName: att.originalName,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            url: att.url,
            thumbnailUrl: att.thumbnailUrl || null,
            source: att.source,
            flowTaskAttachmentId: att.flowTaskAttachmentId || null,
          })),
          mentions: [],  // Don't carry over mentions to avoid re-triggering notifications
          senderSnapshot,
          workspaceId,
          forwardMeta: {
            isForwarded: true,
            originalMessageId: original._id,
            forwardedBy: userId,
            forwardedAt: new Date(),
            originalSenderId: originalAuthorId,
            originalSenderName: originalAuthorName,
            originalChannelId: original.channelId,
            originalChannelName: sourceChannelName,
            originalChannelType: sourceChannel.type,
            customMessage: customMessage || null,
          },
        };

        // Persist forwarded message
        const forwarded = await messageRepository.create(messageData);

        // ── Clone FileReferences (shared file storage, new reference records) ──
        if (origFileRefs.length > 0) {
          // Deduplicate based on fileId to prevent duplicate key errors
          const uniqueRefsMap = new Map();
          origFileRefs.forEach(ref => {
            const fId = (ref.fileId?._id || ref.fileId).toString();
            if (!uniqueRefsMap.has(fId)) {
              uniqueRefsMap.set(fId, ref);
            }
          });
          
          const newRefs = Array.from(uniqueRefsMap.values()).map(ref => ({
            workspaceId,
            fileId: ref.fileId?._id || ref.fileId,
            channelId: destChannelId,
            messageId: forwarded._id,
            threadId: null,
            referencedBy: userId,
            contextType: destChannel.type === CHANNEL_TYPES.DM ? 'dm' : 'channel',
          }));
          await FileReference.insertMany(newRefs, { ordered: false }).catch(err => {
            logger.warn('Forward: FileReference clone warning (non-fatal)', { error: err.message });
          });
        }

        // Populate for socket emission (includes fileReferences virtual + authorId)
        const populated = await messageRepository.findById(forwarded._id, { workspaceId });

        // Update destination channel's lastMessage
        const textPreview = truncate(stripHtml(messageData.content || messageData.htmlContent), 100);
        const attachmentPreview = getAttachmentPreview(populated);
        const preview = textPreview || attachmentPreview || '';

        const lastMessageAt = new Date();
        const wsId = workspaceId?.toString();
        channelRepository.updateLastMessage(destChannelId, preview, lastMessageAt, wsId)
          .then(() => {
            emitToChannel(destChannelId.toString(), SOCKET_EVENTS.CHANNEL_UPDATED, {
              channelId: destChannelId.toString(),
              updates: {
                lastMessageAt: lastMessageAt.toISOString(),
                lastMessagePreview: preview,
              },
            }, wsId);
          })
          .catch((err) => {
            logger.error('Forward: failed to update last message', { destChannelId, error: err.message });
          });

        // Emit socket event to destination channel
        const socketPayload = messageSocketPayload(populated);
        emitToChannel(destChannelId.toString(), SOCKET_EVENTS.MESSAGE_CREATE, {
          message: socketPayload,
        }, wsId);

        // Increment unread counts for destination
        this._incrementUnreadForChannel(destChannelId, userId, wsId).catch(() => {});

        allForwardedMessages.push(populated);
      }
    }



    return allForwardedMessages;
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