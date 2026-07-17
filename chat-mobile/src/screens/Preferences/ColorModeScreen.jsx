import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


const ThemeThumbnail = ({ mode, colors }) => {
  const isDark = mode === 'dark' || (mode === 'system' && colors.background === '#1A1D21');
  const bg = isDark ? '#1F2937' : '#FFFFFF';
  const header = isDark ? '#111827' : '#F3F4F6';
  const border = isDark ? '#374151' : '#E5E7EB';
  const sidebar = isDark ? '#1F2937' : '#FFFFFF';
  const primary = colors.primary;

  return (
    <View style={[styles.thumbnail, { backgroundColor: bg, borderColor: border }]}>
      <View style={[styles.thumbHeader, { backgroundColor: header }]} />
      <View style={styles.thumbBody}>
        <View style={[styles.thumbSidebar, { backgroundColor: sidebar, borderRightColor: border }]} />
        <View style={styles.thumbContent}>
          <View style={[styles.thumbLine, { backgroundColor: primary, width: '40%' }]} />
          <View style={[styles.thumbLine, { backgroundColor: border, width: '80%' }]} />
          <View style={[styles.thumbLine, { backgroundColor: border, width: '60%' }]} />
        </View>
      </View>
    </View>
  );
};

const ColorModeScreen = ({ navigation }) => {
  const { colors, mode, setMode } = useThemeStore();

  const renderOption = (value, label, subtitle) => {
    const isSelected = mode === value;
    return (
      <TouchableOpacity 
        style={[styles.optionRow, { borderBottomColor: colors.border }]} 
        onPress={() => setMode(value)}
        activeOpacity={0.7}
      >
        <View style={styles.optionLeft}>
          <ThemeThumbnail mode={value} colors={colors} />
          <View style={styles.optionTextContainer}>
            <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{label}</Text>
            {subtitle && <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
          </View>
        </View>
        <View style={[styles.radio, { borderColor: isSelected ? colors.primary : colors.textTertiary }]}>
          {isSelected && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.background === '#FFFFFF' ? 'dark-content' : 'light-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color={colors.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Color Mode</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {renderOption('system', 'System', 'Uses device settings')}
        {renderOption('light', 'Light')}
        {renderOption('dark', 'Dark')}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: moderateScale(8),
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
  },
  headerRight: {
    width: scale(44),
  },
  content: {
    paddingTop: verticalScale(8),
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(20),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: scale(60),
    height: verticalScale(44),
    borderRadius: moderateScale(6),
    borderWidth: 1,
    overflow: 'hidden',
    marginRight: scale(16),
  },
  thumbHeader: {
    height: verticalScale(12),
    width: '100%',
  },
  thumbBody: {
    flex: 1,
    flexDirection: 'row',
  },
  thumbSidebar: {
    width: scale(14),
    borderRightWidth: 1,
  },
  thumbContent: {
    flex: 1,
    padding: moderateScale(4),
    gap: 4,
  },
  thumbLine: {
    height: verticalScale(4),
    borderRadius: moderateScale(2),
  },
  optionTextContainer: {
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: moderateScale(16),
    fontWeight: '500',
  },
  optionSubtitle: {
    fontSize: moderateScale(13),
    marginTop: verticalScale(2),
  },
  radio: {
    width: scale(22),
    height: verticalScale(22),
    borderRadius: moderateScale(11),
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: scale(10),
    height: verticalScale(10),
    borderRadius: moderateScale(5),
  },
});

export default ColorModeScreen;
