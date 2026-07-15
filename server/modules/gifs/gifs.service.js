import { GiphyProvider } from './providers/GiphyProvider.js';

class GifsService {
  constructor() {
    // We can swap this out easily if we want to change providers or use a config variable
    // e.g. process.env.GIF_PROVIDER === 'tenor' ? new TenorProvider() : new GiphyProvider()
    this.provider = new GiphyProvider();
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
