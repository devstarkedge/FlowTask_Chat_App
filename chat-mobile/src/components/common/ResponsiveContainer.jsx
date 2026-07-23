import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useResponsive from '../../hooks/useResponsive';
import { useThemeStore } from '../../stores/themeStore';

/**
 * ResponsiveContainer provides automatic layout centering and max-width capping
 * for wide screens (tablets, web, desktop) while preserving full-bleed layout on mobile devices.
 */
export const ResponsiveContainer = ({
  children,
  style,
  contentContainerStyle,
  maxWidth,
  scrollable = false,
  applySafeArea = false,
  centerOnWide = true,
  ...rest
}) => {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { width, isTablet, isDesktop, maxContainerWidth } = useResponsive();

  const effectiveMaxWidth = maxWidth || maxContainerWidth;
  const isWide = isTablet || isDesktop || width > 640;

  const safeAreaPadding = applySafeArea ? {
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  } : {};

  const outerStyle = [
    styles.outerContainer,
    { backgroundColor: colors.background },
    safeAreaPadding,
    style,
  ];

  const contentStyle = [
    styles.content,
    isWide && centerOnWide && {
      maxWidth: effectiveMaxWidth,
      width: '100%',
      alignSelf: 'center',
    },
    contentContainerStyle,
  ];

  if (scrollable) {
    return (
      <View style={outerStyle}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...rest}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={outerStyle}>
      <View style={contentStyle} {...rest}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    width: '100%',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  content: {
    flex: 1,
    width: '100%',
  },
});

export default ResponsiveContainer;
