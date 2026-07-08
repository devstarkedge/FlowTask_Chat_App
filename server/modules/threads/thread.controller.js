import threadService from './thread.service.js';
import Thread from './Thread.model.js';
import asyncHandler from '../../middleware/asyncHandler.js';

/**
 * Thread Controller — REST endpoints for threads.
 */

/**
 * POST /api/chat/threads
 * Create a thread from a root message.
 */
export const createThread = asyncHandler(async (req, res) => {
  const { channelId, rootMessageId, title, flowTaskRef } = req.body;

  if (!channelId || !rootMessageId) {
    return res.status(400).json({
      success: false,
      error: { message: 'channelId and rootMessageId are required' },
    });
  }

  const thread = await threadService.createThread({
    channelId,
    rootMessageId,
    authorId: req.user._id,
    title,
    flowTaskRef,
    workspaceId: req.workspaceId,
  });

  res.status(201).json({ success: true, data: { thread } });
});

/**
 * GET /api/chat/threads/:id
 * Get a single thread.
 */
export const getThread = asyncHandler(async (req, res) => {
  const thread = await threadService.getThreadById(req.params.id, req.workspaceId);
  res.json({ success: true, data: { thread } });
});

/**
 * GET /api/chat/threads/:id/replies
 * Get replies in a thread.
 */
export const getThreadReplies = asyncHandler(async (req, res) => {
  const result = await threadService.getThreadReplies(req.params.id, req.query, req.workspaceId);
  res.json({ success: true, data: result });
});

/**
 * GET /api/chat/threads/task/:taskId
 * Get thread by FlowTask task ID.
 */
export const getThreadByTask = asyncHandler(async (req, res) => {
  const thread = await threadService.getThreadByTaskId(req.params.taskId, req.workspaceId);
  res.json({ success: true, data: { thread } });
});

/**
 * GET /api/chat/channels/:channelId/threads
 * Get all threads for a channel.
 */
export const getChannelThreads = asyncHandler(async (req, res) => {
  const threads = await threadService.getChannelThreads(
    req.params.channelId,
    req.query,
    req.workspaceId,
  );
  res.json({ success: true, data: { threads } });
});

/**
 * GET /api/chat/threads/my
 * Get threads the authenticated user participates in.
 */
export const getMyThreads = asyncHandler(async (req, res) => {
  const threads = await threadService.getUserThreads(req.user._id, req.query, req.workspaceId);
  res.json({ success: true, data: { threads } });
});

/**
 * POST /api/chat/threads/:id/lock
 * Lock a thread.
 */
export const lockThread = asyncHandler(async (req, res) => {
  const thread = await threadService.lockThread(req.params.id, req.user._id, req.workspaceId);
  res.json({ success: true, data: { thread } });
});

/**
 * POST /api/chat/threads/:id/resolve
 * Resolve a thread.
 */
export const resolveThread = asyncHandler(async (req, res) => {
  const thread = await threadService.resolveThread(req.params.id, req.user._id, req.workspaceId);
  res.json({ success: true, data: { thread } });
});

/**
 * PUT /api/chat/threads/:id/title
 * Update thread title.
 */
export const updateThreadTitle = asyncHandler(async (req, res) => {
  if (!req.body.title) {
    return res.status(400).json({
      success: false,
      error: { message: 'title is required' },
    });
  }

  const thread = await threadService.updateThreadTitle(
    req.params.id,
    req.body.title,
    req.user._id,
    req.workspaceId,
  );
  res.json({ success: true, data: { thread } });
});

/**
 * @desc    Mute a thread (disable reply notifications)
 * @route   POST /api/chat/threads/:id/mute
 * @access  Private
 */
export const muteThread = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  
  const thread = await Thread.findOneAndUpdate(
    { _id: id, workspaceId: req.workspaceId },
    { $addToSet: { mutedBy: userId } },
    { new: true }
  );
  
  if (!thread) throw new Error('Thread not found');

  res.json({ success: true, message: 'Thread muted', data: thread });
});

/**
 * @desc    Unmute a thread (enable reply notifications)
 * @route   POST /api/chat/threads/:id/unmute
 * @access  Private
 */
export const unmuteThread = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  
  const thread = await Thread.findOneAndUpdate(
    { _id: id, workspaceId: req.workspaceId },
    { $pull: { mutedBy: userId } },
    { new: true }
  );
  
  if (!thread) throw new Error('Thread not found');

  res.json({ success: true, message: 'Thread unmuted', data: thread });
});
