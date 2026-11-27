import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, HelpCircle, ChevronRight, Bell, Smartphone, MessageCircle, Headphones, Grid, Key, Clock } from "lucide-react-native";
import { useThemeStore } from '../../stores/themeStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useNotificationPrefStore } from '../../stores/notificationPrefStore';
import { OptionsSelectionModal } from '../../components/common';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import { useTranslation } from '../../utils/i18n';

const NOTIF_OPTIONS = {
  schedule: [
    { label: 'Everyday', value: 'Everyday' },
    { label: 'Weekdays', value: 'Weekdays' },
    { label: 'Custom', value: 'Custom' },
  ],
  reminderTime: [
    { label: '8:00 AM', value: '8:00 AM' },
    { label: '9:00 AM', value: '9:00 AM' },
    { label: '10:00 AM', value: '10:00 AM' },
  ],
  notifyMobile: [
    { label: 'As soon as I\'m inactive', value: 'As soon as I\'m inactive' },
    { label: 'After 1 minute', value: 'After 1 minute' },
    { label: 'After 5 minutes', value: 'After 5 minutes' },
  ],
  sound: [
    { label: 'Ding', value: 'Ding' },
    { label: 'Boing', value: 'Boing' },
    { label: 'Drop', value: 'Drop' },
    { label: 'Mute', value: 'Mute' },
  ],
  letYouKnowAbout: [
    { label: 'Everything', value: 'Everything' },
    { label: 'Mentions & Replies', value: 'Mentions & Replies' },
    { label: 'Nothing', value: 'Nothing' },
  ],
  keywords: [
    { label: 'None', value: 'None' },
    { label: 'Important', value: 'Important' },
  ],
  deliveryMode: [
    { label: 'Immediately (all devices)', value: 'immediately' },
    { label: 'Desktop-first (30s delay)', value: 'desktop_first:30' },
    { label: 'Desktop-first (60s delay)', value: 'desktop_first:60' },
    { label: 'Desktop-first (120s delay)', value: 'desktop_first:120' },
  ],
  lockScreenPreview: [
    { label: 'Full message preview', value: 'full' },
    { label: 'Sender name only', value: 'sender_only' },
    { label: 'Hide preview', value: 'hidden' },
  ],
};

const NotificationsPreferencesScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const prefs = usePreferencesStore();
  const notificationPrefs = useNotificationPrefStore();
  const { t } = useTranslation();

  const [activePicker, setActivePicker] = useState(null);

  useEffect(() => {
    useNotificationPrefStore.getState().fetchPreferences();
  }, []);

  const renderSwitchRow = (icon, label, valueKey, override = {}) => (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.rowLeft}>
        {icon}
        <View style={styles.textContainer}>
          <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
        </View>
      </View>
      <Switch 
        value={typeof override.value === 'boolean' ? override.value : prefs[valueKey]}
        onValueChange={override.onValueChange || (() => prefs.togglePreference(valueKey))}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  const renderLinkRow = (icon, label, subtitle, pickerKey) => (
    <TouchableOpacity 
      style={[styles.row, { borderBottomColor: colors.border }]} 
      onPress={() => pickerKey ? setActivePicker(pickerKey) : null}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        {icon}
        <View style={styles.textContainer}>
          <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
          {subtitle ? <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
      </View>
      <ChevronRight size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  const renderSectionTitle = (title, subtitle = null) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {subtitle && <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.background === '#FFFFFF' ? 'dark-content' : 'light-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color={colors.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t("Notifications")}</Text>
        <TouchableOpacity style={styles.helpButton}>
          <HelpCircle size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {notificationPrefs.error ? (
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.surface || '#FEF2F2' }]}
            onPress={() => notificationPrefs.fetchPreferences()}
            activeOpacity={0.7}
          >
            <Text style={[styles.rowSubtitle, { color: colors.danger || '#DC2626' }]}>
              Could not load saved notification settings. Tap to retry.
            </Text>
          </TouchableOpacity>
        ) : null}

        {renderSectionTitle('How to notify you')}
        {renderSwitchRow(
          <Smartphone size={22} color={colors.textSecondary} />,
          'Mobile notifications',
          'notifMobileNotifications',
          {
            value: notificationPrefs.preferences?.global?.mobilePush !== false,
            onValueChange: value => notificationPrefs.updateGlobal('mobilePush', value).catch(() => {}),
          },
        )}
        {renderSwitchRow(
          <Bell size={22} color={colors.textSecondary} />,
          'Desktop notifications',
          'notifDesktopNotifications',
          {
            value: notificationPrefs.preferences?.global?.desktopPush !== false,
            onValueChange: value => notificationPrefs.updateGlobal('desktopPush', value).catch(() => {}),
          },
        )}
        {renderSwitchRow(
          <Bell size={22} color={colors.textSecondary} />,
          'Notification sound',
          'notifSoundEnabled',
          {
            value: notificationPrefs.preferences?.global?.sound !== false,
            onValueChange: value => notificationPrefs.updateGlobal('sound', value).catch(() => {}),
          },
        )}
        {renderLinkRow(
          <Clock size={22} color={colors.textSecondary} />,
          'Multi-device delivery',
          notificationPrefs.preferences?.global?.deliveryMode === 'desktop_first'
            ? `Desktop-first (${notificationPrefs.preferences?.global?.desktopFirstDelaySec ?? 60}s delay)`
            : 'Immediately on all enabled devices',
          'deliveryMode',
        )}
        {renderLinkRow(
          <Bell size={22} color={colors.textSecondary} />,
          'Lock-screen preview',
          notificationPrefs.preferences?.global?.lockScreenPreview === 'hidden'
            ? 'Hide preview'
            : notificationPrefs.preferences?.global?.lockScreenPreview === 'sender_only'
              ? 'Sender name only'
              : 'Full message preview',
          'lockScreenPreview',
        )}
        
        <View style={styles.divider} />

        {renderSectionTitle('What to notify you about')}
        {renderLinkRow(<Bell size={22} color={colors.textSecondary} />, 'Let you know about', prefs.notifLetYouKnowAbout, 'notifLetYouKnowAbout')}
        
        <View style={styles.divider} />

        {renderSectionTitle('Also notify you about:')}
        {renderSwitchRow(<MessageCircle size={22} color={colors.textSecondary} />, 'Threads you follow', 'notifThreads')}
        {renderSwitchRow(<Headphones size={22} color={colors.textSecondary} />, 'New huddles\nYou\'ll see incoming huddles on your home screen.', 'notifNewHuddles')}
        {renderSwitchRow(<Grid size={22} color={colors.textSecondary} />, 'Incoming messages\nSee every new message while you\'re active in a workspace', 'notifIncomingMsgs')}
        {renderLinkRow(<Key size={22} color={colors.textSecondary} />, 'Add channel keywords', prefs.notifKeywords, 'notifKeywords')}

        <View style={styles.divider} />

        {renderSectionTitle('What to show in Activity', "You'll always see mentions, reactions, and thread replies in Activity.")}
        {renderSwitchRow(<Bell size={22} color={colors.textSecondary} />, 'DMs and Group DMs', 'notifDmsGroups')}
        {renderSwitchRow(<Bell size={22} color={colors.textSecondary} />, 'Channels with notifications set to "All new posts"', 'notifChannels')}

      </ScrollView>

      {activePicker && (
        <OptionsSelectionModal
          visible={!!activePicker}
          onClose={() => setActivePicker(null)}
          title={`Select Option`}
          options={
            activePicker === 'deliveryMode' ? NOTIF_OPTIONS.deliveryMode :
            activePicker === 'lockScreenPreview' ? NOTIF_OPTIONS.lockScreenPreview :
            activePicker === 'notifAllowSchedule' ? NOTIF_OPTIONS.schedule :
            activePicker === 'notifDefaultReminder' ? NOTIF_OPTIONS.reminderTime :
            activePicker === 'notifNotifyMobile' ? NOTIF_OPTIONS.notifyMobile :
            activePicker === 'notifSound' ? NOTIF_OPTIONS.sound :
            activePicker === 'notifLetYouKnowAbout' ? NOTIF_OPTIONS.letYouKnowAbout :
            NOTIF_OPTIONS.keywords
          }
          selectedValue={
            activePicker === 'deliveryMode'
              ? (notificationPrefs.preferences?.global?.deliveryMode === 'desktop_first'
                ? `desktop_first:${notificationPrefs.preferences?.global?.desktopFirstDelaySec ?? 60}`
                : 'immediately')
              : activePicker === 'lockScreenPreview'
                ? (notificationPrefs.preferences?.global?.lockScreenPreview || 'full')
                : prefs[activePicker]
          }
          onSelect={async (val) => {
            if (activePicker === 'deliveryMode') {
              if (typeof val === 'string' && val.startsWith('desktop_first:')) {
                const delay = Number(val.split(':')[1]) || 60;
                await notificationPrefs.updateGlobal('deliveryMode', 'desktop_first').catch(() => {});
                await notificationPrefs.updateGlobal('desktopFirstDelaySec', delay).catch(() => {});
              } else {
                await notificationPrefs.updateGlobal('deliveryMode', 'immediately').catch(() => {});
              }
            } else if (activePicker === 'lockScreenPreview') {
              await notificationPrefs.updateGlobal('lockScreenPreview', val).catch(() => {});
            } else {
              prefs.setPreference(activePicker, val);
            }
          }}
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
  helpButton: {
    padding: moderateScale(8),
  },
  content: {
    paddingBottom: verticalScale(40),
  },
  sectionHeader: {
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(24),
    paddingBottom: verticalScale(12),
  },
  sectionTitle: {
    fontSize: moderateScale(15),
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: moderateScale(14),
    marginTop: verticalScale(4),
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(20),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: scale(16),
  },
  textContainer: {
    flex: 1,
    marginLeft: scale(16),
  },
  rowLabel: {
    fontSize: moderateScale(16),
  },
  rowSubtitle: {
    fontSize: moderateScale(14),
    marginTop: verticalScale(2),
  },
  divider: {
    height: verticalScale(16),
  },
});

export default NotificationsPreferencesScreen;
