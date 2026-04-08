/**
 * Draft utilities — shared helpers for determining if draft content is empty.
 *
 * TipTap's empty editor produces `<p></p>` which passes simple truthy checks.
 * These helpers detect truly-empty content to prevent phantom drafts.
 */

const EMPTY_HTML_PATTERNS = [
  /^<p>\s*<\/p>$/,
  /^<p><br\s*\/?>\s*<\/p>$/,
  /^<br\s*\/?>$/,
  /^\s*$/,
]

/**
 * Strip all HTML tags and decode common HTML entities.
 * @param {string} html
 * @returns {string}
 */
export function stripHtmlTags(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/**
 * Determine if draft content is truly empty.
 * Handles TipTap empty-editor HTML (`<p></p>`, `<p><br></p>`) and whitespace-only text.
 *
 * @param {string} [html]  — HTML content from editor
 * @param {string} [text]  — plain text content from editor
 * @returns {boolean} true if content is empty / meaningless
 */
export function isContentEmpty(html, text) {
  const trimmedText = (text || '').trim()
  if (trimmedText) return false

  const trimmedHtml = (html || '').trim()
  if (!trimmedHtml) return true

  // Check known empty patterns
  for (const pattern of EMPTY_HTML_PATTERNS) {
    if (pattern.test(trimmedHtml)) return true
  }

  // Fallback: strip tags and check if anything meaningful remains
  const stripped = stripHtmlTags(trimmedHtml)
  return !stripped
}
