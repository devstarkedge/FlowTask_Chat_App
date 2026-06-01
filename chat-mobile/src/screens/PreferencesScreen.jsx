import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Switch,
} from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import {
  ChevronLeft,
  Sun,
  Moon,
  Smartphone,
  Palette,
  Globe,
  Eye,
  Type,
  Lock,
  Bell,
  ChevronRight,
} from 'lucide-react-native';

const PreferencesScreen = ({ navigation }) => {
  const { colors, theme, setTheme, sidebarTheme, setSidebarTheme } = useThemeStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const styles = createStyles(colors);

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Smartphone },
  ];

  const themeColors = [
    { value: 'aubergine', label: 'Aubergine', color: '#3F0E40' },
    { value: 'purple', label: 'Purple', color: '#4A154B' },
    { value: 'blue', label: 'Blue', color: '#0F3D5E' },
    { value: 'green', label: 'Green', color: '#0F5132' },
    { value: 'graphite', label: 'Graphite', color: '#1F2428' },
  ];

  const MenuItem = ({ icon: Icon, label, value, onPress, showChevron = true }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Icon size={22} color={colors.textSecondary} strokeWidth={1.5} />
      <View style={styles.menuContent}>
        <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>{label}</Text>
        {value && (
          <Text style={[styles.menuValue, { color: colors.textSecondary }]}>{value}</Text>
        )}
      </View>
      {showChevron && <ChevronRight size={20} color={colors.textTertiary} />}
    </TouchableOpacity>
  );

  const SectionTitle = ({ title }) => (
    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Preferences</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Appearance */}
        <View style={styles.section}>
          <SectionTitle title="APPEARANCE" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            {themeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.themeOption}
                onPress={() => setTheme(option.value)}
                activeOpacity={0.7}
              >
                <option.icon size={22} color={colors.textSecondary} />
                <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>
                  {option.label}
                </Text>
                <View
                  style={[
                    styles.radio,
                    { borderColor: colors.border },
                    theme === option.value && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  {theme === option.value && (
                    <View style={[styles.radioInner, { backgroundColor: colors.textInverse }]} />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Theme Colors */}
        <View style={styles.section}>
          <SectionTitle title="THEME" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={styles.colorGrid}>
              {themeColors.map((color) => (
                <TouchableOpacity
                  key={color.value}
                  style={styles.colorOption}
                  onPress={() => setSidebarTheme(color.value)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.colorCircle,
                      { backgroundColor: color.color },
                      sidebarTheme === color.value && styles.colorCircleSelected,
                    ]}
                  />
                  <Text style={[styles.colorLabel, { color: colors.textPrimary }]}>
                    {color.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Language */}
        <View style={styles.section}>
          <SectionTitle title="LANGUAGE & REGION" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <MenuItem
              icon={Globe}
              label="Language"
              value="English (US)"
              onPress={() => {}}
            />
          </View>
        </View>

        {/* Accessibility */}
        <View style={styles.section}>
          <SectionTitle title="ACCESSIBILITY" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <MenuItem
              icon={Type}
              label="Font Size"
              value="Medium"
              onPress={() => {}}
            />
            <MenuItem
              icon={Eye}
              label="Accessibility Options"
              onPress={() => {}}
            />
          </View>
        </View>

        {/* Privacy */}
        <View style={styles.section}>
          <SectionTitle title="PRIVACY & SECURITY" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <MenuItem
              icon={Lock}
              label="Privacy Settings"
              onPress={() => {}}
            />
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <SectionTitle title="NOTIFICATIONS" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={styles.menuItem}>
              <Bell size={22} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.menuLabel, { color: colors.textPrimary, flex: 1 }]}>
                Push Notifications
              </Text>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: colors.border, true: colors.primary + '50' }}
                thumbColor={notificationsEnabled ? colors.primary : colors.textTertiary}
              />
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  menuValue: {
    fontSize: 14,
    marginTop: 2,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingVertical: 8,
  },
  colorOption: {
    alignItems: 'center',
    gap: 8,
    width: '30%',
  },
  colorCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorCircleSelected: {
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  colorLabel: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default PreferencesScreen;
