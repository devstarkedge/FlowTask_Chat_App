/**
 * Client-side HTML sanitization — defense-in-depth layer.
 *
 * The server already sanitizes via DOMPurify with the same allowlist,
 * but this ensures safety even if a message bypasses the API
 * (e.g., direct DB injection, compromised server response).
 *
 * Uses the browser's built-in DOMParser for zero-dependency sanitization.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'blockquote', 'ul', 'ol', 'li', 'a', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])

const ALLOWED_ATTRS = new Set([
  'href', 'target', 'rel', 'class',
  'data-mention-id', 'data-mention-type',
])

/**
 * Walk every node in the DOM tree and strip disallowed tags/attributes.
 */
function sanitizeNode(node) {
  const children = Array.from(node.childNodes)

  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase()

      if (!ALLOWED_TAGS.has(tag)) {
        // Replace disallowed tag with its text content
        const text = document.createTextNode(child.textContent || '')
        node.replaceChild(text, child)
        continue
      }

      // Strip disallowed attributes
      const attrs = Array.from(child.attributes)
      for (const attr of attrs) {
        if (!ALLOWED_ATTRS.has(attr.name)) {
          child.removeAttribute(attr.name)
        }
      }

      // Enforce safe link targets
      if (tag === 'a') {
        const href = child.getAttribute('href') || ''
        // Block javascript: and data: URIs
        if (/^(javascript|data|vbscript):/i.test(href.trim())) {
          child.removeAttribute('href')
          child.setAttribute('rel', 'noopener noreferrer')
        }
        child.setAttribute('target', '_blank')
        child.setAttribute('rel', 'noopener noreferrer')
      }

      // Recurse into children
      sanitizeNode(child)
    }
  }
}

// Cache parser instance
let parser = null

/**
 * Sanitize HTML string for safe rendering via dangerouslySetInnerHTML.
 * Returns sanitized HTML string. Returns empty string for falsy input.
 *
 * @param {string} html - Raw HTML content
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return ''

  try {
    if (!parser) {
      parser = new DOMParser()
    }

    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
    const wrapper = doc.body.firstChild

    if (!wrapper) return ''

    sanitizeNode(wrapper)
    return wrapper.innerHTML
  } catch {
    // If DOMParser fails, strip all HTML as last resort
    return html.replace(/<[^>]*>/g, '')
  }
}
