import threadRepository from './thread.repository.js';
import messageRepository from '../messages/message.repository.js';
import channelRepository from '../channels/channel.repository.js';
import { emitToChannel } from '../../sockets/socketManager.js';
import { sanitizeHtml } from '../../utils/sanitize.js';
import { parsePagination, cursorPaginationResponse, buildCursorFilter } from '../../utils/pagination.js';
import logger from '../../utils/logger.js';
import { SOCKET_EVENTS } from '../../config/constants.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../middleware/errorHandler.js';

/**
 * Thread Service — business logic for threaded discussions.
 *
 * Threads are linked to FlowTask tasks via flowTaskRef.taskId.
 * One task = one thread (enforced by unique sparse index).
 */

class ThreadService {
  /**
   * Create a thread from a root message.
   */
  async createThread({ channelId, rootMessageId, authorId, title, flowTaskRef, workspaceId }) {
    // Validate root message exists
    const rootMessage = await messageRepository.findById(rootMessageId);
    if (!rootMessage) throw new NotFoundError('Root message not found');

    if (rootMessage.channelId.toString() !== channelId.toString()) {
      throw new ValidationError('Root message does not belong to this channel');
    }

    // Check if thread already exists for this root message
    const existingThread = await threadRepository.findById(rootMessageId);
    if (existingThread) return existingThread;

    const threadData = {
      channelId,
      rootMessageId,
      title: title ? sanitizeHtml(title) : undefined,
      participantIds: [authorId],
      flowTaskRef,
      ...(workspaceId && { workspaceId }),
    };

    const thread = await threadRepository.create(threadData);

    emitToChannel(channelId.toString(), SOCKET_EVENTS.THREAD_CREATED, {
      thread,
      rootMessage,
    });

    logger.info('Thread created', {
      threadId: thread._id,
      channelId,
      rootMessageId,
      taskId: flowTaskRef?.taskId,
    });

    return thread;
  }

  /**
   * Find or create a thread for a FlowTask task.
   * Used by webhook handlers when a task event triggers a discussion.
   */
  async getOrCreateForTask(channelId, taskId, projectId, rootMessageId, workspaceId) {
    return threadRepository.findOrCreateForTask(channelId, taskId, projectId, rootMessageId, workspaceId);
  }

  /**
   * Get a thread by ID.
   */
  async getThreadById(threadId) {
    const thread = await threadRepository.findById(threadId);
    if (!thread) {
      // Check if it's a valid root message
      const rootMessage = await messageRepository.findById(threadId);
      if (rootMessage) {
        return {
          _id: rootMessage._id,
          rootMessageId: rootMessage._id,
          channelId: rootMessage.channelId,
          replyCount: rootMessage.replyCount || 0,
          participantIds: rootMessage.authorId ? [rootMessage.authorId] : [],
          createdAt: rootMessage.createdAt,
        };
      }
      throw new NotFoundError('Thread not found');
    }
    return thread;
  }

  /**
   * Get a thread by FlowTask task ID.
   */
  async getThreadByTaskId(taskId, workspaceId) {
    const thread = await threadRepository.findByTaskId(taskId, workspaceId);
    if (!thread) throw new NotFoundError('Thread not found for this task');
    return thread;
  }

  /**
   * Get all threads in a channel.
   */
  async getChannelThreads(channelId, query = {}, workspaceId) {
    const { limit } = parsePagination(query);
    return threadRepository.getChannelThreads(channelId, { limit }, workspaceId);
  }

  /**
   * Get threads the user participates in.
   */
  async getUserThreads(userId, query = {}, workspaceId) {
    const { limit } = parsePagination(query);
    return threadRepository.getUserThreads(userId, { limit }, workspaceId);
  }

  /**
   * Get replies in a thread (delegates to message service).
   */
  async getThreadReplies(threadIdOrRootId, query = {}) {
    // First resolve the actual thread to ensure we have the correct identifiers
    const thread = await threadRepository.findById(threadIdOrRootId);
    const { limit, cursor } = parsePagination(query);

    // If no Thread document exists, it means no one has replied yet. 
    // Return an empty list instead of throwing an error.
    if (!thread) {
      return cursorPaginationResponse([], limit, '_id');
    }

    const cursorFilter = cursor ? buildCursorFilter(cursor, 'after') : {};

    // message.repository.js 'getThreadReplies' expects the thread ID which matches Message.threadId.
    const messages = await messageRepository.getThreadReplies(thread._id, {
      limit,
      cursorFilter,
    });

    return cursorPaginationResponse(messages, limit, '_id');
  }

  /**
   * Lock a thread (prevent new replies).
   */
  async lockThread(threadId, userId) {
    const thread = await threadRepository.findById(threadId);
    if (!thread) throw new NotFoundError('Thread not found');

    await threadRepository.lock(threadId);

    emitToChannel(thread.channelId.toString(), SOCKET_EVENTS.THREAD_UPDATED, {
      threadId,
      updates: { isLocked: true },
      lockedBy: userId,
    });

    return threadRepository.findById(threadId);
  }

  /**
   * Resolve a thread (mark discussion as complete).
   */
  async resolveThread(threadId, userId) {
    const thread = await threadRepository.findById(threadId);
    if (!thread) throw new NotFoundError('Thread not found');

    await threadRepository.resolve(threadId, userId);

    emitToChannel(thread.channelId.toString(), SOCKET_EVENTS.THREAD_UPDATED, {
      threadId,
      updates: { isResolved: true },
      resolvedBy: userId,
    });

    return threadRepository.findById(threadId);
  }

  /**
   * Update thread title.
   */
  async updateThreadTitle(threadId, title, userId) {
    const thread = await threadRepository.findById(threadId);
    if (!thread) throw new NotFoundError('Thread not found');

    const sanitizedTitle = sanitizeHtml(title);
    await threadRepository.updateTitle(threadId, sanitizedTitle);

    emitToChannel(thread.channelId.toString(), SOCKET_EVENTS.THREAD_UPDATED, {
      threadId,
      updates: { title: sanitizedTitle },
      updatedBy: userId,
    });

    return threadRepository.findById(threadId);
  }
}

export default new ThreadService();
