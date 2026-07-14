import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useAuthStore } from '../stores/authStore';
import { useTranslation } from '../utils/i18n';
import { OptionsSelectionModal } from '../components/common';
import {
  X,
  User,
  ExternalLink,
  ChevronRight,
  Bell,
  Box,
  PenTool,
  Smile,
  MessageSquare,
  Link2,
  Type,
  Smartphone,
  Volume2,
  ArrowRight,
  Image as ImageIcon,
  Headphones,
  Globe,
  Clock,
  Eye,
  Lock,
  CreditCard,
  PieChart,
  Info,
  Book,
  Activity,
  Bug,
  HelpCircle,
  MessageCircle,
} from 'lucide-react-native';

const SectionTitle = ({ title, colors }) => (
  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
);

const PreferenceItem = ({ icon: Icon, title, subtitle, rightIcon, rightText, onPress, colors }) => (
  <TouchableOpacity style={[styles.itemContainer, { borderBottomColor: colors.border }]} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.iconContainer}>
      <Icon size={24} color={colors.textSecondary} strokeWidth={1.5} />
    </View>
    <View style={styles.textContainer}>
      <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{title}</Text>
      {subtitle ? <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
    <View style={styles.rightContainer}>
      {rightText ? <Text style={[styles.rightText, { color: colors.textSecondary }]}>{rightText}</Text> : null}
      {rightIcon === 'chevron' ? (
        <ChevronRight size={20} color={colors.textTertiary} strokeWidth={1.5} />
      ) : rightIcon === 'external' ? (
        <ExternalLink size={20} color={colors.textTertiary} strokeWidth={1.5} />
      ) : rightIcon ? (
        <Text style={styles.rightEmoji}>{rightIcon}</Text>
      ) : null}
    </View>
  </TouchableOpacity>
);

const SELECTION_CONFIGS = {
  emojiSkinTone: {
    title: 'Default Emoji Skin Tone',
    options: [
      { label: 'Default (Yellow) ✋', value: 'Default' },
      { label: 'Light ✋🏻', value: 'Light' },
      { label: 'Medium-Light ✋🏼', value: 'Medium-Light' },
      { label: 'Medium ✋🏽', value: 'Medium' },
      { label: 'Medium-Dark ✋🏾', value: 'Medium-Dark' },
      { label: 'Dark ✋🏿', value: 'Dark' },
    ],
  },
  messageDisplay: {
    title: 'Message Display',
    options: [
      { label: 'Clean (Default)', value: 'Clean' },
      { label: 'Compact', value: 'Compact' },
    ],
  },
  linkStyle: {
    title: 'Links',
    options: [
      { label: 'Show Preview', value: 'Preview' },
      { label: 'Text Only', value: 'Text Only' },
    ],
  },
  inputOptions: {
    title: 'Input Options',
    options: [
      { label: 'Rich Text', value: 'Rich Text' },
      { label: 'Markdown', value: 'Markdown' },
    ],
  },
  screenReader: {
    title: 'Screen Reader',
    options: [
      { label: 'Default', value: 'Default' },
      { label: 'Verbose', value: 'Verbose' },
    ],
  },
  swipeActions: {
    title: 'Swipe Actions',
    options: [
      { label: 'Reply', value: 'Reply' },
      { label: 'Save', value: 'Save' },
      { label: 'Mark Unread', value: 'Mark Unread' },
    ],
  },
  language: {
    title: 'Language',
    options: [
      { label: 'English (US)', value: 'English (US)' },
      { label: 'English (UK)', value: 'English (UK)' },
      { label: 'Spanish', value: 'Spanish' },
      { label: 'French', value: 'French' },
      { label: 'German', value: 'German' },
      { label: 'Japanese', value: 'Japanese' },
    ],
  },
  timeFormat: {
    title: 'Time Format',
    options: [
      { label: '12-hour (AM/PM)', value: '12-hour' },
      { label: '24-hour', value: '24-hour' },
    ],
  },
  browserApp: {
    title: 'Browser Application',
    options: [
      { label: 'In-App Browser', value: 'In-App' },
      { label: 'System Default', value: 'System' },
    ],
  },
};

