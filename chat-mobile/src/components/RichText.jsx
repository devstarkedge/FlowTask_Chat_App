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
import { View, Text, StyleSheet, Linking, Image } from 'react-native';
import { pellToTipTap } from '../utils/formatConverter';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { normalizeMediaUrl } from '../utils/mediaUtils';


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
const HEADING_SIZES = {
  h1: moderateScale(22),
  h2: moderateScale(20),
  h3: moderateScale(18),
  h4: moderateScale(16),
  h5: moderateScale(15),
  h6: moderateScale(14),
};

let keyCounter = 0;

function renderTextWithLinksAndMentions(text, baseKey, parentStyles, ctx) {
  const { colors, mentions, onMentionPress } = ctx;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  const mentionNames = (mentions || []).map(m => (m.username || m.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  const regexStr = `(https?:\\/\\/[^\\s]+)|(www\\.[^\\s]+)` + (mentionNames.length > 0 ? `|(@(?:${mentionNames.join('|')}))` : '');
  const combinedRegex = new RegExp(regexStr, 'gi');

  let i = 0;
  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={`${baseKey}-t${i++}`} style={parentStyles}>{text.slice(lastIndex, match.index)}</Text>);
    }
    
    const matchedText = match[0];
    if (matchedText.toLowerCase().startsWith('http') || matchedText.toLowerCase().startsWith('www')) {
      const href = matchedText.toLowerCase().startsWith('http') ? matchedText : `https://${matchedText}`;
      parts.push(
        <Text 
          key={`${baseKey}-l${i++}`} 
          style={[parentStyles, { color: colors.info, textDecorationLine: 'underline' }]}
          onPress={() => Linking.openURL(href).catch(() => {})}
        >
          {matchedText}
        </Text>
      );
    } else if (matchedText.startsWith('@')) {
      const nameMatch = matchedText.slice(1).toLowerCase();
      const mentionObj = (mentions || []).find(m => (m.username || m.name || '').toLowerCase() === nameMatch);
      if (mentionObj) {
        parts.push(
          <Text 
            key={`${baseKey}-m${i++}`} 
            style={[
              parentStyles,
              {
                backgroundColor: colors.primaryLight,
                color: colors.primary,
                borderRadius: moderateScale(4),
                paddingHorizontal: scale(4),
                fontWeight: '600',
                fontSize: (parentStyles.fontSize || 15) * 0.92,
                overflow: 'hidden',
              }
            ]}
            onPress={() => onMentionPress && onMentionPress(mentionObj.userId || mentionObj._id)}
          >
            {matchedText}
          </Text>
        );
      } else {
         parts.push(<Text key={`${baseKey}-t${i++}`} style={parentStyles}>{matchedText}</Text>);
      }
    }
    lastIndex = combinedRegex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(<Text key={`${baseKey}-t${i++}`} style={parentStyles}>{text.slice(lastIndex)}</Text>);
  }

  return parts.length > 0 ? parts : <Text key={baseKey} style={parentStyles}>{text}</Text>;
}

function renderChildren(children, ctx, parentStyles, depth) {
  const result = [];
  let currentInlineGroup = [];

  const flushInline = () => {
    if (currentInlineGroup.length > 0) {
      result.push(
        <Text key={`inline-${keyCounter++}`} style={[styles.paragraphText, parentStyles]}>
          {currentInlineGroup.map(c => renderNode(c, ctx, parentStyles, depth))}
        </Text>
      );
      currentInlineGroup = [];
    }
  };

  const blockTags = ['div', 'p', 'ul', 'ol', 'li', 'pre', 'blockquote', 'hr'];
  
  (children || []).forEach(c => {
    if (blockTags.includes(c.tag)) {
      flushInline();
      result.push(renderNode(c, ctx, parentStyles, depth));
    } else {
      currentInlineGroup.push(c);
    }
  });
  flushInline();
  
  return result;
}

