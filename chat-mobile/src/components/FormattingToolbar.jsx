/**
 * FormattingToolbar — TipTap command toolbar for the mobile composer.
 * Mirrors web FormattingToolbar: toggles TipTap marks via onCommand,
 * never inserts Markdown syntax.
 */
import React, { memo } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
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
import { scale, moderateScale } from '../utils/responsive';

const FormattingToolbar = memo(function FormattingToolbar({
  colors,
  formatState = {},
  onCommand,
  onInsertMention,
  onLink,
}) {
  const fire = (command, value = null) => {
    onCommand?.(command, value);
  };

  const btn = (active) => [
    styles.button,
    {
      borderColor: colors.border,
      backgroundColor: active ? colors.primary : 'transparent',
    },
  ];
  const iconColor = (active) =>
    active ? colors.textOnPrimary || '#fff' : colors.textSecondary;

  return (
    <View
      style={[
        styles.container,
        {
          borderBottomColor: colors.border,
          backgroundColor: colors.inputBackground || colors.background,
        },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        <TouchableOpacity
          style={btn(formatState.bold)}
          onPress={() => fire('toggleBold')}
          activeOpacity={0.7}
        >
          <Bold size={16} color={iconColor(formatState.bold)} />
        </TouchableOpacity>

        <TouchableOpacity
          style={btn(formatState.italic)}
          onPress={() => fire('toggleItalic')}
          activeOpacity={0.7}
        >
          <Italic size={16} color={iconColor(formatState.italic)} />
        </TouchableOpacity>

        <TouchableOpacity
          style={btn(formatState.underline)}
          onPress={() => fire('toggleUnderline')}
          activeOpacity={0.7}
        >
          <Underline size={16} color={iconColor(formatState.underline)} />
        </TouchableOpacity>

        <TouchableOpacity
          style={btn(formatState.strike)}
          onPress={() => fire('toggleStrike')}
          activeOpacity={0.7}
        >
          <Strikethrough size={16} color={iconColor(formatState.strike)} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          style={btn(formatState.bulletList)}
          onPress={() => fire('toggleBulletList')}
          activeOpacity={0.7}
        >
          <List size={16} color={iconColor(formatState.bulletList)} />
        </TouchableOpacity>

        <TouchableOpacity
          style={btn(formatState.orderedList)}
          onPress={() => fire('toggleOrderedList')}
          activeOpacity={0.7}
        >
          <ListOrdered size={16} color={iconColor(formatState.orderedList)} />
        </TouchableOpacity>

        <TouchableOpacity
          style={btn(formatState.blockquote)}
          onPress={() => fire('toggleBlockquote')}
          activeOpacity={0.7}
        >
          <Quote size={16} color={iconColor(formatState.blockquote)} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          style={btn(formatState.code)}
          onPress={() => fire('toggleCode')}
          activeOpacity={0.7}
        >
          <Code size={16} color={iconColor(formatState.code)} />
        </TouchableOpacity>

        <TouchableOpacity
          style={btn(formatState.codeBlock)}
          onPress={() => fire('toggleCodeBlock')}
          activeOpacity={0.7}
        >
          <FileCode size={16} color={iconColor(formatState.codeBlock)} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          style={btn(false)}
          onPress={() => (onLink ? onLink() : fire('setLink', 'https://'))}
          activeOpacity={0.7}
        >
          <Link2 size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={btn(false)}
          onPress={onInsertMention}
          activeOpacity={0.7}
        >
          <AtSign size={16} color={colors.primary || colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: moderateScale(4),
  },
  scrollContent: {
    paddingHorizontal: moderateScale(12),
    gap: 8,
    alignItems: 'center',
  },
  button: {
    padding: moderateScale(8),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    width: scale(36),
    height: scale(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: moderateScale(1),
    height: moderateScale(24),
    marginHorizontal: moderateScale(4),
    opacity: 0.7,
  },
});

export default FormattingToolbar;
