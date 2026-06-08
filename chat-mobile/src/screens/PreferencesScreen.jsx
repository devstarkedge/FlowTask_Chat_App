import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Switch,
  Alert,
} from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import { accentColors } from '../theme/colors';
import {
  registerForPushNotifications,
  unregisterPushNotifications,
  isPushEnabled as checkPushEnabled,
} from '../services/pushNotificationService';
import {
  ChevronLeft,
  Sun,
  Moon,
  Smartphone,
  Globe,
  Eye,
  Type,
  Lock,
  Bell,
  ChevronRight,
  Palette,
} from 'lucide-react-native';
import ColorPickerModal from '../components/ColorPickerModal';

const PreferencesScreen = ({ navigation }) => {
  const {
    colors,
    mode,
    setMode,
    accentColor,
    setAccentColor,
    customColor,
    setCustomColor,
    previewCustomColor,
    effectiveTheme,
  } = useThemeStore();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Check current push state on mount
  useEffect(() => {
    checkPushEnabled().then(setNotificationsEnabled);
  }, []);

  const handlePushToggle = async (value) => {
    setNotificationsEnabled(value);
    if (value) {
      const token = await registerForPushNotifications();
      if (!token) {
        // Permission denied — revert toggle
        setNotificationsEnabled(false);
        Alert.alert(
          'Push Notifications',
          'Permission was denied. Please enable notifications in your device settings.',
        );
      }
    } else {
      await unregisterPushNotifications();
    }
  };

  const styles = createStyles(colors);

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Smartphone },
  ];

  // Fixed accent colors — always match the preset definitions, never drift with current theme
  const accentColorOptions = [
    { value: 'blue', label: 'Blue', color: accentColors.blue.primary },
    { value: 'purple', label: 'Purple', color: accentColors.purple.primary },
    { value: 'green', label: 'Green', color: accentColors.green.primary },
    { value: 'orange', label: 'Orange', color: accentColors.orange.primary },
    { value: 'red', label: 'Red', color: accentColors.red.primary },
    { value: 'custom', label: 'Custom', color: customColor || '#888888' },
  ];

  const handleAccentPress = (option) => {
    if (option.value === 'custom') {
      setPickerOpen(true);
    } else {
      setAccentColor(option.value);
    }
  };

  const MenuItem = ({ icon: Icon, label, value, onPress, showChevron = true }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Icon size={22} color={colors.textSecondary} strokeWidth={1.5} />
      <View style={styles.menuContent}>
        <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>{label}</Text>
        {value && <Text style={[styles.menuValue, { color: colors.textSecondary }]}>{value}</Text>}
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
                  <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{option.label}</Text>
                  <View style={[styles.radio, { borderColor: colors.border }, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {isSelected && <View style={[styles.radioInner, { backgroundColor: colors.textInverse }]} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Accent Color */}
        <View style={styles.section}>
          <SectionTitle title="ACCENT COLOR" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={styles.colorGrid}>
              {accentColorOptions.map((option) => {
                const isActive = accentColor === option.value;
                const isCustom = option.value === 'custom';
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.colorOption}
                    onPress={() => handleAccentPress(option)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.colorCircle,
                        { backgroundColor: option.color },
                        isActive && styles.colorCircleSelected,
                      ]}
                    >
                      {isActive && (
                        <View style={styles.checkDot} />
                      )}
                      {isCustom && !isActive && (
                        <Palette size={18} color="#fff" />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.colorLabel,
                        { color: isActive ? colors.primary : colors.textPrimary },
                        isActive && styles.colorLabelActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <ColorPickerModal
            visible={pickerOpen}
            onClose={() => setPickerOpen(false)}
            initialHex={customColor || '#E040FB'}
            onPreview={(hex) => previewCustomColor(hex)}
            onApply={(hex) => {
              setCustomColor(hex);
              setPickerOpen(false);
            }}
          />
        </View>

        {/* Language */}
        <View style={styles.section}>
          <SectionTitle title="LANGUAGE & REGION" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <MenuItem icon={Globe} label="Language" value="English (US)" onPress={() => {}} />
          </View>
        </View>

        {/* Accessibility */}
        <View style={styles.section}>
          <SectionTitle title="ACCESSIBILITY" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <MenuItem icon={Type} label="Font Size" value="Medium" onPress={() => {}} />
            <MenuItem icon={Eye} label="Accessibility Options" onPress={() => {}} />
          </View>
        </View>

        {/* Privacy */}
        <View style={styles.section}>
          <SectionTitle title="PRIVACY & SECURITY" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <MenuItem icon={Lock} label="Privacy Settings" onPress={() => {}} />
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <SectionTitle title="NOTIFICATIONS" />
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={styles.menuItem}>
              <Bell size={22} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.menuLabel, { color: colors.textPrimary, flex: 1 }]}>Push Notifications</Text>
              <Switch
                value={notificationsEnabled}
                onValueChange={handlePushToggle}
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

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    section: { marginTop: 24 },
    sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 20, marginBottom: 8 },
    card: { marginHorizontal: 16, borderRadius: 12, padding: 16, gap: 4 },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 14 },
    menuContent: { flex: 1 },
    menuLabel: { fontSize: 16, fontWeight: '500' },
    menuValue: { fontSize: 14, marginTop: 2 },
    themeOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
    optionLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    radioInner: { width: 8, height: 8, borderRadius: 4 },

    /* Accent color grid */
    colorGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      paddingVertical: 8,
      justifyContent: 'space-between',
    },
    colorOption: {
      alignItems: 'center',
      gap: 8,
      width: '30%',
      paddingVertical: 6,
    },
    colorCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 3,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorCircleSelected: {
      borderColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 5,
    },
    checkDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#FFFFFF',
    },
    colorLabel: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    colorLabelActive: {
      fontWeight: '700',
    },
  });

export default PreferencesScreen;
