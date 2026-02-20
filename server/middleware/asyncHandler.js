/**
 * Async handler wrapper.
 * Catches promise rejections in Express route handlers and forwards to error middleware.
 * Equivalent to FlowTask's backend/middleware/asyncHandler.js.
 *
 * @param {Function} fn - Async Express route handler
 * @returns {Function} Wrapped handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
