import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { usePreferencesStore } from '../../stores/preferencesStore';

const SKIN_TONE_OPTIONS = [
  { label: 'Default', value: 'Default', emojis: '✋👍👏✌️' },
  { label: 'Light', value: 'Light', emojis: '✋🏻👍🏻👏🏻✌🏻' },
  { label: 'Medium-Light', value: 'Medium-Light', emojis: '✋🏼👍🏼👏🏼✌🏼' },
  { label: 'Medium', value: 'Medium', emojis: '✋🏽👍🏽👏🏽✌🏽' },
  { label: 'Medium-Dark', value: 'Medium-Dark', emojis: '✋🏾👍🏾👏🏾✌🏾' },
  { label: 'Dark', value: 'Dark', emojis: '✋🏿👍🏿👏🏿✌🏿' },
];

const EmojiSkinToneScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const prefs = usePreferencesStore();

  const renderOption = (option) => {
    const isSelected = prefs.emojiSkinTone === option.value;
    return (
      <TouchableOpacity 
        key={option.value}
        style={[styles.optionRow, { borderBottomColor: colors.border }]} 
        onPress={() => prefs.setPreference('emojiSkinTone', option.value)}
        activeOpacity={0.7}
      >
        <Text style={styles.emojiText}>{option.emojis}</Text>
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Default Emoji Skin Tone</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Choose the default skin tone that will be used whenever you use certain emojis in reactions and messages.
        </Text>
        <View style={styles.optionsContainer}>
          {SKIN_TONE_OPTIONS.map(renderOption)}
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
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    width: 44,
  },
  content: {
    padding: 20,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  optionsContainer: {
    gap: 0,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  emojiText: {
    fontSize: 24,
    letterSpacing: 4,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

export default EmojiSkinToneScreen;
