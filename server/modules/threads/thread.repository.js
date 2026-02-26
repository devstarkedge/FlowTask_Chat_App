import Thread from './Thread.model.js';

/**
 * Thread Repository — data access layer for Thread documents.
 */

class ThreadRepository {
  /**
   * Create a new thread.
   * @param {object} data
   * @returns {Promise<Thread>}
   */
  async create(data) {
    const thread = new Thread(data);
    return thread.save();
  }

  /**
   * Find thread by ID.
   * @param {string} id
   * @param {object} [options]
   * @param {boolean} [options.populate=false]
   * @returns {Promise<Thread|null>}
   */
  async findById(id, { populate = false } = {}) {
    let query = Thread.findById(id);
    if (populate) {
      query.populate('participantIds', 'name email avatar flowTaskUserId');
      query.populate('rootMessageId');
    }
    
    let thread = await query.exec();
    
    // Fallback: If not found by _id, check if it's actually a rootMessageId
    // This supports the frontend passing the message ID to open a thread
    if (!thread) {
      query = Thread.findOne({ rootMessageId: id });
      if (populate) {
        query.populate('participantIds', 'name email avatar flowTaskUserId');
        query.populate('rootMessageId');
      }
      thread = await query.exec();
    }
    
    return thread;
  }

  /**
   * Find thread by FlowTask task ID (idempotent lookup).
   * @param {string} taskId
   * @returns {Promise<Thread|null>}
   */
  async findByTaskId(taskId) {
    return Thread.findByTaskId(taskId);
  }

  /**
   * Find or create a thread for a FlowTask task.
   * Uses atomic findOneAndUpdate with upsert to prevent race conditions
   * when multiple events for the same task arrive simultaneously.
   *
   * @param {object} params
   * @param {string} params.channelId
   * @param {string} params.rootMessageId
   * @param {string} params.taskId
   * @param {string} params.projectId
   * @param {string} [params.title]
   * @returns {Promise<{thread: Thread, created: boolean}>}
   */
  async findOrCreateForTask({ channelId, rootMessageId, taskId, projectId, title = '' }) {
    const existing = await Thread.findByTaskId(taskId);
    if (existing) {
      return { thread: existing, created: false };
    }

    const thread = await this.create({
      channelId,
      rootMessageId,
      flowTaskRef: { taskId, projectId },
      title,
    });

    return { thread, created: true };
  }

  /**
   * Get threads for a channel, sorted by latest activity.
   * @param {string} channelId
   * @param {object} options
   * @param {number} [options.limit=20]
   * @param {number} [options.skip=0]
   * @returns {Promise<Thread[]>}
   */
  async getChannelThreads(channelId, { limit = 20, skip = 0 } = {}) {
    return Thread.find({ channelId })
      .sort({ lastReplyAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('rootMessageId')
      .populate('lastReplyBy', 'name avatar')
      .lean();
  }

  /**
   * Update thread counters on new reply.
   * @param {string} threadId
   * @param {string} replyAuthorId - ChatUser _id
   * @returns {Promise<Thread|null>}
   */
  async onReply(threadId, replyAuthorId) {
    const thread = await Thread.findById(threadId);
    if (!thread) return null;

    thread.replyCount += 1;
    thread.lastReplyAt = new Date();
    thread.lastReplyBy = replyAuthorId;
    thread.addParticipant(replyAuthorId);

    return thread.save();
  }

  /**
   * Lock a thread (prevent new replies).
   * @param {string} threadId
   * @param {string} [reason]
   * @returns {Promise<Thread|null>}
   */
  async lock(threadId, reason = 'Task deleted') {
    const thread = await Thread.findById(threadId);
    if (!thread) return null;
    thread.lock(reason);
    return thread.save();
  }

  /**
   * Resolve a thread.
   * @param {string} threadId
   * @param {string} resolvedBy - ChatUser _id
   * @returns {Promise<Thread|null>}
   */
  async resolve(threadId, resolvedBy) {
    const thread = await Thread.findById(threadId);
    if (!thread) return null;
    thread.resolve(resolvedBy);
    return thread.save();
  }

  /**
   * Update thread title.
   * @param {string} threadId
   * @param {string} title
   * @returns {Promise<Thread|null>}
   */
  async updateTitle(threadId, title) {
    return Thread.findByIdAndUpdate(
      threadId,
      { title },
      { new: true },
    ).exec();
  }

  /**
   * Get user's threads across all channels.
   * @param {string} userId - ChatUser _id
   * @param {number} [limit=20]
   * @returns {Promise<Thread[]>}
   */
  async getUserThreads(userId, limit = 20) {
    return Thread.find({ participantIds: userId })
      .sort({ lastReplyAt: -1 })
      .limit(limit)
      .populate('channelId', 'name slug type')
      .populate('rootMessageId')
      .lean();
  }
}

export default new ThreadRepository();
