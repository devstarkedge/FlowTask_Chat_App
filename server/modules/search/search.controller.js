import asyncHandler from '../../middleware/asyncHandler.js';
import { globalSearch } from './search.service.js';

/**
 * GET /api/chat/search?q=...&scope=...&limit=...&cursor=...
 * Workspace-scoped global search across people, channels, messages, files,
 * links, and app destinations.
 */
export const searchAll = asyncHandler(async (req, res) => {
  const results = await globalSearch({
    query: req.query.q || '',
    scope: req.query.scope || null,
    limit: req.query.limit || null,
    cursor: req.query.cursor || null,
    userId: req.user._id,
    workspaceId: req.workspaceId,
  });

  res.json({
    success: true,
    data: results,
  });
});
