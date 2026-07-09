import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

/**
 * Server-side HTML sanitization for message content.
 * Strips XSS vectors while preserving safe formatting tags.
 */

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'blockquote', 'ul', 'ol', 'li', 'a', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'div', 'b', 'i', 'strike', 'del',
];

const ALLOWED_ATTRS = ['href', 'target', 'rel', 'class', 'data-mention-id', 'data-mention-type'];

/**
 * Sanitize HTML content for safe storage and rendering.
 * @param {string} html
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';

  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
  });
}

/**
 * Strip all HTML tags, returning plain text.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return purify.sanitize(html, { ALLOWED_TAGS: [] }).trim();
}

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated.
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(str, maxLength = 250) {
  if (!str || str.length <= maxLength) return str || '';
  return `${str.substring(0, maxLength - 1)}…`;
}

/**
 * Extract mention references from HTML content.
 * Expects <span data-mention-id="xxx" data-mention-type="user|role|team">@Name</span>
 * @param {string} html
 * @returns {Array<{type: string, targetId: string, name: string}>}
 */
export function extractMentions(html) {
  if (!html) return [];

  const mentions = [];
  const regex = /data-mention-id="([^"]+)"\s+data-mention-type="([^"]+)"[^>]*>@?([^<]+)</g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    mentions.push({
      targetId: match[1],
      type: match[2],
      name: match[3].trim(),
    });
  }

  return mentions;
}
