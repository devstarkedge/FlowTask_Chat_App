import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';

/**
 * FilterTabs — standardized horizontal tab filter bar.
 *
 * Props:
 *  - tabs: Array<{ key: string, label: string }>
 *  - activeTab: string
 *  - onTabChange: (key: string) => void
 */
const FilterTabs = React.memo(({ tabs, activeTab, onTabChange }) => {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && { borderBottomColor: colors.primary }]}
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.label,
                { color: isActive ? colors.primary : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default FilterTabs;
