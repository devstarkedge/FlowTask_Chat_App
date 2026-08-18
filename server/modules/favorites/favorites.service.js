import favoritesRepository from './favorites.repository.js';
import ChannelPin from '../channels/ChannelPin.model.js';
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

    // Keep the legacy ChannelPin star flag in sync so the mobile app (which
    // reads isStarred from the channel list) reflects favorites-driven stars.
    await this._syncChannelStarFromFavorite(userId, workspaceId, targetType, targetId, true);

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

    // Keep the legacy ChannelPin star flag in sync for channel-type favorites.
    await this._syncChannelStarFromFavorite(
      userId,
      workspaceId,
      favorite.targetType,
      favorite.targetId,
      false,
    );

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

    // Keep the legacy ChannelPin star flag in sync for channel-type favorites.
    await this._syncChannelStarFromFavorite(userId, workspaceId, targetType, targetId, false);

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

    // Keep the legacy ChannelPin star flag in sync for channel-type favorites.
    await this._syncChannelStarFromFavorite(
      userId,
      workspaceId,
      targetType,
      targetId,
      result.favorited,
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

  /**
   * Sync a channel's starred state into the favorites collection (idempotent).
   *
   * Called by the legacy `/channels/:id/star` endpoint so that mobile (which
   * writes ChannelPin) also updates UserFavorite and emits the favorite socket
   * events that the web app listens to — keeping both platforms in sync.
   */
  async syncChannelFavorite(userId, workspaceId, channelId, targetType, isStarred) {
    const channelIdStr = channelId?.toString ? channelId.toString() : channelId;

    if (isStarred) {
      const favorite = await favoritesRepository.addFavorite(
        userId,
        workspaceId,
        targetType,
        channelId,
      );
      emitToUser(
        userId.toString(),
        FAVORITE_ADDED_EVENT,
        { favorite },
        workspaceId?.toString(),
      );
      return { isStarred: true, favorite };
    }

    const removed = await favoritesRepository.removeFavoriteByTarget(
      userId,
      workspaceId,
      targetType,
      channelId,
    );
    if (removed) {
      emitToUser(
        userId.toString(),
        FAVORITE_REMOVED_EVENT,
        { targetType, targetId: channelIdStr },
        workspaceId?.toString(),
      );
    }
    return { isStarred: false, removed };
  }

  /**
   * Channel-type favorite target types (everything backed by a Channel doc).
   */
  _isChannelFavoriteType(targetType) {
    return ['channel', 'private_channel', 'project', 'dm'].includes(targetType);
  }

  /**
   * Keep the legacy ChannelPin star flag aligned with the favorites system and
   * emit `channel:updated` so clients that derive star state from isStarred
   * (mobile sidebar/channel list) update in real time.
   */
  async _syncChannelStarFromFavorite(userId, workspaceId, targetType, targetId, isStarred) {
    if (!this._isChannelFavoriteType(targetType) || !targetId) return;

    try {
      await ChannelPin.setStarred(userId, targetId, workspaceId, isStarred);
      emitToUser(
        userId.toString(),
        SOCKET_EVENTS.CHANNEL_UPDATED,
        {
          channelId: targetId.toString ? targetId.toString() : targetId,
          updates: { isStarred: !!isStarred },
        },
        workspaceId?.toString(),
      );
    } catch (err) {
      logger.warn('[Favorites] Failed to sync ChannelPin star state:', err?.message || err);
    }
  }
}

export default new FavoritesService();