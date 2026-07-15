import axios from 'axios';
import { GifProvider } from './GifProvider.interface.js';

export class GiphyProvider extends GifProvider {
  constructor() {
    super();
    this.apiKey = process.env.GIPHY_API_KEY;
    this.baseUrl = 'https://api.giphy.com/v1/gifs';
  }

  _formatResponse(giphyData) {
    if (!giphyData) return [];
    
    return giphyData.map(gif => {
      const original = gif.images?.original;
      const preview = gif.images?.fixed_height_small || gif.images?.preview_gif || original;
      
      return {
        id: gif.id,
        provider: 'giphy',
        providerId: gif.id,
        title: gif.title,
        gifUrl: original?.url,
        previewUrl: preview?.url,
        width: parseInt(original?.width || 0, 10),
        height: parseInt(original?.height || 0, 10),
      };
    });
  }

  async search(query, offset = 0, limit = 20) {
    if (!this.apiKey) {
      console.warn('GIPHY_API_KEY not configured. Returning empty results.');
      return { data: [], pagination: { total_count: 0, count: 0, offset } };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          api_key: this.apiKey,
          q: query,
          limit,
          offset,
          rating: 'pg-13',
        },
      });

      return {
        data: this._formatResponse(response.data.data),
        pagination: response.data.pagination,
      };
    } catch (error) {
      console.error('GiphyProvider search error:', error.message);
      throw new Error('Failed to fetch GIFs from Giphy');
    }
  }

  async getTrending(offset = 0, limit = 20) {
    if (!this.apiKey) {
      return { data: [], pagination: { total_count: 0, count: 0, offset } };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/trending`, {
        params: {
          api_key: this.apiKey,
          limit,
          offset,
          rating: 'pg-13',
        },
      });

      return {
        data: this._formatResponse(response.data.data),
        pagination: response.data.pagination,
      };
    } catch (error) {
      console.error('GiphyProvider getTrending error:', error.message);
      throw new Error('Failed to fetch trending GIFs from Giphy');
    }
  }

  async getCategories() {
    // Note: Giphy has a categories endpoint at /categories, but it's often more practical to just return hardcoded standard categories for UI consistency, or fetch them if needed.
    // For this implementation, we will hit the Giphy categories API.
    if (!this.apiKey) {
      return { data: [] };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/categories`, {
        params: {
          api_key: this.apiKey,
        },
      });

      const categories = response.data.data.map(cat => ({
        id: cat.name_encoded,
        label: cat.name,
        gifUrl: cat.gif?.images?.original?.url,
      }));

      return { data: categories };
    } catch (error) {
      console.error('GiphyProvider getCategories error:', error.message);
      throw new Error('Failed to fetch GIF categories');
    }
  }
}
