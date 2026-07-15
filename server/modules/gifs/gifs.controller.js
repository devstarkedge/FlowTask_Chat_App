import { gifsService } from './gifs.service.js';

export const gifsController = {
  /**
   * Search for GIFs
   * GET /api/gifs/search?q=query&offset=0&limit=20
   */
  async search(req, res) {
    try {
      const { q, offset = 0, limit = 20 } = req.query;
      
      if (!q) {
        return res.status(400).json({
          status: 'error',
          error: { message: 'Query parameter "q" is required' }
        });
      }

      if (!process.env.KLIPY_API_KEY) {
        console.warn('GIF search: KLIPY_API_KEY not set in environment');
        return res.status(503).json({
          status: 'error',
          error: { message: 'GIF service is not configured (missing API key)' }
        });
      }

      const results = await gifsService.search(q, offset, parseInt(limit, 10));
      console.info(`GIF search "${q}": returned ${results.data?.length ?? 0} items`);
      
      return res.status(200).json({
        status: 'success',
        data: results
      });
    } catch (error) {
      console.error('Error searching GIFs:', error);
      return res.status(500).json({
        status: 'error',
        error: { message: 'Failed to search GIFs' }
      });
    }
  },

  /**
   * Get trending GIFs
   * GET /api/gifs/trending?offset=0&limit=20
   */
  async getTrending(req, res) {
    try {
      const { offset = 0, limit = 20 } = req.query;

      if (!process.env.KLIPY_API_KEY) {
        console.warn('GIF trending: KLIPY_API_KEY not set in environment');
        return res.status(503).json({
          status: 'error',
          error: { message: 'GIF service is not configured (missing API key)' }
        });
      }
      
      const results = await gifsService.getTrending(offset, parseInt(limit, 10));
      console.info(`GIF trending: returned ${results.data?.length ?? 0} items`);
      
      return res.status(200).json({
        status: 'success',
        data: results
      });
    } catch (error) {
      console.error('Error fetching trending GIFs:', error);
      return res.status(500).json({
        status: 'error',
        error: { message: 'Failed to fetch trending GIFs' }
      });
    }
  },

  /**
   * Get GIF categories
   * GET /api/gifs/categories
   */
  async getCategories(req, res) {
    try {
      const results = await gifsService.getCategories();
      
      return res.status(200).json({
        status: 'success',
        data: results
      });
    } catch (error) {
      console.error('Error fetching GIF categories:', error);
      return res.status(500).json({
        status: 'error',
        error: { message: 'Failed to fetch GIF categories' }
      });
    }
  }
};
