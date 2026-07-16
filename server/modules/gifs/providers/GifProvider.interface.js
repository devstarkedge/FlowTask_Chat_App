/**
 * GifProvider Interface
 * Base class for all GIF providers 
 * Ensures a consistent API for searching and fetching GIFs.
 */
export class GifProvider {
  /**
   * Search for GIFs based on a query.
   * @param {string} query - The search term.
   * @param {number} offset - Pagination offset.
   * @param {number} limit - Number of results to return.
   * @returns {Promise<{ data: Array, pagination: Object }>}
   */
  async search(query, offset = 0, limit = 20) {
    throw new Error('Method "search" must be implemented.');
  }

  /**
   * Fetch trending GIFs.
   * @param {number} offset - Pagination offset.
   * @param {number} limit - Number of results to return.
   * @returns {Promise<{ data: Array, pagination: Object }>}
   */
  async getTrending(offset = 0, limit = 20) {
    throw new Error('Method "getTrending" must be implemented.');
  }

  /**
   * Fetch predefined categories or tags for GIFs.
   * @returns {Promise<{ data: Array }>}
   */
  async getCategories() {
    throw new Error('Method "getCategories" must be implemented.');
  }
}
