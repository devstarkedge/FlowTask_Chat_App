/**
 * RichText — Parses HTML content (from TipTap/ProseMirror) into React Native elements.
 *
 * Handles: paragraphs, bold, italic, underline, strikethrough, headings (h1-h6),
 * blockquotes, ordered/unordered lists (including nesting), inline code, code blocks,
 * links, mention tags, and line breaks.
 *
 * Props:
 *   html       – HTML string from the server (htmlContent)
 *   text       – fallback plain-text content
 *   colors     – theme colors object (from useThemeStore)
 *   baseStyle  – optional base Text style override
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';

// ─── Lightweight HTML Tokenizer ─────────────────────────────────────────────
// Produces a flat token array: [{ type: 'open'|'close'|'self'|'text', tag?, attrs?, text? }]
const SELF_CLOSING = new Set(['br', 'hr', 'img']);

function tokenize(html) {
  const tokens = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      // Check for comment
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        i = end === -1 ? html.length : end + 3;
        continue;
      }
      const closeIdx = html.indexOf('>', i);
      if (closeIdx === -1) { tokens.push({ type: 'text', text: html.slice(i) }); break; }
      const inner = html.slice(i + 1, closeIdx).trim();
      if (inner.startsWith('/')) {
        // closing tag
        const tag = inner.slice(1).split(/\s/)[0].toLowerCase();
        tokens.push({ type: 'close', tag });
      } else {
        // open or self-closing
        const spaceIdx = inner.search(/[\s/]/);
        const tag = (spaceIdx === -1 ? inner : inner.slice(0, spaceIdx)).toLowerCase();
        const attrStr = spaceIdx === -1 ? '' : inner.slice(spaceIdx);
        const attrs = parseAttrs(attrStr);
        const selfClose = SELF_CLOSING.has(tag) || inner.endsWith('/');
        tokens.push({ type: selfClose ? 'self' : 'open', tag, attrs });
      }
      i = closeIdx + 1;
    } else {
      const next = html.indexOf('<', i);
      const text = next === -1 ? html.slice(i) : html.slice(i, next);
      if (text) tokens.push({ type: 'text', text: decodeEntities(text) });
      i = next === -1 ? html.length : next;
    }
  }
  return tokens;
}

function parseAttrs(str) {
  const attrs = {};
  const re = /(\w[\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, '\u00A0');
}

// ─── Build AST from tokens ──────────────────────────────────────────────────
// Each node: { tag, attrs, children: [...], text? }
function buildAST(tokens) {
  const root = { tag: 'root', attrs: {}, children: [] };
  const stack = [root];
  for (const tok of tokens) {
    const parent = stack[stack.length - 1];
    if (tok.type === 'text') {
      parent.children.push({ tag: '#text', text: tok.text });
    } else if (tok.type === 'self') {
      parent.children.push({ tag: tok.tag, attrs: tok.attrs || {}, children: [] });
    } else if (tok.type === 'open') {
      const node = { tag: tok.tag, attrs: tok.attrs || {}, children: [] };
      parent.children.push(node);
      stack.push(node);
    } else if (tok.type === 'close') {
      // Walk back to find matching open tag
      for (let j = stack.length - 1; j > 0; j--) {
        if (stack[j].tag === tok.tag) { stack.length = j; break; }
      }
    }
  }
  return root;
}

// ─── Render AST to React Native elements ────────────────────────────────────
const HEADING_SIZES = { h1: 22, h2: 20, h3: 18, h4: 16, h5: 15, h6: 14 };

let keyCounter = 0;

function renderNode(node, colors, parentStyles = {}, depth = 0) {
  const key = `rt-${keyCounter++}`;

  if (node.tag === '#text') {
    return <Text key={key} style={parentStyles}>{node.text}</Text>;
  }

  if (node.tag === 'br') {
    return <Text key={key}>{'\n'}</Text>;
  }

  // Recursively render children as inline content (Text-compatible)
  const renderInlineChildren = (extraStyles = {}) => {
    const merged = { ...parentStyles, ...extraStyles };
    return node.children.map((c, i) => renderNode(c, colors, merged, depth));
  };

  // Render children that may contain block elements
  const renderBlockChildren = () => {
    return node.children.map((c, i) => renderNode(c, colors, parentStyles, depth));
  };

  switch (node.tag) {
    case 'p': {
      // Paragraph — wrap children in Text with margin
      return (
        <Text key={key} style={[styles.paragraph, parentStyles]}>
          {node.children.map((c, i) => renderNode(c, colors, parentStyles, depth))}
        </Text>
      );
    }

    case 'strong': case 'b':
      return renderInlineChildren({ fontWeight: '700' });

    case 'em': case 'i':
      return renderInlineChildren({ fontStyle: 'italic' });

    case 'u':
      return renderInlineChildren({ textDecorationLine: 'underline' });

    case 's': case 'del': case 'strike':
      return renderInlineChildren({ textDecorationLine: 'line-through' });

    case 'code': {
      // Inline code — if parent is <pre>, just pass through
      if (parentStyles._inCodeBlock) {
        return (
          <Text key={key} style={parentStyles}>
            {node.children.map((c, i) => renderNode(c, colors, parentStyles, depth))}
          </Text>
        );
      }
      return (
        <Text key={key} style={[
          parentStyles,
          {
            fontFamily: 'monospace',
            fontSize: (parentStyles.fontSize || 15) * 0.875,
            backgroundColor: colors.backgroundTertiary,
            color: colors.warning,
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: 4,
            overflow: 'hidden',
          }
        ]}>
          {node.children.map((c, i) => renderNode(c, colors, { ...parentStyles }, depth))}
        </Text>
      );
    }

    case 'pre': {
      // Code block
      const codeText = extractText(node);
      return (
        <View key={key} style={[styles.codeBlock, {
          backgroundColor: colors.backgroundSecondary,
          borderColor: colors.border,
        }]}>
          <Text style={[styles.codeBlockText, {
            color: colors.textPrimary,
          }]}>
            {codeText}
          </Text>
        </View>
      );
    }

    case 'blockquote': {
      return (
        <View key={key} style={[styles.blockquote, {
          borderLeftColor: colors.primary,
        }]}>
          <Text style={[styles.blockquoteText, { color: colors.textSecondary }]}>
            {node.children.map((c, i) => renderNode(c, colors, { fontStyle: 'italic', color: colors.textSecondary }, depth))}
          </Text>
        </View>
      );
    }

    case 'ul': {
      return (
        <View key={key} style={{ paddingLeft: depth === 0 ? 20 : 16, marginVertical: 2 }}>
          {node.children.map((c, i) => renderNode(c, colors, parentStyles, depth + 1))}
        </View>
      );
    }

    case 'ol': {
      return (
        <View key={key} style={{ paddingLeft: depth === 0 ? 20 : 16, marginVertical: 2 }}>
          {node.children.filter(c => c.tag === 'li').map((c, i) => {
            return (
              <View key={`oli-${keyCounter++}`} style={styles.listItem}>
                <Text style={[parentStyles, { color: colors.textPrimary, fontSize: 15 }]}>{`${i + 1}. `}</Text>
                <Text style={[parentStyles, { flex: 1, color: colors.textPrimary, fontSize: 15 }]}>
                  {c.children.map((cc, j) => renderNode(cc, colors, { ...parentStyles, color: colors.textPrimary, fontSize: 15 }, depth + 1))}
                </Text>
              </View>
            );
          })}
        </View>
      );
    }

    case 'li': {
      // Unordered list item (ordered handled above)
      const markers = ['\u2022', '\u25E6', '\u25AA']; // disc, circle, square
      const marker = markers[Math.min(depth - 1, markers.length - 1)] || '\u2022';
      return (
        <View key={key} style={styles.listItem}>
          <Text style={[parentStyles, { color: colors.textPrimary, fontSize: 15 }]}>{marker}  </Text>
          <Text style={[parentStyles, { flex: 1, color: colors.textPrimary, fontSize: 15 }]}>
            {node.children.map((c, i) => renderNode(c, colors, { ...parentStyles, color: colors.textPrimary, fontSize: 15 }, depth))}
          </Text>
        </View>
      );
    }

    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const size = HEADING_SIZES[node.tag] || 15;
      return (
        <Text key={key} style={[parentStyles, { fontSize: size, fontWeight: '700', marginVertical: 3, lineHeight: size * 1.3 }]}>
          {node.children.map((c, i) => renderNode(c, colors, { ...parentStyles, fontWeight: '700', fontSize: size }, depth))}
        </Text>
      );
    }

    case 'a': {
      const href = node.attrs?.href || '';
      return (
        <Text
          key={key}
          style={[parentStyles, { color: colors.info, textDecorationLine: 'underline' }]}
          onPress={() => { if (href) Linking.openURL(href).catch(() => {}); }}
        >
          {node.children.map((c, i) => renderNode(c, colors, { ...parentStyles, color: colors.info, textDecorationLine: 'underline' }, depth))}
        </Text>
      );
    }

    case 'span': {
      // Check for mention tag
      const cls = node.attrs?.class || '';
      if (cls.includes('mention-tag')) {
        const text = extractText(node);
        return (
          <Text key={key} style={[
            parentStyles,
            {
              backgroundColor: colors.primaryLight,
              color: colors.primary,
              borderRadius: 4,
              paddingHorizontal: 4,
              fontWeight: '600',
              fontSize: (parentStyles.fontSize || 15) * 0.92,
              overflow: 'hidden',
            }
          ]}>
            {text}
          </Text>
        );
      }
      // Generic span — pass through
      return renderInlineChildren();
    }

    case 'hr': {
      return <View key={key} style={[styles.hr, { backgroundColor: colors.border }]} />;
    }

    case 'img': {
      // Skip images in text rendering — they're handled by file attachments
      return null;
    }

    default: {
      // Unknown tag — render children
      if (node.children && node.children.length > 0) {
        return (
          <Text key={key} style={parentStyles}>
            {node.children.map((c, i) => renderNode(c, colors, parentStyles, depth))}
          </Text>
        );
      }
      return null;
    }
  }
}

function extractText(node) {
  if (node.tag === '#text') return node.text || '';
  if (!node.children) return '';
  return node.children.map(extractText).join('');
}

// ─── Component ──────────────────────────────────────────────────────────────

const RichText = React.memo(function RichText({ html, text, colors, baseStyle }) {
  const elements = useMemo(() => {
    keyCounter = 0; // reset key counter per render
    if (!html && !text) return null;

    // If we have HTML content, parse it
    if (html && html.trim() && html.trim() !== '<p></p>') {
      try {
        const tokens = tokenize(html);
        const ast = buildAST(tokens);
        return ast.children.map((node, i) => renderNode(node, colors || {}, baseStyle || {}));
      } catch (e) {
        // Fallback to plain text on parse error
        return <Text style={baseStyle}>{text || html}</Text>;
      }
    }

    // Plain text fallback
    return <Text style={baseStyle}>{text || ''}</Text>;
  }, [html, text, colors, baseStyle]);

  return <View style={styles.container}>{elements}</View>;
});

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  paragraph: {
    marginVertical: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  codeBlock: {
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginVertical: 4,
  },
  codeBlockText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 2,
    marginVertical: 3,
  },
  blockquoteText: {
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 22,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 1,
  },
  hr: {
    height: 1,
    marginVertical: 6,
  },
});

export default RichText;
