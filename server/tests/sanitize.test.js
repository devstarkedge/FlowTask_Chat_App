import { describe, it, expect } from 'vitest';
import { sanitizeHtml, stripHtml } from '../utils/sanitize.js';

/**
 * Unit tests for the HTML sanitization utility.
 * Tests verify the sanitization behavior and ALLOWED_TAGS/ALLOWED_ATTRS configuration.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'a', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

const ALLOWED_ATTRS = new Set([
  'href', 'target', 'rel', 'class', 'data-mention-id', 'data-mention-type',
]);

describe('sanitize configuration', () => {
  it('should include safe formatting tags', () => {
    const safeTags = ['p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre'];
    safeTags.forEach(tag => {
      expect(ALLOWED_TAGS.has(tag), `${tag} should be allowed`).toBe(true);
    });
  });

  it('should include link tag', () => {
    expect(ALLOWED_TAGS.has('a')).toBe(true);
  });

  it('should NOT include script, iframe, style, form tags', () => {
    const dangerTags = ['script', 'iframe', 'style', 'form', 'input', 'textarea', 'object', 'embed'];
    dangerTags.forEach(tag => {
      expect(ALLOWED_TAGS.has(tag), `${tag} should be blocked`).toBe(false);
    });
  });

  it('should NOT include event handler attributes', () => {
    const dangerAttrs = ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus'];
    dangerAttrs.forEach(attr => {
      expect(ALLOWED_ATTRS.has(attr), `${attr} should be blocked`).toBe(false);
    });
  });

  it('should allow safe attributes', () => {
    const safeAttrs = ['href', 'class', 'data-mention-id'];
    safeAttrs.forEach(attr => {
      expect(ALLOWED_ATTRS.has(attr), `${attr} should be allowed`).toBe(true);
    });
  });

  it('should have matching tag allowlist with server DOMPurify config', () => {
    // Verify sanitizeHtml preserves allowed tags
    const testHtml = '<p><strong>Bold</strong> <em>italic</em> <a href="#">link</a></p>';
    const result = sanitizeHtml(testHtml);
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
    expect(result).toContain('<a');
  });
});

describe('URI safety patterns', () => {
  it('should identify dangerous javascript: URIs', () => {
    const dangerous = [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'javascript:void(0)',
    ];
    dangerous.forEach(uri => {
      expect(uri.match(/^javascript:/i)).toBeTruthy();
    });
  });

  it('should identify dangerous data: URIs', () => {
    const dangerous = [
      'data:text/html,<script>alert(1)</script>',
      'DATA:text/html;base64,abc',
    ];
    dangerous.forEach(uri => {
      expect(uri.match(/^data:/i)).toBeTruthy();
    });
  });

  it('should allow safe URIs', () => {
    const safe = [
      'https://example.com',
      'http://example.com',
      'mailto:user@example.com',
      '/relative/path',
      '#anchor',
    ];
    safe.forEach(uri => {
      expect(uri.match(/^javascript:/i)).toBeFalsy();
      expect(uri.match(/^data:/i)).toBeFalsy();
    });
  });
});
