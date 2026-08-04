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
import { scale, verticalScale, moderateScale } from '../utils/responsive';

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
  
  // If no selection, but they have typed something, let's wrap the LAST WORD they typed
  if (text && text.trim().length > 0 && !text.endsWith(' ')) {
    const match = text.match(/(\S+)(\s*)$/);
    if (match) {
      const word = match[1];
      const trailingSpace = match[2];
      const before = text.slice(0, match.index);
      return `${before}${prefix}${word}${suffix}${trailingSpace}`;
    }
  }

  // No selection and no preceding word: just append the format tags
  const space = text && !text.endsWith(' ') ? ' ' : '';
  return `${text}${space}${prefix}${suffix}`;
};

const FormattingToolbar = React.memo(function FormattingToolbar({
  colors,
  onInsertMention,
  onFormat,
}) {
  const btnStyle = [styles.button, { borderColor: colors.border }];

  return (
    <View style={[styles.container, { borderTopColor: colors.border, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Bold */}
        <TouchableOpacity style={btnStyle} onPress={() => onFormat('bold')} activeOpacity={0.7}>
          <Bold size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Italic */}
        <TouchableOpacity style={btnStyle} onPress={() => onFormat('italic')} activeOpacity={0.7}>
          <Italic size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Underline */}
        <TouchableOpacity style={btnStyle} onPress={() => onFormat('underline')} activeOpacity={0.7}>
          <Underline size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Strikethrough */}
        <TouchableOpacity style={btnStyle} onPress={() => onFormat('strikethrough')} activeOpacity={0.7}>
          <Strikethrough size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Bullet List */}
        <TouchableOpacity style={btnStyle} onPress={() => onFormat('unorderedList')} activeOpacity={0.7}>
          <List size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Numbered List */}
        <TouchableOpacity style={btnStyle} onPress={() => onFormat('orderedList')} activeOpacity={0.7}>
          <ListOrdered size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Blockquote */}
        <TouchableOpacity style={btnStyle} onPress={() => onFormat('blockquote')} activeOpacity={0.7}>
          <Quote size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Inline Code */}
        <TouchableOpacity style={btnStyle} onPress={() => onFormat('code')} activeOpacity={0.7}>
          <Code size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Code Block */}
        <TouchableOpacity style={btnStyle} onPress={() => onFormat('codeBlock')} activeOpacity={0.7}>
          <FileCode size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Link */}
        <TouchableOpacity style={btnStyle} onPress={() => onFormat('link')} activeOpacity={0.7}>
          <Link2 size={16} color={colors.textSecondary} />
        </TouchableOpacity>

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
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: moderateScale(8),
  },
  scrollContent: {
    paddingHorizontal: moderateScale(16),
    gap: 8,
    alignItems: 'center',
  },
  button: {
    padding: moderateScale(8),
    borderRadius: moderateScale(8),
    borderWidth: 1,
  },
  divider: {
    width: moderateScale(1),
    height: moderateScale(24),
    backgroundColor: '#e5e7eb',
    marginHorizontal: moderateScale(6),
    opacity: 0.7,
  },
});

export default FormattingToolbar;
