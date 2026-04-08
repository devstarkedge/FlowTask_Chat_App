import asyncHandler from '../../middleware/asyncHandler.js';
import draftService from './draft.service.js';

/**
 * POST /api/chat/drafts/save
 * Save or update a draft.
 */
export const saveDraft = asyncHandler(async (req, res) => {
  const { channelId, threadId, content, htmlContent, attachments, mentions } = req.body;

  if (!channelId) {
    return res.status(400).json({ success: false, error: { message: 'channelId is required' } });
  }

  const draft = await draftService.saveDraft({
    workspaceId: req.workspaceId,
    channelId,
    threadId: threadId || null,
    senderId: req.user._id,
    content,
    htmlContent,
    attachments,
    mentions,
  });

  // saveDraft returns null when content was empty (draft removed)
  if (!draft) {
    return res.json({ success: true, data: { draft: null, removed: true } });
  }

  res.json({ success: true, data: { draft } });
});

/**
 * GET /api/chat/drafts/:channelId
 * Get draft for a specific conversation.
 */
export const getDraft = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const threadId = req.query.threadId || null;

  const draft = await draftService.getDraft(
    req.user._id,
    channelId,
    threadId,
    req.workspaceId,
  );

  res.json({ success: true, data: { draft } });
});

/**
 * GET /api/chat/drafts/all
 * Get all drafts for sidebar.
 */
export const getAllDrafts = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
  const skip = Math.max(parseInt(req.query.skip) || 0, 0);

  const [drafts, count] = await Promise.all([
    draftService.getAllDrafts(req.user._id, req.workspaceId, { limit, skip }),
    draftService.countDrafts(req.user._id, req.workspaceId),
  ]);

  res.json({ success: true, data: { drafts, total: count } });
});

/**
 * DELETE /api/chat/drafts/:id
 * Delete a specific draft.
 */
export const deleteDraft = asyncHandler(async (req, res) => {
  const draft = await draftService.removeDraft(
    req.params.id,
    req.user._id,
    req.workspaceId,
  );

  if (!draft) {
    return res.status(404).json({ success: false, error: { message: 'Draft not found' } });
  }

  res.json({ success: true, data: { draft } });
});

/**
 * GET /api/chat/drafts/count
 * Get draft count for badge.
 */
export const getDraftCount = asyncHandler(async (req, res) => {
  const count = await draftService.countDrafts(req.user._id, req.workspaceId);
  res.json({ success: true, data: { count } });
});

/**
 * POST /api/chat/drafts/:id/send
 * Atomically send a draft as a message and delete the draft.
 */
export const sendDraftNow = asyncHandler(async (req, res) => {
  const result = await draftService.sendDraft(
    req.params.id,
    req.user._id,
    req.workspaceId,
  );

  if (!result) {
    return res.status(404).json({ success: false, error: { message: 'Draft not found' } });
  }

  res.json({ success: true, data: { message: result.message || result } });
});
