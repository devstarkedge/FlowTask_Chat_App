import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Music } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import { useTranslation } from '../../utils/i18n';

const HuddlesScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const prefs = usePreferencesStore();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.background === '#FFFFFF' ? 'dark-content' : 'light-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color={colors.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t("Huddles")}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Music size={22} color={colors.textSecondary} />
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Play music when alone in a huddle</Text>
          </View>
          <Switch 
            value={prefs.huddlesMusic} 
            onValueChange={() => prefs.togglePreference('huddlesMusic')} 
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
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
    paddingTop: verticalScale(16),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(20),
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: scale(16),
  },
  rowLabel: {
    fontSize: moderateScale(16),
    marginLeft: scale(16),
  },
});

export default HuddlesScreen;
