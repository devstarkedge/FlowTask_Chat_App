import { create } from 'zustand';
import { favoritesAPI } from '../services/api';
import logger from '../utils/logger';

export const useStarredStore = create((set, get) => ({
  favorites: [],
  isLoading: false,

  fetchFavorites: async () => {
    set({ isLoading: true });
    try {
      const { data } = await favoritesAPI.list();
      set({ favorites: data.data?.favorites || [], isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      logger.error('Failed to fetch favorites:', error);
    }
  },

  addFavorite: async (targetType, targetId) => {
    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const newFav = { _id: tempId, targetType, targetId, createdAt: new Date().toISOString() };
    set((state) => ({ favorites: [newFav, ...state.favorites] }));

    try {
      const { data } = await favoritesAPI.add(targetType, targetId);
      // Replace temp favorite with real one
      set((state) => ({
        favorites: state.favorites.map((f) => (f._id === tempId ? data.data.favorite : f)),
      }));
      return data.data.favorite;
    } catch (error) {
      // Revert on failure
      set((state) => ({ favorites: state.favorites.filter((f) => f._id !== tempId) }));
      logger.error('Failed to add favorite:', error);
      throw error;
    }
  },

  removeFavorite: async (favoriteId) => {
    // Optimistic update
    const previousFavorites = get().favorites;
    set((state) => ({ favorites: state.favorites.filter((f) => f._id !== favoriteId) }));

    try {
      await favoritesAPI.remove(favoriteId);
    } catch (error) {
      // Revert on failure
      set({ favorites: previousFavorites });
      logger.error('Failed to remove favorite:', error);
      throw error;
    }
  },

  toggleFavorite: async (targetType, targetId) => {
    const existingIndex = get().favorites.findIndex(
      (f) => f.targetType === targetType && (f.targetId?._id || f.targetId) === targetId
    );

    if (existingIndex >= 0) {
      // Currently favorited — remove it
      const favoriteId = get().favorites[existingIndex]._id;
      return get().removeFavorite(favoriteId);
    }

    // Not favorited — add it
    return get().addFavorite(targetType, targetId);
  },

  isFavorited: (targetType, targetId) => {
    return get().favorites.some(
      (f) => f.targetType === targetType && (f.targetId?._id || f.targetId) === targetId
    );
  },

  getFavoriteId: (targetType, targetId) => {
    const fav = get().favorites.find(
      (f) => f.targetType === targetType && (f.targetId?._id || f.targetId) === targetId
    );
    return fav?._id || null;
  },

  // Handle real-time updates from socket events
  handleFavoriteAdded: (favorite) => {
    set((state) => {
      // Avoid duplicates
      if (state.favorites.some((f) => f._id === favorite._id)) return state;
      return { favorites: [favorite, ...state.favorites] };
    });
  },

  handleFavoriteRemoved: (favoriteId, targetType, targetId) => {
    set((state) => ({
      favorites: state.favorites.filter(
        (f) => f._id !== favoriteId && !(f.targetType === targetType && (f.targetId?._id || f.targetId) === targetId)
      ),
    }));
  },
}));
