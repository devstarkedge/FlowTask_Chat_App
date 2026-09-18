import asyncHandler from '../../middleware/asyncHandler.js';

/**
 * POST /api/chat/drafts/save
 * Save or update a draft (Drafts are stored in client local storage).
 */
export const saveDraft = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { draft: null, storedLocally: true } });
});

/**
 * GET /api/chat/drafts/:channelId
 * Get draft for a specific conversation.
 */
export const getDraft = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { draft: null } });
});

/**
 * GET /api/chat/drafts/all
 * Get all drafts for sidebar.
 */
export const getAllDrafts = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { drafts: [], total: 0 } });
});

/**
 * DELETE /api/chat/drafts/:id
 * Delete a specific draft.
 */
export const deleteDraft = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { draft: null } });
});

/**
 * GET /api/chat/drafts/count
 * Get draft count for badge.
 */
export const getDraftCount = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { count: 0 } });
});

/**
 * POST /api/chat/drafts/:id/send
 * Atomically send a draft as a message.
 */
export const sendDraftNow = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { message: null } });
});