function renderNode(node, ctx, parentStyles = {}, depth = 0) {
  const { colors, mentions, onMentionPress } = ctx;
  const key = `rt-${keyCounter++}`;

  if (node.tag === '#text') {
    return renderTextWithLinksAndMentions(node.text, key, parentStyles, ctx);
  }

  if (node.tag === 'br') {
    return '\n';
  }

  // Recursively render children as inline content (Text-compatible)
  const renderInlineChildren = (extraStyles = {}) => {
    const merged = { ...parentStyles, ...extraStyles };
    return node.children.map((c, i) => renderNode(c, ctx, merged, depth));
  };

  // Render children that may contain block elements
  const renderBlockChildren = () => {
    return node.children.map((c, i) => renderNode(c, ctx, parentStyles, depth));
  };

  switch (node.tag) {
    case 'div':
    case 'p': {
      // Paragraph — wrap block children safely, grouping inline elements
      return (
        <View key={key} style={styles.paragraphView}>
          {renderChildren(node.children, ctx, parentStyles, depth)}
        </View>
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
            {node.children.map((c, i) => renderNode(c, ctx, parentStyles, depth))}
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
            paddingHorizontal: scale(5),
            paddingVertical: verticalScale(1),
            borderRadius: moderateScale(4),
            overflow: 'hidden',
          }
        ]}>
          {node.children.map((c, i) => renderNode(c, ctx, { ...parentStyles }, depth))}
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
          {renderChildren(node.children, ctx, { ...parentStyles, fontStyle: 'italic', color: colors.textSecondary }, depth)}
        </View>
      );
    }

    case 'ul': {
      return (
        <View key={key} style={{ paddingLeft: depth === 0 ? 20 : 16, marginVertical: verticalScale(2) }}>
          {node.children.map((c, i) => renderNode(c, ctx, parentStyles, depth + 1))}
        </View>
      );
    }

    case 'ol': {
      return (
        <View key={key} style={{ paddingLeft: depth === 0 ? 20 : 16, marginVertical: verticalScale(2) }}>
          {node.children.filter(c => c.tag === 'li').map((c, i) => {
            return (
              <View key={`oli-${keyCounter++}`} style={styles.listItem}>
                <Text style={[parentStyles, { color: colors.textPrimary, fontSize: moderateScale(15) }]}>{`${i + 1}. `}</Text>
                <View style={{ flexShrink: 1 }}>
                  {renderChildren(c.children, ctx, { ...parentStyles, color: colors.textPrimary, fontSize: moderateScale(15) }, depth + 1)}
                </View>
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
          <Text style={[parentStyles, { color: colors.textPrimary, fontSize: moderateScale(15) }]}>{marker}  </Text>
          <View style={{ flexShrink: 1 }}>
            {renderChildren(node.children, ctx, { ...parentStyles, color: colors.textPrimary, fontSize: moderateScale(15) }, depth)}
          </View>
        </View>
      );
    }

    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const size = HEADING_SIZES[node.tag] || 15;
      return (
        <Text key={key} style={[parentStyles, { fontSize: size, fontWeight: '700', marginVertical: verticalScale(3), lineHeight: size * 1.3 }]}>
          {node.children.map((c, i) => renderNode(c, ctx, { ...parentStyles, fontWeight: '700', fontSize: size }, depth))}
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
          {node.children.map((c, i) => renderNode(c, ctx, { ...parentStyles, color: colors.info, textDecorationLine: 'underline' }, depth))}
        </Text>
      );
    }

    case 'span': {
      // Check for mention tag
      const cls = node.attrs?.class || '';
      const dataType = node.attrs?.['data-type'] || '';
      if (cls.includes('mention') || dataType === 'mention') {
        const text = extractText(node);
        const userId = node.attrs?.['data-id'];
        return (
          <Text 
            key={key} 
            style={[
              parentStyles,
              {
                backgroundColor: colors.primaryLight,
                color: colors.primary,
                borderRadius: moderateScale(4),
                paddingHorizontal: scale(4),
                fontWeight: '600',
                fontSize: (parentStyles.fontSize || 15) * 0.92,
                overflow: 'hidden',
              }
            ]}
            onPress={() => onMentionPress && onMentionPress(userId)}
          >
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
      const src = node.attrs?.src;
      if (!src) return null;
      const normalizedSrc = normalizeMediaUrl(src);
      return (
        <View key={key} style={styles.inlineImageContainer}>
          <Image
            source={{ uri: normalizedSrc }}
            style={styles.inlineImage}
            resizeMode="cover"
          />
        </View>
      );
    }

    default: {
      // Unknown tag — render children
      if (node.children && node.children.length > 0) {
        return (
          <Text key={key} style={parentStyles}>
            {node.children.map((c, i) => renderNode(c, ctx, parentStyles, depth))}
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

function markdownToHtml(text) {
  if (!text) return "";

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (```...```)
  html = html.replace(
    /```([\s\S]*?)```/g,
    (_, code) => `<pre><code>${code.trim()}</code></pre>`,
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Underline
  html = html.replace(/__(.+?)__/g, "<u>$1</u>");

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");

  // Blockquotes (lines starting with >)
  html = html.replace(/^&gt;\s?(.*)$/gm, "<blockquote>$1</blockquote>");

  // Bullet list blocks (consecutive lines starting with - or *)
  html = html.replace(/(?:^[-*]\s+.*(?:\r?\n|$))+/gm, (match) => {
    const items = match.trim().split('\n').map(line => {
      const content = line.replace(/^[-*]\s+/, '');
      return `<li>${content}</li>`;
    }).join('');
    return `<ul>${items}</ul>`;
  });

  // Numbered list blocks (consecutive lines starting with digits)
  html = html.replace(/(?:^\d+\.\s+.*(?:\r?\n|$))+/gm, (match) => {
    const items = match.trim().split('\n').map(line => {
      const content = line.replace(/^\d+\.\s+/, '');
      return `<li>${content}</li>`;
    }).join('');
    return `<ol>${items}</ol>`;
  });

  return html;
}

// ─── Component ──────────────────────────────────────────────────────────────

const RichText = React.memo(function RichText({ html, text, colors, baseStyle, mentions = [], onMentionPress }) {
  const elements = useMemo(() => {
    keyCounter = 0; // reset key counter per render
    if (!html && !text) return null;

    const ctx = { colors: colors || {}, mentions, onMentionPress };

    const rawHtml = (html && html.trim() && html.trim() !== '<p></p>')
      ? html
      : markdownToHtml(text || '');

    const targetHtml = pellToTipTap(rawHtml);

    if (targetHtml && targetHtml.trim() && targetHtml.trim() !== '<p></p>') {
      try {
        const tokens = tokenize(targetHtml);
        const ast = buildAST(tokens);
        return renderChildren(ast.children, ctx, baseStyle || {}, 0);
      } catch (e) {
        // Fallback to plain text on parse error
        return <Text style={baseStyle}>{text || html}</Text>;
      }
    }

    return null;
  }, [html, text, colors, baseStyle, mentions, onMentionPress]);

  return <View style={styles.container}>{elements}</View>;
});

const styles = StyleSheet.create({
  container: {
    minWidth: moderateScale(20),
  },
  paragraphView: {
    marginVertical: moderateScale(8),
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    maxWidth: '100%',
  },
  paragraphText: {
    fontSize: moderateScale(15),
    lineHeight: moderateScale(22),
    flexShrink: 1,
  },
  codeBlock: {
    borderRadius: moderateScale(6),
    borderWidth: 1,
    paddingVertical: moderateScale(10),
    paddingHorizontal: moderateScale(14),
    marginVertical: moderateScale(4),
  },
  codeBlockText: {
    fontFamily: 'monospace',
    fontSize: moderateScale(13),
    lineHeight: moderateScale(18),
  },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: moderateScale(10),
    paddingVertical: moderateScale(2),
    marginVertical: moderateScale(3),
  },
  blockquoteText: {
    fontStyle: 'italic',
    fontSize: moderateScale(15),
    lineHeight: moderateScale(22),
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: moderateScale(1),
  },
  hr: {
    height: moderateScale(1),
    marginVertical: moderateScale(6),
  },
  inlineImageContainer: {
    width: '100%',
    maxWidth: 400,
    aspectRatio: 1.5,
    borderRadius: moderateScale(12),
    overflow: 'hidden',
    marginVertical: moderateScale(4),
  },
  inlineImage: {
    width: '100%',
    height: '100%',
    borderRadius: moderateScale(12),
  },
});

export default RichText;
