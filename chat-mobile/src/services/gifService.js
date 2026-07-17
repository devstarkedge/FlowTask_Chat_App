import { gifsAPI } from './api';
import logger from '../utils/logger';

export const GIF_CATEGORIES = [
  { id: 'trending', label: 'Trending' },
  { id: 'reactions', label: 'Reactions' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'sports', label: 'Sports' },
  { id: 'stickers', label: 'Stickers' },
  { id: 'emotions', label: 'Emotions' }
];

export const searchGifs = async (query, offset = 0, limit = 20) => {
  try {
    const { data } = await gifsAPI.search(query, offset, limit);
    return {
      gifs: data.data?.data || [],
      hasMore: (data.data?.pagination?.count || 0) > 0
    };
  } catch (error) {
    logger.error('[gifService] searchGifs error:', error);
    throw error;
  }
};

export const fetchTrending = async (offset = 0, limit = 20) => {
  try {
    const { data } = await gifsAPI.getTrending(offset, limit);
    return {
      gifs: data.data?.data || [],
      hasMore: (data.data?.pagination?.count || 0) > 0
    };
  } catch (error) {
    logger.error('[gifService] fetchTrending error:', error);
    throw error;
  }
};

export const fetchByCategory = async (category, offset = 0, limit = 20) => {
  // Our backend doesn't currently filter by category cleanly without search query,
  // so we'll just map category to a search query.
  return searchGifs(category, offset, limit);
};
