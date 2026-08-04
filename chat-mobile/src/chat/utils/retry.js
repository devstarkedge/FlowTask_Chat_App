import logger from '../../utils/logger';

/**
 * Intelligent retry helper with exponential backoff and jitter.
 * @param {Function} fn - Async function to run
 * @param {number} retries - Max retry attempts
 * @param {number} delay - Base delay in ms
 * @returns {Promise<any>} Resolves if successful
 */
export const retryWithBackoff = async (fn, retries = 5, delay = 1000) => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= retries) {
        throw error;
      }
      // Check if it's a permanent error (e.g. 4xx client errors)
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        throw error;
      }
      
      const jitter = Math.random() * 200;
      const backoffDelay = delay * Math.pow(2, attempt) + jitter;
      logger.warn(`[Retry] Attempt ${attempt} failed. Retrying in ${Math.round(backoffDelay)}ms... Error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
};
