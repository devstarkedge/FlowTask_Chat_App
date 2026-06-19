import favoritesRepository from './favorites.repository.js';
import {
  emitToUser,
  emitToWorkspace,
} from '../../sockets/socketManager.js';
import {
  SOCKET_EVENTS,
} from '../../config/constants.js';

// Resolve favorite socket event names, falling back to generic channel events
// if the dedicated favorite events are not yet defined in constants.js.
const FAVORITE_ADDED_EVENT =
  SOCKET_EVENTS.FAVORITE_ADDED || SOCKET_EVENTS.CHANNEL_UPDATED;
const FAVORITE_REMOVED_EVENT =
  SOCKET_EVENTS.FAVORITE_REMOVED || SOCKET_EVENTS.CHANNEL_UPDATED;
import logger from '../../utils/logger.js';
import {
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';

class FavoritesService {
  /**
   * Get all favorites for the current user in a workspace.
   */
  async getFavorites(userId, workspaceId) {
    const favorites = await favoritesRepository.findByUserAndWorkspace(
      userId,
      workspaceId,
    );
    return favorites;
  }

  /**
   * Add a favorite for the current user.
   */
  async addFavorite(userId, workspaceId, targetType, targetId) {
    if (!targetType || !targetId) {
      throw new ValidationError('targetType and targetId are required');
    }

    const validTypes = ['channel', 'private_channel', 'directory', 'project', 'dm'];
    if (!validTypes.includes(targetType)) {
      throw new ValidationError(`Invalid targetType: ${targetType}`);
    }

    const favorite = await favoritesRepository.addFavorite(
      userId,
      workspaceId,
      targetType,
      targetId,
    );

    // Notify the user so other tabs/devices update
    emitToUser(
      userId.toString(),
      FAVORITE_ADDED_EVENT,
      {
        favorite,
      },
      workspaceId?.toString(),
    );

    logger.info('Favorite added', {
      userId,
      workspaceId,
      targetType,
      targetId,
      favoriteId: favorite._id,
    });

    return favorite;
  }

  /**
   * Remove a favorite by its _id.
   */
  async removeFavorite(userId, workspaceId, favoriteId) {
    const favorite = await favoritesRepository.removeFavoriteById(favoriteId);
    if (!favorite) {
      throw new NotFoundError('Favorite not found');
    }

    // Notify the user so other tabs/devices update
    emitToUser(
      userId.toString(),
      FAVORITE_REMOVED_EVENT,
      {
        favoriteId: favorite._id,
        targetType: favorite.targetType,
        targetId: favorite.targetId,
      },
      workspaceId?.toString(),
    );

    logger.info('Favorite removed', {
      userId,
      workspaceId,
      favoriteId,
    });

    return { success: true };
  }

  /**
   * Remove a favorite by target identifiers.
   */
  async removeFavoriteByTarget(userId, workspaceId, targetType, targetId) {
    const deleted = await favoritesRepository.removeFavoriteByTarget(
      userId,
      workspaceId,
      targetType,
      targetId,
    );

    if (!deleted) {
      throw new NotFoundError('Favorite not found');
    }

    // Notify the user so other tabs/devices update
    emitToUser(
      userId.toString(),
      FAVORITE_REMOVED_EVENT,
      {
        targetType,
        targetId,
      },
      workspaceId?.toString(),
    );

    logger.info('Favorite removed by target', {
      userId,
      workspaceId,
      targetType,
      targetId,
    });

    return { success: true };
  }

  /**
   * Toggle favorite. Returns { favorited: boolean, favorite: object|null }.
   */
  async toggleFavorite(userId, workspaceId, targetType, targetId) {
    if (!targetType || !targetId) {
      throw new ValidationError('targetType and targetId are required');
    }

    const result = await favoritesRepository.toggleFavorite(
      userId,
      workspaceId,
      targetType,
      targetId,
    );

    // Notify the user so other tabs/devices update
    emitToUser(
      userId.toString(),
      result.favorited ? FAVORITE_ADDED_EVENT : FAVORITE_REMOVED_EVENT,
      {
        targetType,
        targetId,
        favorite: result.favorite,
      },
      workspaceId?.toString(),
    );

    logger.info('Favorite toggled', {
      userId,
      workspaceId,
      targetType,
      targetId,
      favorited: result.favorited,
    });

    return result;
  }

  /**
   * Check if a target is favorited by the current user.
   */
  async checkFavorite(userId, workspaceId, targetType, targetId) {
    const isFav = await favoritesRepository.isFavorited(
      userId,
      workspaceId,
      targetType,
      targetId,
    );
    return { isFavorited: !!isFav };
  }
}

export default new FavoritesService();