import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { ChevronLeft, ChevronDown } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { OptionsSelectionModal } from '../../components/common';

const SWIPE_OPTIONS = {
  dmLeft: [
    { label: 'Mark as Read/Unread', value: 'Mark as Read/Unread' },
    { label: 'Mute/Unmute', value: 'Mute/Unmute' },
    { label: 'Nothing', value: 'Nothing' },
  ],
  dmRight: [
    { label: 'Mark as Read/Unread', value: 'Mark as Read/Unread' },
    { label: 'Mute/Unmute', value: 'Mute/Unmute' },
    { label: 'Nothing', value: 'Nothing' },
  ],
  activityLeft: [
    { label: 'Mark as Read/Unread', value: 'Mark as Read/Unread' },
    { label: 'Clear/Restore', value: 'Clear/Restore' },
    { label: 'Nothing', value: 'Nothing' },
  ],
  activityRight: [
    { label: 'Mark as Read/Unread', value: 'Mark as Read/Unread' },
    { label: 'Clear/Restore', value: 'Clear/Restore' },
    { label: 'Nothing', value: 'Nothing' },
  ]
};

const SwipeActionsScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const prefs = usePreferencesStore();

  const [activePicker, setActivePicker] = useState(null);

  const renderDropdownRow = (label, value, pickerKey) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
      <TouchableOpacity 
        style={[styles.dropdownButton, { backgroundColor: colors.backgroundSecondary }]}
        onPress={() => setActivePicker(pickerKey)}
        activeOpacity={0.7}
      >
        <Text style={[styles.dropdownText, { color: colors.textPrimary }]}>{value}</Text>
        <ChevronDown size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.background === '#FFFFFF' ? 'dark-content' : 'light-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color={colors.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Swipe Actions</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>DMs</Text>
        {renderDropdownRow('Left Swipe', prefs.swipeDmLeft, 'swipeDmLeft')}
        {renderDropdownRow('Right Swipe', prefs.swipeDmRight, 'swipeDmRight')}

        <View style={styles.spacing} />

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Activity</Text>
        {renderDropdownRow('Left Swipe', prefs.swipeActivityLeft, 'swipeActivityLeft')}
        {renderDropdownRow('Right Swipe', prefs.swipeActivityRight, 'swipeActivityRight')}
      </ScrollView>

      {activePicker && (
        <OptionsSelectionModal
          visible={!!activePicker}
          onClose={() => setActivePicker(null)}
          title={`Select Action`}
          options={
            activePicker === 'swipeDmLeft' ? SWIPE_OPTIONS.dmLeft :
            activePicker === 'swipeDmRight' ? SWIPE_OPTIONS.dmRight :
            activePicker === 'swipeActivityLeft' ? SWIPE_OPTIONS.activityLeft :
            SWIPE_OPTIONS.activityRight
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  rowLabel: {
    fontSize: 16,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: '500',
  },
  spacing: {
    height: 16,
  }
});

export default SwipeActionsScreen;
