import UserFavorite from './UserFavorite.model.js';

class FavoritesRepository {
  /**
   * Get all favorites for a user in a workspace.
   */
  async findByUserAndWorkspace(userId, workspaceId) {
    return UserFavorite.findByUserAndWorkspace(userId, workspaceId);
  }

  /**
   * Check if a target is favorited.
   */
  async isFavorited(userId, workspaceId, targetType, targetId) {
    return UserFavorite.isFavorited(userId, workspaceId, targetType, targetId);
  }

  /**
   * Add a favorite (idempotent).
   */
  async addFavorite(userId, workspaceId, targetType, targetId) {
    return UserFavorite.addFavorite({ userId, workspaceId, targetType, targetId });
  }

  /**
   * Remove favorite by _id.
   */
  async removeFavoriteById(favoriteId) {
    return UserFavorite.removeFavoriteById(favoriteId);
  }

  /**
   * Remove favorite by target identifiers.
   */
  async removeFavoriteByTarget(userId, workspaceId, targetType, targetId) {
    return UserFavorite.removeFavoriteByTarget(userId, workspaceId, targetType, targetId);
  }

  /**
   * Toggle favorite. Returns { favorited, favorite }.
   */
  async toggleFavorite(userId, workspaceId, targetType, targetId) {
    return UserFavorite.toggleFavorite(userId, workspaceId, targetType, targetId);
  }
}

export default new FavoritesRepository();