import { PAGINATION } from '../config/constants.js';

/**
 * Pagination utilities.
 * Supports both cursor-based (for real-time message feeds) and offset-based (for admin lists).
 */

/**
 * Parse pagination parameters from query string.
 * @param {object} query - Express req.query
 * @returns {{ limit: number, cursor: string|null, page: number, skip: number }}
 */
export function parsePagination(query = {}) {
  const limit = Math.min(
    Math.max(parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT, 1),
    PAGINATION.MAX_LIMIT,
  );

  const cursor = query.cursor || null;
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;

  return { limit, cursor, page, skip };
}

/**
 * Build a cursor-based query filter for messages.
 * Messages are ordered by createdAt descending (newest first).
 *
 * @param {string|null} cursor - The _id of the last seen message (for loading older messages)
 * @param {'before'|'after'} [direction='before'] - Load messages before or after cursor
 * @returns {object} Mongoose query filter
 */
export function buildCursorFilter(cursor, direction = 'before') {
  if (!cursor) return {};

  // MongoDB ObjectIds are time-sortable, so _id comparison works for ordering
  return direction === 'before'
    ? { _id: { $lt: cursor } }
    : { _id: { $gt: cursor } };
}

/**
 * Format a paginated response with cursor metadata.
 * @param {Array} items - Query results
 * @param {number} limit - Page size
 * @param {string} [sortField='_id'] - Field used for cursor sorting
 * @param {object|null} [parentMessage=null] - Optional parent/root message to include
 * @returns {{ items: Array, hasMore: boolean, nextCursor: string|null, parentMessage?: object|null }}
 */
export function cursorPaginationResponse(items, limit, sortField = '_id', parentMessage = null) {
  const hasMore = items.length === limit;
  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1]._id.toString()
    : null;

  const result = { items, hasMore, nextCursor };

  // Include parentMessage if provided (used by thread replies API)
  if (parentMessage !== null) {
    result.parentMessage = parentMessage;
  }

  return result;
}

/**
 * Format an offset-based paginated response.
 * @param {Array} items
 * @param {number} total
 * @param {number} page
 * @param {number} limit
 * @returns {{ items: Array, total: number, page: number, totalPages: number, hasMore: boolean }}
 */
export function offsetPaginationResponse(items, total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  return {
    items,
    total,
    page,
    totalPages,
    hasMore: page < totalPages,
  };
}
