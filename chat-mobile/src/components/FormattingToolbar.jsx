/**
 * FormattingToolbar — horizontal scrollable bar with markdown formatting buttons.
 * Mirrors the web app's FormattingToolbar but applies markdown syntax that is
 * converted to HTML by the MessageComposer's markdownToHtml() before sending.
 *
 * Buttons: Bold, Italic, Underline, Strikethrough, Bullet List, Numbered List,
 *          Blockquote, Inline Code, Code Block, Link, Mention (@)
 *
 * Props:
 *   text            – current input text
 *   onChangeText    – (text) => void
 *   colors          – theme colors
 *   onInsertMention – () => void (triggers @mention flow in composer)
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  FileCode,
  Link2,
  AtSign,
} from 'lucide-react-native';

/**
 * Wrap the selected portion of text with prefix/suffix markers.
 * If no selection info, wrap the entire text (or append markers at end).
 */
const wrapSelection = (text, prefix, suffix, selectionStart, selectionEnd) => {
  if (selectionStart != null && selectionEnd != null && selectionEnd > selectionStart) {
    const before = text.slice(0, selectionStart);
    const selected = text.slice(selectionStart, selectionEnd);
    const after = text.slice(selectionEnd);
    return `${before}${prefix}${selected}${suffix}${after}`;
  }
  // No selection: append a template placeholder at the end
  if (text && !text.endsWith(' ')) {
    return `${text} ${prefix}text${suffix}`;
  }
  return `${text}${prefix}text${suffix}`;
};

const FormattingToolbar = React.memo(function FormattingToolbar({
  text,
  onChangeText,
  colors,
  onInsertMention,
  selectionStart,
  selectionEnd,
}) {
  const handleFormat = useCallback((prefix, suffix = prefix) => {
    const newText = wrapSelection(text, prefix, suffix, selectionStart, selectionEnd);
    onChangeText(newText);
  }, [text, onChangeText, selectionStart, selectionEnd]);

  const handleBlockFormat = useCallback((marker) => {
    // For block-level formats, add on a new line
    const needsNewline = text && !text.endsWith('\n');
    const newText = `${text}${needsNewline ? '\n' : ''}${marker} `;
    onChangeText(newText);
  }, [text, onChangeText]);

  const handleCodeBlock = useCallback(() => {
    const needsNewline = text && !text.endsWith('\n');
    const newText = `${text}${needsNewline ? '\n' : ''}\`\`\`\ncode here\n\`\`\``;
    onChangeText(newText);
  }, [text, onChangeText]);

  const handleLink = useCallback(() => {
    const newText = `${text}[link text](https://)`;
    onChangeText(newText);
  }, [text, onChangeText]);

  const btnStyle = [styles.button, { borderColor: colors.border }];

  return (
    <View style={[styles.container, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Bold */}
        <TouchableOpacity style={btnStyle} onPress={() => handleFormat('**')} activeOpacity={0.7}>
          <Bold size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Italic */}
        <TouchableOpacity style={btnStyle} onPress={() => handleFormat('*')} activeOpacity={0.7}>
          <Italic size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Underline */}
        <TouchableOpacity style={btnStyle} onPress={() => handleFormat('__')} activeOpacity={0.7}>
          <Underline size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Strikethrough */}
        <TouchableOpacity style={btnStyle} onPress={() => handleFormat('~~')} activeOpacity={0.7}>
          <Strikethrough size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Bullet List */}
        <TouchableOpacity style={btnStyle} onPress={() => handleBlockFormat('-')} activeOpacity={0.7}>
          <List size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Numbered List */}
        <TouchableOpacity style={btnStyle} onPress={() => handleBlockFormat('1.')} activeOpacity={0.7}>
          <ListOrdered size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Blockquote */}
        <TouchableOpacity style={btnStyle} onPress={() => handleBlockFormat('>')} activeOpacity={0.7}>
          <Quote size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Inline Code */}
        <TouchableOpacity style={btnStyle} onPress={() => handleFormat('`')} activeOpacity={0.7}>
          <Code size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Code Block */}
        <TouchableOpacity style={btnStyle} onPress={handleCodeBlock} activeOpacity={0.7}>
          <FileCode size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Link */}
        <TouchableOpacity style={btnStyle} onPress={handleLink} activeOpacity={0.7}>
          <Link2 size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Mention */}
        <TouchableOpacity style={btnStyle} onPress={onInsertMention} activeOpacity={0.7}>
          <AtSign size={16} color={colors.primary || colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 2,
  },
  button: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    marginHorizontal: 4,
  },
});

export default FormattingToolbar;
