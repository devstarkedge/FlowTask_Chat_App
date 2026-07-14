import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, Switch } from 'react-native';
import { ChevronLeft, Hourglass, Clock } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { usePreferencesStore } from '../../stores/preferencesStore';

const TimeScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const prefs = usePreferencesStore();

  const renderSwitchRow = (icon, label, subtitle, valueKey) => (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon}
        <View style={styles.textContainer}>
          <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
          {subtitle && <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.background === '#FFFFFF' ? 'dark-content' : 'light-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color={colors.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Time</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {renderSwitchRow(
          <Hourglass size={22} color={colors.textPrimary} />, 
          'Set Time Zone Automatically', 
          null, 
          'timeZoneAuto'
        )}
        {renderSwitchRow(
          <Clock size={22} color={colors.textPrimary} />, 
          'Use 24-hour Clock', 
          'Display time in 24-hour format', 
          'time24Hour'
        )}
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
    paddingTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 16,
  },
  textContainer: {
    flex: 1,
    marginLeft: 16,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
});

export default TimeScreen;
