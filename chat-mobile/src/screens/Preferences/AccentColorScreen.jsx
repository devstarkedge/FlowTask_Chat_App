import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { accentColors } from '../../theme/colors';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


const ACCENT_OPTIONS = [
  { label: 'Blue', value: 'blue' },
  { label: 'Purple', value: 'purple' },
  { label: 'Green', value: 'green' },
  { label: 'Orange', value: 'orange' },
  { label: 'Red', value: 'red' },
  { label: 'Yellow', value: 'yellow' },
];

const AccentColorScreen = ({ navigation }) => {
  const { colors, accentColor, setAccentColor } = useThemeStore();

  const renderOption = (option) => {
    const isSelected = accentColor === option.value;
    const swatchColor = accentColors[option.value].primary;
    
    return (
      <TouchableOpacity 
        key={option.value}
        style={styles.optionRow} 
        onPress={() => {
          setAccentColor(option.value);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.optionLeft}>
          <View style={[styles.colorSwatch, { backgroundColor: swatchColor }]} />
          <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{option.label}</Text>
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Accent Color</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.optionsContainer}>
          {ACCENT_OPTIONS.map(renderOption)}
        </View>
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
    paddingBottom: verticalScale(40),
  },
  optionsContainer: {
    gap: 0,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(20),
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorSwatch: {
    width: scale(24),
    height: verticalScale(24),
    borderRadius: moderateScale(12),
    marginRight: scale(16),
  },
  optionLabel: {
    fontSize: moderateScale(16),
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

export default AccentColorScreen;
