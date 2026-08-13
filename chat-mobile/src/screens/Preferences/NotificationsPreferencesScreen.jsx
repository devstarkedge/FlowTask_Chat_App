import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, HelpCircle, ChevronRight, Bell, Clock, Smartphone, Volume2, AppWindow, Hash, Activity, MessageCircle, Headphones, Grid, Key } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { OptionsSelectionModal } from '../../components/common';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


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
  ]
};

const NotificationsPreferencesScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const prefs = usePreferencesStore();

  const [activePicker, setActivePicker] = useState(null);

  const renderSwitchRow = (icon, label, valueKey) => (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.rowLeft}>
        {icon}
        <View style={styles.textContainer}>
          <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
        </View>
      </View>
      <Switch 
        value={prefs[valueKey]} 
        onValueChange={() => prefs.togglePreference(valueKey)} 
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Notifications</Text>
        <TouchableOpacity style={styles.helpButton}>
          <HelpCircle size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {renderSectionTitle('How to notify you')}
        {renderSwitchRow(<Smartphone size={22} color={colors.textSecondary} />, 'Mobile notifications', 'notifMobileNotifications')}
        
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
            activePicker === 'notifAllowSchedule' ? NOTIF_OPTIONS.schedule :
            activePicker === 'notifDefaultReminder' ? NOTIF_OPTIONS.reminderTime :
            activePicker === 'notifNotifyMobile' ? NOTIF_OPTIONS.notifyMobile :
            activePicker === 'notifSound' ? NOTIF_OPTIONS.sound :
            activePicker === 'notifLetYouKnowAbout' ? NOTIF_OPTIONS.letYouKnowAbout :
            NOTIF_OPTIONS.keywords
          }
          selectedValue={prefs[activePicker]}
          onSelect={(val) => prefs.setPreference(activePicker, val)}
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
