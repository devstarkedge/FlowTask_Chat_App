import threadRepository from './thread.repository.js';
import messageRepository from '../messages/message.repository.js';
import channelRepository from '../channels/channel.repository.js';
import channelService from '../channels/channel.service.js';
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
    const rootMessage = await messageRepository.findById(rootMessageId, { workspaceId });
    if (!rootMessage) throw new NotFoundError('Root message not found');

    if (rootMessage.channelId.toString() !== channelId.toString()) {
      throw new ValidationError('Root message does not belong to this channel');
    }

    if (workspaceId && rootMessage.workspaceId?.toString() !== workspaceId.toString()) {
      throw new ForbiddenError('Root message does not belong to this workspace');
    }

    // Check if thread already exists for this root message
    const existingThread = await threadRepository.findById(rootMessageId, { workspaceId });
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

    // Fetch fully populated thread for socket event
    let populatedThread = await import('./Thread.model.js').then(m => m.default)
      .findById(thread._id)
      .populate('channelId', 'name slug type dmParticipants')
      .populate({
        path: 'rootMessageId',
        populate: { path: 'authorId', select: 'name email avatar onlineStatus' }
      })
      .lean();

    if (!populatedThread) populatedThread = thread.toObject ? thread.toObject() : thread;

    // Decorate the channel for DM naming if it's a DM
    if (populatedThread.channelId && populatedThread.channelId.type === 'dm') {
      const decorated = await channelService._decorateDMChannels([populatedThread.channelId], authorId, workspaceId);
      if (decorated && decorated.length > 0) {
        populatedThread.channelId = decorated[0];
      }
    }

    emitToChannel(channelId.toString(), SOCKET_EVENTS.THREAD_CREATED, {
      thread: populatedThread,
      rootMessage,
    }, workspaceId?.toString());

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
    return threadRepository.findOrCreateForTask({
      channelId,
      taskId,
      projectId,
      rootMessageId,
      workspaceId,
    });
  }

  /**
   * Get a thread by ID.
   */
  async getThreadById(threadId, workspaceId) {
    const thread = await threadRepository.findById(threadId, { workspaceId });
    if (!thread) {
      // Check if it's a valid root message
      const rootMessage = await messageRepository.findById(threadId, { workspaceId });
      if (rootMessage && (!workspaceId || rootMessage.workspaceId?.toString() === workspaceId.toString())) {
        return {
          _id: rootMessage._id,
          rootMessageId: rootMessage._id,
          channelId: rootMessage.channelId,
          workspaceId: rootMessage.workspaceId,
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
    const threads = await threadRepository.getUserThreads(userId, { limit, workspaceId });
    
    // Extract and decorate channelIds
    const channels = threads.map(t => t.channelId).filter(Boolean);
    const decoratedChannels = await channelService._decorateDMChannels(channels, userId, workspaceId);
    
    const channelMap = new Map(decoratedChannels.map(c => [c._id?.toString() || c.id, c]));
    
    return threads.map(t => {
      const channelIdStr = t.channelId?._id?.toString() || t.channelId?.toString();
      return {
        ...t,
        channelId: channelMap.get(channelIdStr) || t.channelId
      };
    });
  }

  /**
   * Get replies in a thread — now also includes the parent message.
   * Returns { parentMessage, items (replies), hasMore }
   */
  async getThreadReplies(threadIdOrRootId, query = {}, workspaceId) {
    // First resolve the actual thread to ensure we have the correct identifiers
    const thread = await threadRepository.findById(threadIdOrRootId, { workspaceId });
    const { limit, cursor } = parsePagination(query);

    // If no Thread document exists, it means no one has replied yet.
    // We still try to return the parent message.
    let rootMessageId = threadIdOrRootId;
    if (thread) {
      rootMessageId = thread.rootMessageId || thread._id;
    }

    // Fetch the parent/root message
    const parentMessage = await messageRepository.findById(rootMessageId, { workspaceId });

    // If no thread and no parent message, return empty
    if (!thread) {
      return {
        parentMessage: parentMessage || null,
        items: [],
        hasMore: false,
      };
    }

    const cursorFilter = cursor ? buildCursorFilter(cursor, 'after') : {};
    const cursorValue = cursorFilter?._id?.$gt || null;

    // message.repository.js 'getThreadReplies' expects the thread ID which matches Message.threadId.
    const messages = await messageRepository.getThreadReplies(thread._id, {
      limit,
      cursor: cursorValue,
      workspaceId,
    });

    return cursorPaginationResponse(messages, limit, '_id', parentMessage);
  }

  /**
   * Lock a thread (prevent new replies).
   */
  async lockThread(threadId, userId, workspaceId) {
    const thread = await threadRepository.findById(threadId, { workspaceId });
    if (!thread) throw new NotFoundError('Thread not found');

    await threadRepository.lock(threadId);

    emitToChannel(thread.channelId.toString(), SOCKET_EVENTS.THREAD_UPDATED, {
      threadId,
      updates: { isLocked: true },
      lockedBy: userId,
    }, thread.workspaceId?.toString());

    return threadRepository.findById(threadId, { workspaceId: thread.workspaceId?.toString() });
  }

  /**
   * Resolve a thread (mark discussion as complete).
   */
  async resolveThread(threadId, userId, workspaceId) {
    const thread = await threadRepository.findById(threadId, { workspaceId });
    if (!thread) throw new NotFoundError('Thread not found');

    await threadRepository.resolve(threadId, userId);

    emitToChannel(thread.channelId.toString(), SOCKET_EVENTS.THREAD_UPDATED, {
      threadId,
      updates: { isResolved: true },
      resolvedBy: userId,
    }, thread.workspaceId?.toString());

    return threadRepository.findById(threadId, { workspaceId: thread.workspaceId?.toString() });
  }

  /**
   * Update thread title.
   */
  async updateThreadTitle(threadId, title, userId, workspaceId) {
    const thread = await threadRepository.findById(threadId, { workspaceId });
    if (!thread) throw new NotFoundError('Thread not found');

    const sanitizedTitle = sanitizeHtml(title);
    await threadRepository.updateTitle(threadId, sanitizedTitle);

    emitToChannel(thread.channelId.toString(), SOCKET_EVENTS.THREAD_UPDATED, {
      threadId,
      updates: { title: sanitizedTitle },
      updatedBy: userId,
    }, thread.workspaceId?.toString());

    return threadRepository.findById(threadId, { workspaceId: thread.workspaceId?.toString() });
  }
}

export default new ThreadService();