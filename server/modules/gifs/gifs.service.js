import { GiphyProvider } from './providers/GiphyProvider.js';
import { KlipyProvider } from './providers/KlipyProvider.js';

class GifsService {
  constructor() {
    const activeProvider = process.env.ACTIVE_GIF_PROVIDER || 'klipy';
    
    switch (activeProvider.toLowerCase()) {
      case 'giphy':
        this.provider = new GiphyProvider();
        break;
      case 'klipy':
        this.provider = new KlipyProvider();
        break;
      default:
        console.warn(`Unsupported ACTIVE_GIF_PROVIDER: ${activeProvider}. Falling back to KlipyProvider.`);
        this.provider = new KlipyProvider();
    }
  }

  async search(query, offset, limit) {
    if (!query) throw new Error('Search query is required');
    return this.provider.search(query, offset, limit);
  }

  async getTrending(offset, limit) {
    return this.provider.getTrending(offset, limit);
  }

  async getCategories() {
    return this.provider.getCategories();
  }
}

export const gifsService = new GifsService();
