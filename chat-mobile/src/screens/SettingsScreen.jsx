import React from 'react';
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
import { useAuthStore } from '../stores/authStore';
import {
  Sun,
  Moon,
  Smartphone,
  Bell,
  Lock,
  Globe,
  ChevronRight,
  Check,
} from 'lucide-react-native';

const SettingsScreen = ({ navigation }) => {
  const { colors, mode, sidebarTheme, setMode, setSidebarTheme } = useThemeStore();
  const { user } = useAuthStore();

  const themeOptions = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Smartphone },
  ];

  const sidebarThemes = [
    { id: 'aubergine', label: 'Aubergine', color: '#3F0E40' },
    { id: 'purple', label: 'Purple', color: '#4A154B' },
    { id: 'blue', label: 'Blue', color: '#0F3D5E' },
    { id: 'green', label: 'Green', color: '#0F5132' },
    { id: 'graphite', label: 'Graphite', color: '#1F2428' },
  ];

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>APPEARANCE</Text>
          
          {/* Theme Mode */}
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Theme</Text>
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = mode === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.option,
                    isSelected && { backgroundColor: colors.primaryLight }
                  ]}
                  onPress={() => setMode(option.id)}
                  activeOpacity={0.7}
                >
                  <Icon size={20} color={isSelected ? colors.primary : colors.textSecondary} />
                  <Text style={[
                    styles.optionLabel,
                    { color: isSelected ? colors.primary : colors.textPrimary }
                  ]}>
                    {option.label}
                  </Text>
                  {isSelected && <Check size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Sidebar Theme */}
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Sidebar Theme</Text>
            {sidebarThemes.map((theme) => {
              const isSelected = sidebarTheme === theme.id;
              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[
                    styles.option,
                    isSelected && { backgroundColor: colors.primaryLight }
                  ]}
                  onPress={() => setSidebarTheme(theme.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.colorPreview, { backgroundColor: theme.color }]} />
                  <Text style={[
                    styles.optionLabel,
                    { color: isSelected ? colors.primary : colors.textPrimary }
                  ]}>
                    {theme.label}
                  </Text>
                  {isSelected && <Check size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>NOTIFICATIONS</Text>
          
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <SettingRow
              icon={Bell}
              label="Push Notifications"
              colors={colors}
              rightComponent={<Switch value={true} onValueChange={() => {}} />}
            />
            <SettingRow
              icon={Bell}
              label="Mentions"
              colors={colors}
              rightComponent={<Switch value={true} onValueChange={() => {}} />}
            />
            <SettingRow
              icon={Bell}
              label="Direct Messages"
              colors={colors}
              rightComponent={<Switch value={true} onValueChange={() => {}} />}
            />
            <SettingRow
              icon={Bell}
              label="Channel Notifications"
              colors={colors}
              rightComponent={<Switch value={false} onValueChange={() => {}} />}
            />
          </View>
        </View>

        {/* General Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>GENERAL</Text>
          
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <SettingRow
              icon={Globe}
              label="Language"
              value="English"
              colors={colors}
              onPress={() => {}}
            />
            <SettingRow
              icon={Lock}
              label="Privacy"
              colors={colors}
              onPress={() => {}}
            />
            <SettingRow
              icon={Lock}
              label="Security"
              colors={colors}
              onPress={() => {}}
            />
          </View>
        </View>

        {/* Account Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACCOUNT</Text>
          
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Name</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user?.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Email</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user?.email}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Role</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user?.role || 'Member'}</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const SettingRow = ({ icon: Icon, label, value, colors, onPress, rightComponent }) => {
  const styles = createStyles(colors);
  
  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Icon size={20} color={colors.textSecondary} />
      <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{label}</Text>
      {value && (
        <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{value}</Text>
      )}
      {rightComponent || (onPress && <ChevronRight size={20} color={colors.textTertiary} />)}
    </TouchableOpacity>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  optionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  settingLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  settingValue: {
    fontSize: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
  },
});

export default SettingsScreen;
