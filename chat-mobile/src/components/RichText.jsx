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

/**
 * Convert HTML (or plain text) to a string that preserves line breaks.
 * RN <Text> reliably shows `\n`; nested Views/`<br>` nodes often collapse on Android.
 */
function htmlToPlainWithNewlines(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n')
    .replace(/<\/h[1-6]>\s*<h[1-6][^>]*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n+$/g, '');
}

/** True when HTML only uses structural line-break tags (no bold/lists/etc.). */
function isSimpleBreakHtml(html) {
  if (!html) return true;
  const stripped = html
    .replace(/<\/?(?:p|br|div)\b[^>]*>/gi, '')
    .replace(/[\n\r]/g, '');
  return !/<[a-z]/i.test(stripped);
}

/** Flatten inline AST nodes into Text children, turning <br> into real `\n`. */
function flattenInlineToTextChildren(children, ctx, parentStyles, depth) {
  const out = [];
  for (const child of children || []) {
    if (child.tag === 'br') {
      out.push('\n');
    } else if (child.tag === '#text') {
      const rendered = renderTextWithLinksAndMentions(
        child.text,
        `t-${keyCounter++}`,
        parentStyles,
        ctx,
      );
      if (Array.isArray(rendered)) out.push(...rendered);
      else out.push(rendered);
    } else if (['strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike', 'code', 'a', 'span'].includes(child.tag)) {
      const rendered = renderNode(child, ctx, parentStyles, depth);
      if (Array.isArray(rendered)) out.push(...rendered);
      else if (rendered != null && rendered !== false) out.push(rendered);
    } else {
      // Unknown inline — recurse textually
      out.push(...flattenInlineToTextChildren(child.children, ctx, parentStyles, depth));
    }
  }
  return out;
}

