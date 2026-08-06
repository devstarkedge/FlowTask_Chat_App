import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text } from 'react-native';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import { useThemeStore } from '../../stores/themeStore';

import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Code,
  List, ListOrdered, SquareCheck, Quote, Table, Minus,
  ArrowRightToLine, ArrowDownToLine, Trash
} from 'lucide-react-native';

const ICON_SIZE = moderateScale(18);

function CanvasFormatToolbar({
  selectionState = {},
  onCommand,
  onInsertPress,
}) {
  const { colors } = useThemeStore();
  const formatButtons = [
    { id: 'undo', icon: Undo2, command: 'undo', disabled: !selectionState.canUndo },
    { id: 'redo', icon: Redo2, command: 'redo', disabled: !selectionState.canRedo },
    { id: 'bold', icon: Bold, command: 'toggleBold', active: selectionState.bold },
    { id: 'italic', icon: Italic, command: 'toggleItalic', active: selectionState.italic },
    { id: 'underline', icon: Underline, command: 'toggleUnderline', active: selectionState.underline },
    { id: 'strike', icon: Strikethrough, command: 'toggleStrike', active: selectionState.strike },
    { id: 'code', icon: Code, command: 'toggleCode', active: selectionState.code },
    { id: 'h1', label: 'H1', command: 'setHeading', value: 1, active: selectionState.heading === 1 },
    { id: 'h2', label: 'H2', command: 'setHeading', value: 2, active: selectionState.heading === 2 },
    { id: 'h3', label: 'H3', command: 'setHeading', value: 3, active: selectionState.heading === 3 },
    { id: 'bulletList', icon: List, command: 'toggleBulletList', active: selectionState.bulletList },
    { id: 'orderedList', icon: ListOrdered, command: 'toggleOrderedList', active: selectionState.orderedList },
    { id: 'taskList', icon: SquareCheck, command: 'toggleTaskList', active: selectionState.taskList },
    { id: 'blockquote', icon: Quote, command: 'toggleBlockquote', active: selectionState.blockquote },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundSecondary, borderTopColor: colors.border }]}>
      <ScrollView
        horizontal
        style={styles.scroll}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={styles.scrollContent}
      >
        {formatButtons.map((btn) => {
          const Icon = btn.icon;
          return (
            <TouchableOpacity
              key={btn.id}
              disabled={btn.disabled}
              onPress={() => onCommand(btn.command, btn.value)}
              style={[
                styles.btn,
                btn.active && { backgroundColor: colors.primary },
                btn.disabled && { opacity: 0.5 }
              ]}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              {Icon ? (
                <Icon size={ICON_SIZE} color={btn.active ? colors.textOnPrimary : btn.disabled ? colors.textTertiary : colors.textPrimary} />
              ) : (
                <Text style={[styles.label, { color: colors.textPrimary }, btn.active && { color: colors.textOnPrimary }]}>{btn.label}</Text>
              )}
            </TouchableOpacity>
          );
        })}

        {selectionState.table ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <TouchableOpacity onPress={() => onCommand('addColumnAfter')} style={styles.btn}>
              <ArrowRightToLine size={ICON_SIZE} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCommand('deleteColumn')} style={styles.btn}>
              <Text style={{ color: colors.error || '#ef4444', fontWeight: 'bold', fontSize: moderateScale(12) }}>-C</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCommand('addRowAfter')} style={styles.btn}>
              <ArrowDownToLine size={ICON_SIZE} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCommand('deleteRow')} style={styles.btn}>
              <Text style={{ color: colors.error || '#ef4444', fontWeight: 'bold', fontSize: moderateScale(12) }}>-R</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCommand('deleteTable')} style={styles.btn}>
              <Trash size={ICON_SIZE} color={colors.error || '#ef4444'} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <TouchableOpacity onPress={onInsertPress} style={styles.btn}>
              <Table size={ICON_SIZE} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCommand('insertHorizontalRule')} style={styles.btn}>
              <Minus size={ICON_SIZE} color={colors.textPrimary} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(8),
  },
  btn: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(6),
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: scale(2),
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: moderateScale(13),
    fontWeight: 'bold',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: verticalScale(24),
    marginHorizontal: scale(6),
  },
});

export default React.memo(CanvasFormatToolbar);
