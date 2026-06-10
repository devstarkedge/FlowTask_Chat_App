import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';

/**
 * WorkspaceActionRow
 * A tappable row used in the Add Workspaces options list.
 *
 * Props:
 *  - icon: Lucide icon component
 *  - label: string
 *  - onPress: function
 *  - showChevron: bool (default false)
 */
const WorkspaceActionRow = ({ icon: Icon, label, onPress, showChevron = false }) => {
  const { colors } = useThemeStore();

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.55}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.backgroundSecondary ?? colors.card }]}>
        <Icon size={20} color={colors.textSecondary} strokeWidth={1.8} />
      </View>
      <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
      {showChevron && (
        <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.8} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 16,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
});

export default WorkspaceActionRow;
