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
  const { colors, mode, setMode, sidebarTheme, setSidebarTheme, accentColor, setAccentColor, effectiveTheme } = useThemeStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const styles = createStyles(colors);

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Smartphone },
  ];

  const accentColorOptions = [
    { value: 'blue', label: 'Blue', color: '#3B82F6' },
    { value: 'purple', label: 'Purple', color: '#8B5CF6' },
    { value: 'green', label: 'Green', color: '#10B981' },
    { value: 'orange', label: 'Orange', color: '#F97316' },
    { value: 'red', label: 'Red', color: '#EF4444' },
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
      <StatusBar barStyle={effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
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
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = mode === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={styles.themeOption}
                  onPress={() => setMode(option.value)}
                  activeOpacity={0.7}
                >
                  <Icon size={22} color={isSelected ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.optionLabel, { color: colors.textPrimary }]}> 
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: colors.border },
                      isSelected && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                  >
                    {isSelected && (
                      <View style={[styles.radioInner, { backgroundColor: colors.textInverse }]} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Theme Colors */}
        <View style={styles.section}>
          <SectionTitle title="SIDEBAR THEME" />
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

        {/* Accent Colors */}
        <View style={styles.section}>
          <SectionTitle title="ACCENT COLOR" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={styles.colorGrid}>
              {accentColorOptions.map((color) => (
                <TouchableOpacity
                  key={color.value}
                  style={styles.colorOption}
                  onPress={() => setAccentColor(color.value)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.colorCircle,
                      { backgroundColor: color.color },
                      accentColor === color.value && styles.colorCircleSelected,
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
    paddingVertical: 14,
    gap: 12,
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
    width: '18%',
  },
  colorCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorCircleSelected: {
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  colorLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default PreferencesScreen;
