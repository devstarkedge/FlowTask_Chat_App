import messageRepository from './message.repository.js';
import channelRepository from '../channels/channel.repository.js';
import threadRepository from '../threads/thread.repository.js';
import userRepository from '../users/user.repository.js';
import { emitToChannel, emitToUser } from '../../sockets/socketManager.js';
import { sanitizeHtml, stripHtml, truncate, extractMentions } from '../../utils/sanitize.js';
import { parsePagination, buildCursorFilter, cursorPaginationResponse } from '../../utils/pagination.js';
import logger from '../../utils/logger.js';
import {
  SOCKET_EVENTS,
  MESSAGE_CONTENT_TYPES,
  MENTION_TYPES,
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
 */

class MessageService {
  // ──────────────────── Send Message ────────────────────────────────────────

  /**
   * Send a new message to a channel.
   */
  async sendMessage({ channelId, authorId, content, htmlContent, contentType, attachments, fileReferences, flowTaskRef, threadId }) {
    // Validate channel exists and is not archived
    const channel = await channelRepository.findById(channelId);
    if (!channel) throw new NotFoundError('Channel not found');
    if (channel.isArchived) throw new ForbiddenError('Channel is archived');

    // Sanitize content
    const sanitizedContent = content ? sanitizeHtml(content) : '';
    const sanitizedHtml = htmlContent ? sanitizeHtml(htmlContent) : sanitizedContent;

    if (!sanitizedContent && (!attachments || attachments.length === 0) && (!fileReferences || fileReferences.length === 0)) {
      throw new ValidationError('Message must have content or attachments');
    }

    // Extract mentions
    const mentions = extractMentions(sanitizedContent);

    // Build message data
    const messageData = {
      channelId,
      authorId,
      content: sanitizedContent,
      htmlContent: sanitizedHtml,
      contentType: contentType || MESSAGE_CONTENT_TYPES.TEXT,
      mentions,
      attachments: attachments || [],
    };

    if (flowTaskRef) {
      messageData.flowTaskRef = flowTaskRef;
    }

    if (threadId) {
      messageData.threadId = threadId;
    }

    // Persist
    const message = await messageRepository.create(messageData);

    if (fileReferences && fileReferences.length > 0) {
      const refsToCreate = fileReferences.map((fileId) => ({
        fileId,
        channelId,
        messageId: message._id,
        threadId: threadId || null,
        referencedBy: authorId,
        contextType: threadId ? 'thread' : 'channel',
      }));
      await FileReference.insertMany(refsToCreate);
    }

    // Populate author and fileReferences for emission
    const populated = await messageRepository.findById(message._id);

    // Update channel's last message
    const preview = truncate(stripHtml(sanitizedContent), 100);
    channelRepository.updateLastMessage(channelId, preview, new Date()).catch((err) => {
      logger.error('Failed to update last message', { channelId, error: err.message });
    });

    // If this is a thread reply, update thread stats
    if (threadId) {
      threadRepository.onReply(threadId, authorId)
        .then((thread) => {
          if (thread?.rootMessageId) {
            return messageRepository.incrementReplyCount(thread.rootMessageId);
          }
        })
        .catch((err) => {
          logger.error('Failed to update thread on reply', { threadId, error: err.message });
        });
    }

    // Emit to channel (real-time)
    emitToChannel(channelId.toString(), SOCKET_EVENTS.MESSAGE_NEW, {
      message: populated,
    });

    // Update unread counts for other members
    this._incrementUnreadForChannel(channelId, authorId).catch(() => {});

    // Notify mentioned users
    this._notifyMentions(mentions, populated, channel).catch(() => {});

    logger.debug('Message sent', {
      messageId: message._id,
      channelId,
      authorId,
      threadId: threadId || null,
    });

    return populated;
  }

  /**
   * Send a system message (bot, event notification).
   */
  async sendSystemMessage(channelId, content, flowTaskRef) {
    const messageData = {
      channelId,
      authorId: null,
      content,
      htmlContent: content,
      contentType: MESSAGE_CONTENT_TYPES.SYSTEM,
    };

    if (flowTaskRef) {
      messageData.flowTaskRef = flowTaskRef;
    }

    const message = await messageRepository.create(messageData);

    const preview = truncate(stripHtml(content), 100);
    channelRepository.updateLastMessage(channelId, preview, new Date()).catch(() => {});

    emitToChannel(channelId.toString(), SOCKET_EVENTS.MESSAGE_NEW, { message });

    return message;
  }

  // ──────────────────── Get Messages ────────────────────────────────────────

  /**
   * Get messages for a channel with cursor-based pagination.
   */
  async getChannelMessages(channelId, query = {}) {
    const { limit, cursor, direction } = parsePagination(query);
    const cursorFilter = cursor ? buildCursorFilter(cursor, direction) : {};

    const messages = await messageRepository.getChannelMessages(
      channelId,
      { limit, cursorFilter },
    );

    return cursorPaginationResponse(messages, limit, '_id');
  }

  /**
   * Get thread replies for a root message.
   */
  async getThreadReplies(threadId, query = {}) {
    const { limit, cursor } = parsePagination(query);
    const cursorFilter = cursor ? buildCursorFilter(cursor, 'after') : {};

    const messages = await messageRepository.getThreadReplies(threadId, {
      limit,
      cursorFilter,
    });

    return cursorPaginationResponse(messages, limit, '_id');
  }

  /**
   * Get a single message by ID.
   */
  async getMessageById(messageId) {
    const message = await messageRepository.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');
    return message;
  }

  // ──────────────────── Edit / Delete ───────────────────────────────────────

  /**
   * Edit a message. Only the author can edit. Stores edit history.
   */
  async editMessage(messageId, userId, newContent) {
    const message = await messageRepository.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    const authorIdStr = message.authorId?._id?.toString() || message.authorId?.toString();
    if (authorIdStr !== userId.toString()) {
      throw new ForbiddenError('Can only edit your own messages');
    }

    if (message.isDeleted) {
      throw new ForbiddenError('Cannot edit a deleted message');
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
    });

    const populated = await messageRepository.findById(messageId);

    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.MESSAGE_UPDATED, {
      message: populated,
    });

    return populated;
  }

  /**
   * Soft-delete a message. Author or admin can delete.
   */
  async deleteMessage(messageId, userId, isAdmin = false) {
    const message = await messageRepository.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    const authorIdStr = message.authorId?._id?.toString() || message.authorId?.toString();
    if (authorIdStr !== userId.toString() && !isAdmin) {
      throw new ForbiddenError('Can only delete your own messages');
    }

    await messageRepository.softDelete(messageId);

    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.MESSAGE_DELETED, {
      messageId,
      channelId: message.channelId,
    });

    return { messageId };
  }

  // ──────────────────── Reactions ────────────────────────────────────────────

  /**
   * Add a reaction to a message.
   */
  async addReaction(messageId, userId, emoji) {
    const message = await messageRepository.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    const updated = await messageRepository.addReaction(messageId, userId, emoji);

    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.REACTION_ADDED, {
      messageId,
      channelId: message.channelId,
      userId,
      emoji,
    });

    return updated;
  }

  /**
   * Remove a reaction from a message.
   */
  async removeReaction(messageId, userId, emoji) {
    const message = await messageRepository.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    const updated = await messageRepository.removeReaction(messageId, userId, emoji);

    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.REACTION_REMOVED, {
      messageId,
      channelId: message.channelId,
      userId,
      emoji,
    });

    return updated;
  }

  // ──────────────────── Pins ────────────────────────────────────────────────

  /**
   * Pin a message in its channel.
   */
  async pinMessage(messageId, userId) {
    const message = await messageRepository.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    await messageRepository.pin(messageId);

    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.MESSAGE_PINNED, {
      messageId,
      channelId: message.channelId,
      pinnedBy: userId,
    });

    return message;
  }

  /**
   * Unpin a message.
   */
  async unpinMessage(messageId, userId) {
    const message = await messageRepository.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    await messageRepository.unpin(messageId);

    emitToChannel(message.channelId.toString(), SOCKET_EVENTS.MESSAGE_UNPINNED, {
      messageId,
      channelId: message.channelId,
      unpinnedBy: userId,
    });

    return message;
  }

  /**
   * Get pinned messages for a channel.
   */
  async getPinnedMessages(channelId) {
    return messageRepository.getPinnedMessages(channelId);
  }

  // ──────────────────── Search ──────────────────────────────────────────────

  /**
   * Full-text search across messages.
   * Filters results to channels the user has access to.
   */
  async searchMessages(query, userId, channelId, options = {}) {
    const { limit } = parsePagination(options);

    // If no specific channel, restrict search to user's channels
    if (!channelId) {
      const userChannels = await channelRepository.findByMember(userId);
      const channelIds = userChannels.map((c) => c._id);
      return messageRepository.search(query, { channelIds, limit });
    }

    return messageRepository.search(query, { channelId, limit });
  }

  // ──────────────────── Internal Helpers ────────────────────────────────────

  /**
   * Increment unread counts for all channel members except the sender.
   * @private
   */
  async _incrementUnreadForChannel(channelId, senderUserId) {
    try {
      const { default: ReadReceipt } = await import('../readReceipts/ReadReceipt.model.js');

      // ReadReceipt.incrementUnread increments for everyone EXCEPT excludeUserId
      await ReadReceipt.incrementUnread(channelId, senderUserId);
    } catch (error) {
      logger.error('Failed to increment unread counts', {
        channelId,
        error: error.message,
      });
    }
  }

  /**
   * Notify mentioned users with a socket event.
   * @private
   */
  async _notifyMentions(mentions, message, channel) {
    if (!mentions || mentions.length === 0) return;

    for (const mention of mentions) {
      if (mention.type === MENTION_TYPES.USER) {
        const chatUser = await userRepository.findByFlowTaskId(mention.id);
        if (chatUser && chatUser._id.toString() !== message.authorId?.toString()) {
          emitToUser(chatUser._id.toString(), SOCKET_EVENTS.NOTIFICATION, {
            type: 'mention',
            channelId: channel._id,
            channelName: channel.name,
            messageId: message._id,
            authorName: message.authorId?.name || 'System',
            preview: truncate(stripHtml(message.content), 100),
          });
        }
      }
    }
  }
}

export default new MessageService();
