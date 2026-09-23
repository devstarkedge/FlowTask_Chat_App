/**
 * extractPlainText – Centralized HTML-to-plain-text extraction.
 *
 * Uses the browser's built-in DOMParser to safely parse HTML,
 * then walks the DOM tree to produce a clean plain-text representation.
 *
 * Features:
 *  - Strips all HTML tags, attributes, inline styles
 *  - Replaces <a> tags with their visible text (the URL is NOT appended)
 *  - Preserves paragraph / list / heading structure with newlines
 *  - Collapses multiple consecutive blank lines into one
 *  - Returns an empty string for falsy or non-string input
 *
 * NOT a regex-based solution – uses proper DOM traversal.
 */

let parser = null

/**
 * Extract plain, readable text from an HTML string.
 *
 * @param {string} html - Raw HTML content to extract text from
 * @returns {string} Clean plain text with preserved formatting
 */
export function extractPlainText(html) {
  if (!html || typeof html !== 'string') return ''

  try {
    if (!parser) {
      parser = new DOMParser()
    }

    const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
    const body = doc.body

    // Walk all child nodes and build text
    const parts = []
    walkNodes(body, parts)

    let result = parts.join('')

    // Normalise whitespace: collapse multiple spaces to one
    result = result.replace(/[ \t]+/g, ' ')

    // Collapse more than 2 consecutive newlines into 2 (one blank line)
    result = result.replace(/\n{3,}/g, '\n\n')

    // Trim leading/trailing newlines and spaces
    result = result.trim()

    return result
  } catch {
    // Failsafe: strip all HTML tags as last resort
    return html.replace(/<[^>]*>/g, '').trim()
  }
}

/**
 * Recursively walk DOM nodes and append plain-text fragments to `parts`.
 *
 * Block-level elements get a trailing newline.
 * <br> elements get a single newline.
 * Anchor tags output only their text content (not the href).
 */
function walkNodes(node, parts) {
  const BLOCK_TAGS = new Set([
    'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'li', 'blockquote', 'pre',
  ])

  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent || '')
      continue
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue

    const tag = child.tagName.toLowerCase()

    // <br> → newline
    if (tag === 'br') {
      parts.push('\n')
      continue
    }

    // <ul> / <ol> – recurse into children. A blank line before & after the list
    // looks nicer, but we add it via the wrapping <li> handling.
    if (tag === 'ul' || tag === 'ol') {
      // If the previous content doesn't already end with a newline, add one
      if (lastChar(parts) !== '\n') parts.push('\n')
      walkNodes(child, parts)
      if (lastChar(parts) !== '\n') parts.push('\n')
      continue
    }

    // <li> – bullet + newline after
    if (tag === 'li') {
      // Prefix with "• " if the list item doesn't start with a marker already
      const text = child.textContent || ''
      if (!text.startsWith('• ') && !text.startsWith('- ')) {
        parts.push('• ')
      }
      walkNodes(child, parts)
      parts.push('\n')
      continue
    }

    // <a> – output only the visible text, NOT the href
    if (tag === 'a') {
      parts.push(child.textContent || '')
      continue
    }

    // Block-level elements: recurse, then add a newline at the end
    if (BLOCK_TAGS.has(tag)) {
      // If the previous content doesn't already end with a newline, add one
      // to separate from the preceding block
      if (lastChar(parts) !== '\n') parts.push('\n')
      walkNodes(child, parts)
      if (lastChar(parts) !== '\n') parts.push('\n')
      continue
    }

    // All other inline elements (strong, em, u, s, code, span, etc.)
    // – just recurse without adding any markers
    walkNodes(child, parts)
  }
}

/**
 * Get the last character of the accumulated output, ignoring leading whitespace
 * of the last segment.
 */
function lastChar(parts) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (typeof p === 'string' && p.length > 0) {
      return p[p.length - 1]
    }
  }
  return ''
}