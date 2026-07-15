import axios from 'axios';
import { GifProvider } from './GifProvider.interface.js';

/**
 * KlipyProvider integrates with the Klipy Media API.
 * Klipy has emerged as the premier B2B GIF provider following Tenor's shutdown.
 * https://klipy.com/developers
 */
export class KlipyProvider extends GifProvider {
  constructor() {
    super();
    // Use the provided API key or a fallback development key if necessary
    this.apiKey = process.env.KLIPY_API_KEY || 'development_key';
    this.baseUrl = 'https://api.klipy.co/v1'; // Standard Klipy API base url
  }

  /**
   * Klipy's response schema generally differs from Giphy.
   * This formatter standardizes the Klipy payload into the FlowTask gifMeta schema.
   * Note: We extract the direct GIF/WebP URL and a preview URL.
   */
  _formatResponse(klipyData) {
    if (!klipyData) return [];

    return klipyData.map((item) => {
      // Klipy typically returns media arrays or direct object URLs
      // Adjust extraction logic based on exact Klipy response schema
      const originalUrl = item.media?.gif?.url || item.url || item.images?.original?.url;
      const previewUrl = item.media?.preview?.url || item.images?.preview?.url || originalUrl;

      // Force HTTPS to prevent Mixed Content errors on production servers
      const enforceHttps = (url) => url ? url.replace(/^http:\/\//i, 'https://') : url;

      return {
        id: item.id || item.slug,
        provider: 'klipy',
        providerId: item.id || item.slug,
        title: item.title || item.name || '',
        gifUrl: enforceHttps(originalUrl),
        previewUrl: enforceHttps(previewUrl),
        width: parseInt(item.width || item.media?.gif?.width || 0, 10),
        height: parseInt(item.height || item.media?.gif?.height || 0, 10),
      };
    });
  }

  async search(query, offset = 0, limit = 20) {
    if (!this.apiKey) {
      return { data: [], pagination: { total_count: 0, count: 0, offset } };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          api_key: this.apiKey,
          q: query,
          limit,
          offset,
        },
        headers: {
          'Accept': 'application/json'
        },
      });

      // Klipy pagination might use next_cursor or similar, mapping it back to generic pagination
      return {
        data: this._formatResponse(response.data.data || response.data.results),
        pagination: {
          offset,
          count: response.data.data?.length || response.data.results?.length || 0,
          total_count: response.data.total || 1000 // Mock total if not provided
        },
      };
    } catch (error) {
      console.error('KlipyProvider search error:', error.message);
      throw new Error('Failed to fetch GIFs from Klipy');
    }
  }

  async getTrending(offset = 0, limit = 20) {
    if (!this.apiKey) {
      return { data: [], pagination: { total_count: 0, count: 0, offset } };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/trending-gifs`, {
        params: {
          api_key: this.apiKey,
          limit,
          offset,
        },
        headers: {
          'Accept': 'application/json'
        },
      });

      return {
        data: this._formatResponse(response.data.data || response.data.results),
        pagination: {
          offset,
          count: response.data.data?.length || response.data.results?.length || 0,
          total_count: response.data.total || 1000
        },
      };
    } catch (error) {
      console.error('KlipyProvider getTrending error:', error.message);
      throw new Error('Failed to fetch trending GIFs from Klipy');
    }
  }

  async getCategories() {
    if (!this.apiKey) {
      return { data: [] };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/categories`, {
        params: {
          api_key: this.apiKey,
        },
        headers: {
          'Accept': 'application/json'
        },
      });

      const rawCategories = response.data.data || response.data.results || [];
      const enforceHttps = (url) => url ? url.replace(/^http:\/\//i, 'https://') : url;

      const categories = rawCategories.map(cat => ({
        id: cat.id || cat.slug || cat.name,
        label: cat.name || cat.title,
        gifUrl: enforceHttps(cat.cover_url || cat.icon_url || null),
      }));

      return { data: categories };
    } catch (error) {
      console.error('KlipyProvider getCategories error:', error.message);
      throw new Error('Failed to fetch GIF categories from Klipy');
    }
  }
}