const PreferencesScreen = ({ navigation }) => {
  const { colors, effectiveTheme, toggleTheme, customColor, accentColor, setCustomColor } = useThemeStore();
  const prefs = usePreferencesStore();
  const user = useAuthStore(state => state.user);
  
  const [activeSelection, setActiveSelection] = useState(null);

  const openSelection = (key) => setActiveSelection(key);
  const closeSelection = () => setActiveSelection(null);

  const { t } = useTranslation();

  const handleOpenLink = (url) => {
    Linking.openURL(url).catch(err => {
      Alert.alert("Error", "Could not open link");
    });
  };

  const handleClearCache = () => {
    Alert.alert(
      "Clear Cache",
      "Are you sure you want to clear the app cache?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", onPress: () => Alert.alert("Success", "Cache cleared successfully"), style: "destructive" }
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <X size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t("Preferences")}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Top Profile / Account */}
        <View style={styles.section}>
          <PreferenceItem
            icon={User}
            title={t("Account Settings")}
            rightIcon="external"
            colors={colors}
            onPress={() => navigation.navigate('Profile')}
          />
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <SectionTitle title={t("Notifications")} colors={colors} />
          <PreferenceItem
            icon={Bell}
            title={t("Notifications")}
            subtitle={t("Customize your notifications")}
            rightIcon="chevron"
            colors={colors}
            onPress={() => navigation.navigate('NotificationsPreferences')}
          />
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <SectionTitle title={t("Appearance")} colors={colors} />
          <PreferenceItem
            icon={Box}
            title={t("Accent Color")}
            subtitle={accentColor.charAt(0).toUpperCase() + accentColor.slice(1)}
            rightIcon="chevron"
            colors={colors}
            onPress={() => navigation.navigate('AccentColor')}
          />
          <PreferenceItem
            icon={PenTool}
            title={t("Color Mode")}
            subtitle={effectiveTheme === 'dark' ? t('Dark') : (effectiveTheme === 'light' ? t('Light') : t('System'))}
            rightIcon="chevron"
            colors={colors}
            onPress={() => navigation.navigate('ColorMode')}
          />
          <PreferenceItem
            icon={Smile}
            title={t("Default Emoji Skin Tone")}
            subtitle={prefs.emojiSkinTone}
            rightIcon="chevron"
            colors={colors}
            onPress={() => navigation.navigate('EmojiSkinTone')}
          />
        </View>

        {/* Accessibility */}
        <View style={styles.section}>
          <SectionTitle title={t("Accessibility")} colors={colors} />
          <PreferenceItem
            icon={ArrowRight}
            title={t("Swipe Actions")}
            subtitle={t("Configured")}
            rightIcon="chevron"
            colors={colors}
            onPress={() => navigation.navigate('SwipeActions')}
          />
        </View>

        {/* Audio, Video & Images */}
        <View style={styles.section}>
          <SectionTitle title={t("Audio, Video & Images")} colors={colors} />
          <PreferenceItem
            icon={Headphones}
            title={t("Huddles")}
            subtitle={t("Configured")}
            rightIcon="chevron"
            colors={colors}
            onPress={() => navigation.navigate('Huddles')}
          />
        </View>

        {/* Language & Region */}
        <View style={styles.section}>
          <SectionTitle title={t("Language & Region")} colors={colors} />
          <PreferenceItem
            icon={Globe}
            title={t("Language")}
            subtitle={prefs.language}
            rightIcon="chevron"
            colors={colors}
            onPress={() => navigation.navigate('Language')}
          />
          <PreferenceItem
            icon={Clock}
            title={t("Time")}
            subtitle={prefs.time24Hour ? t('24-hour') : t('12-hour')}
            rightIcon="chevron"
            colors={colors}
            onPress={() => navigation.navigate('Time')}
          />
        </View>

        {/* Administration */}
        <View style={styles.section}>
          <SectionTitle title={t("Administration")} colors={colors} />
          <PreferenceItem
            icon={CreditCard}
            title={t("Billing")}
            subtitle={t("View or manage your Free Plan")}
            rightIcon="external"
            colors={colors}
            onPress={() => handleOpenLink('https://slack.com/pricing')}
          />
          {user?.role === 'admin' && (
            <PreferenceItem
              icon={PieChart}
              title={t("Analytics")}
              subtitle={t("View your analytics dashboard")}
              rightIcon="external"
              colors={colors}
              onPress={() => handleOpenLink('https://slack.com/help/articles/218080037')}
            />
          )}
        </View>

        {/* About */}
        <View style={styles.section}>
          <SectionTitle title={t("About")} colors={colors} />
          <PreferenceItem
            icon={Info}
            title={t("Version")}
            subtitle="1.0.0 (Latest)"
            colors={colors}
            onPress={() => Alert.alert('Version', 'You are on the latest version.')}
          />
        </View>

      </ScrollView>


      
      {activeSelection && SELECTION_CONFIGS[activeSelection] && (
        <OptionsSelectionModal
          visible={!!activeSelection}
          onClose={closeSelection}
          title={SELECTION_CONFIGS[activeSelection].title}
          options={SELECTION_CONFIGS[activeSelection].options}
          selectedValue={prefs[activeSelection]}
          onSelect={(val) => prefs.setPreference(activeSelection, val)}
        />
      )}

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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    width: 32, // To balance the X icon size
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  iconContainer: {
    width: 32,
    alignItems: 'flex-start',
  },
  textContainer: {
    flex: 1,
    paddingRight: 16,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '400',
  },
  itemSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightText: {
    fontSize: 14,
    marginRight: 8,
  },
  rightEmoji: {
    fontSize: 18,
    marginRight: 4,
  },
});

export default PreferencesScreen;
