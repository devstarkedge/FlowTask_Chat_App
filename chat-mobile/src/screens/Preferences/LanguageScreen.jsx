import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


const LANGUAGE_OPTIONS = [
  { label: 'Deutsch (Deutschland)', value: 'Deutsch (Deutschland)' },
  { label: 'English (UK)', value: 'English (UK)' },
  { label: 'English (US)', value: 'English (US)' },
  { label: 'Español (España)', value: 'Español (España)' },
  { label: 'Español (Latinoamérica)', value: 'Español (Latinoamérica)' },
  { label: 'Français (France)', value: 'Français (France)' },
  { label: 'Italiano (Italia)', value: 'Italiano (Italia)' },
  { label: 'Português (Brasil)', value: 'Português (Brasil)' },
  { label: '한국어', value: '한국어' },
  { label: '日本語', value: '日本語' },
  { label: '简体中文', value: '简体中文' },
  { label: '繁體中文', value: '繁體中文' },
];

const LanguageScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const prefs = usePreferencesStore();

  const renderOption = (option) => {
    const isSelected = prefs.language === option.value;
    return (
      <TouchableOpacity 
        key={option.value}
        style={styles.optionRow} 
        onPress={() => prefs.setPreference('language', option.value)}
        activeOpacity={0.7}
      >
        <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{option.label}</Text>
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Language</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.optionsContainer}>
          {LANGUAGE_OPTIONS.map(renderOption)}
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

export default LanguageScreen;
