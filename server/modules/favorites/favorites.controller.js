import favoritesService from './favorites.service.js';
import asyncHandler from '../../middleware/asyncHandler.js';

/**
 * Favorites Controller — REST endpoints for user favorites.
 *
 * GET    /api/chat/favorites
 * POST   /api/chat/favorites
 * DELETE /api/chat/favorites/:id
 */

/**
 * GET /api/chat/favorites
 * Get all favorites for the current user in the current workspace.
 */
export const getFavorites = asyncHandler(async (req, res) => {
  const favorites = await favoritesService.getFavorites(
    req.user._id,
    req.workspaceId,
  );

  res.json({
    success: true,
    data: { favorites },
  });
});

/**
 * POST /api/chat/favorites
 * Add a favorite for the current user.
 * Body: { targetType, targetId }
 */
export const addFavorite = asyncHandler(async (req, res) => {
  const { targetType, targetId } = req.body;

  if (!targetType || !targetId) {
    return res.status(400).json({
      success: false,
      error: { message: 'targetType and targetId are required' },
    });
  }

  const favorite = await favoritesService.addFavorite(
    req.user._id,
    req.workspaceId,
    targetType,
    targetId,
  );

  res.status(201).json({
    success: true,
    data: { favorite },
  });
});

/**
 * DELETE /api/chat/favorites/:id
 * Remove a favorite by its _id.
 */
export const removeFavorite = asyncHandler(async (req, res) => {
  const result = await favoritesService.removeFavorite(
    req.user._id,
    req.workspaceId,
    req.params.id,
  );

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /api/chat/favorites/toggle
 * Toggle a favorite. Body: { targetType, targetId }
 */
export const toggleFavorite = asyncHandler(async (req, res) => {
  const { targetType, targetId } = req.body;

  if (!targetType || !targetId) {
    return res.status(400).json({
      success: false,
      error: { message: 'targetType and targetId are required' },
    });
  }

  const result = await favoritesService.toggleFavorite(
    req.user._id,
    req.workspaceId,
    targetType,
    targetId,
  );

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /api/chat/favorites/check
 * Check if a target is favorited.
 * Query: targetType, targetId
 */
export const checkFavorite = asyncHandler(async (req, res) => {
  const { targetType, targetId } = req.query;

  if (!targetType || !targetId) {
    return res.status(400).json({
      success: false,
      error: { message: 'targetType and targetId query params are required' },
    });
  }

  const result = await favoritesService.checkFavorite(
    req.user._id,
    req.workspaceId,
    targetType,
    targetId,
  );

  res.json({
    success: true,
    data: result,
  });
});