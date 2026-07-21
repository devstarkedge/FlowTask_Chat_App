import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text } from 'react-native';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Code,
  List, ListOrdered, SquareCheck, Quote, Table, Image, Minus,
  ArrowRightToLine, ArrowDownToLine, Trash, TableProperties
} from 'lucide-react-native';

export default function CanvasFormatToolbar({
  selectionState = {},
  onCommand,
  onInsertPress,
}) {
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
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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
                btn.active && styles.activeBtn,
                btn.disabled && styles.disabledBtn
              ]}
            >
              {Icon ? (
                <Icon size={18} color={btn.active ? '#ffffff' : btn.disabled ? '#d1d5db' : '#4b5563'} />
              ) : (
                <Text style={[styles.label, btn.active && styles.activeLabel]}>{btn.label}</Text>
              )}
            </TouchableOpacity>
          );
        })}

        {selectionState.table ? (
          <>
            <View style={styles.divider} />
            <TouchableOpacity onPress={() => onCommand('addColumnAfter')} style={styles.btn}>
              <ArrowRightToLine size={18} color="#4b5563" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCommand('deleteColumn')} style={styles.btn}>
              <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>-C</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCommand('addRowAfter')} style={styles.btn}>
              <ArrowDownToLine size={18} color="#4b5563" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCommand('deleteRow')} style={styles.btn}>
              <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>-R</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCommand('deleteTable')} style={styles.btn}>
              <Trash size={18} color="#ef4444" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.divider} />
            <TouchableOpacity onPress={onInsertPress} style={styles.btn}>
              <Table size={18} color="#4b5563" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCommand('insertHorizontalRule')} style={styles.btn}>
              <Minus size={18} color="#4b5563" />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: verticalScale(48),
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: scale(8),
  },
  btn: {
    width: scale(34),
    height: verticalScale(34),
    borderRadius: moderateScale(6),
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: scale(3),
    backgroundColor: 'transparent',
  },
  activeBtn: {
    backgroundColor: '#4f46e5',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  label: {
    fontSize: moderateScale(13),
    fontWeight: 'bold',
    color: '#4b5563',
  },
  activeLabel: {
    color: '#ffffff',
  },
  divider: {
    width: scale(1),
    height: verticalScale(24),
    backgroundColor: '#e5e7eb',
    marginHorizontal: scale(6),
  },
});