function renderChildren(children, ctx, parentStyles, depth) {
  const result = [];
  let currentInlineGroup = [];

  const flushInline = () => {
    if (currentInlineGroup.length === 0) return;
    result.push(
      <Text key={`inline-${keyCounter++}`} style={[styles.paragraphText, parentStyles]}>
        {flattenInlineToTextChildren(currentInlineGroup, ctx, parentStyles, depth)}
      </Text>,
    );
    currentInlineGroup = [];
  };

  const blockTags = ['div', 'p', 'ul', 'ol', 'li', 'pre', 'blockquote', 'hr'];

  (children || []).forEach((c) => {
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
    // Must be a raw newline inside a parent <Text> — nested Text `\n` collapses on Android.
    return '\n';
  }

  // Recursively render children as inline content (Text-compatible)
  switch (node.tag) {
    case 'div':
    case 'p': {
      const hasBlockChild = (node.children || []).some((c) =>
        ['div', 'p', 'ul', 'ol', 'li', 'pre', 'blockquote', 'hr'].includes(c.tag),
      );
      if (hasBlockChild) {
        return (
          <View key={key} style={styles.paragraphView}>
            {renderChildren(node.children, ctx, parentStyles, depth)}
          </View>
        );
      }
      // Single Text with real `\n` for <br> — WhatsApp/Android-safe
      return (
        <Text key={key} style={[styles.paragraphText, parentStyles]}>
          {flattenInlineToTextChildren(node.children, ctx, parentStyles, depth)}
        </Text>
      );
    }

    case 'strong': case 'b':
      return (
        <Text key={key} style={[parentStyles, { fontWeight: '700' }]}>
          {flattenInlineToTextChildren(node.children, ctx, { ...parentStyles, fontWeight: '700' }, depth)}
        </Text>
      );

    case 'em': case 'i':
      return (
        <Text key={key} style={[parentStyles, { fontStyle: 'italic' }]}>
          {flattenInlineToTextChildren(node.children, ctx, { ...parentStyles, fontStyle: 'italic' }, depth)}
        </Text>
      );

    case 'u':
      return (
        <Text key={key} style={[parentStyles, { textDecorationLine: 'underline' }]}>
          {flattenInlineToTextChildren(node.children, ctx, { ...parentStyles, textDecorationLine: 'underline' }, depth)}
        </Text>
      );

    case 's': case 'del': case 'strike':
      return (
        <Text key={key} style={[parentStyles, { textDecorationLine: 'line-through' }]}>
          {flattenInlineToTextChildren(node.children, ctx, { ...parentStyles, textDecorationLine: 'line-through' }, depth)}
        </Text>
      );

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
      return (
        <Text key={key} style={parentStyles}>
          {flattenInlineToTextChildren(node.children, ctx, parentStyles, depth)}
        </Text>
      );
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

  // Wrap paragraphs — single newlines become separate <p> tags (WhatsApp / TipTap style)
  html = html
    .split(/\n\n/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "<p><br></p>";
      if (/^<(pre|blockquote|ul|ol|li|hr)/.test(trimmed)) return trimmed;
      if (trimmed.includes("<li>") && !trimmed.includes("<ul") && !trimmed.includes("<ol")) {
        return `<ul>${trimmed}</ul>`;
      }
      const lines = trimmed.split(/\n/);
      if (lines.length === 1) {
        return `<p>${lines[0]}</p>`;
      }
      return lines.map((line) => (line ? `<p>${line}</p>` : `<p><br></p>`)).join("");
    })
    .join("");

  return html;
}

// ─── Component ──────────────────────────────────────────────────────────────

const RichText = React.memo(function RichText({ html, text, colors, baseStyle, mentions = [], onMentionPress }) {
  const elements = useMemo(() => {
    keyCounter = 0; // reset key counter per render
    if (!html && !text) return null;

    const ctx = { colors: colors || {}, mentions, onMentionPress };
    const textStyle = [styles.paragraphText, baseStyle || {}];

    const rawHtml = (html && html.trim() && html.trim() !== '<p></p>')
      ? html
      : markdownToHtml(text || '');

    const targetHtml = pellToTipTap(rawHtml);

    if (!targetHtml || !targetHtml.trim() || targetHtml.trim() === '<p></p>') {
      // Plain text path — preserve newlines from composer
      const plain = (text || '').replace(/\r\n?/g, '\n');
      return plain ? <Text style={textStyle}>{plain}</Text> : null;
    }

    // Simple multiline (only p/br/div) — single Text with `\n` (Android-safe)
    if (isSimpleBreakHtml(targetHtml) && !(mentions && mentions.length)) {
      const plain =
        htmlToPlainWithNewlines(targetHtml) ||
        (text || '').replace(/\r\n?/g, '\n');
      return plain ? <Text style={textStyle}>{plain}</Text> : null;
    }

    try {
      const tokens = tokenize(targetHtml);
      const ast = buildAST(tokens);
      const blockTags = new Set(['div', 'p', 'ul', 'ol', 'li', 'pre', 'blockquote', 'hr']);
      const kids = ast.children || [];
      const onlySimpleParagraphs =
        kids.length > 0 &&
        kids.every(
          (c) =>
            (c.tag === 'p' || c.tag === 'div') &&
            !(c.children || []).some((ch) => blockTags.has(ch.tag)),
        );

      // Multiple <p> lines → one Text with `\n` (avoids Android View stacking bugs)
      if (onlySimpleParagraphs) {
        const parts = [];
        kids.forEach((pNode, i) => {
          if (i > 0) parts.push('\n');
          const inline = flattenInlineToTextChildren(
            pNode.children,
            ctx,
            baseStyle || {},
            0,
          );
          if (inline.length === 0) parts.push('\u00A0');
          else parts.push(...inline);
        });
        return <Text style={textStyle}>{parts}</Text>;
      }

      return renderChildren(kids, ctx, baseStyle || {}, 0);
    } catch (e) {
      const plain =
        htmlToPlainWithNewlines(targetHtml) ||
        (text || html || '').replace(/\r\n?/g, '\n');
      return <Text style={textStyle}>{plain}</Text>;
    }
  }, [html, text, colors, baseStyle, mentions, onMentionPress]);

  return <View style={styles.container}>{elements}</View>;
});

const styles = StyleSheet.create({
  paragraphView: {
    marginVertical: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    flexShrink: 1,
    maxWidth: '100%',
    width: '100%',
  },
  paragraphText: {
    fontSize: moderateScale(15),
    lineHeight: moderateScale(22),
    flexShrink: 1,
    maxWidth: '100%',
  },
  container: {
    minWidth: moderateScale(20),
    maxWidth: '100%',
    alignSelf: 'stretch',
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
