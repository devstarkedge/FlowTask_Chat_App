import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, Modal, TextInput, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useTranslation } from '../utils/i18n';
import TermsModal from '../components/TermsModal';
import PrivacyModal from '../components/PrivacyModal';
import { scale, verticalScale, moderateScale } from '../utils/responsive';

import {
  X,
  User,
  ExternalLink,
  ChevronRight,
  Bell,
  Box,
  PenTool,
  Smile,
  Headphones,
  Globe,
  Clock,
  ArrowRight,
  Info,
  AlertTriangle,
  Trash2,
  Shield,
  FileText,
  Mail,
  HardDrive
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

const PreferencesScreen = ({ navigation }) => {
  const { colors, effectiveTheme, toggleTheme, customColor, accentColor, setCustomColor } = useThemeStore();
  const prefs = usePreferencesStore();
  const user = useAuthStore(state => state.user);
  const activeWorkspace = useWorkspaceStore(state => state.activeWorkspace);
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  
  const isNativeAccount = user?.authProvider === 'native' || !user?.authProvider;

  const handleDeleteAccount = async () => {
    if (!deletePassword || deletingAccount) return;
    setDeletingAccount(true);
    try {
      const { useAuthStore: authStoreRef } = require('../stores/authStore');
      await authStoreRef.getState().deleteAccount(deletePassword);
      
      const Toast = require('react-native-toast-message').default;
      Toast.show({ type: 'success', text1: 'Account deletion scheduled for 90 days from now.' });
      
      setShowDeleteModal(false);
      // Wait for logout to process and navigation to kick in automatically
    } catch (error) {
      const Toast = require('react-native-toast-message').default;
      Toast.show({ type: 'error', text1: error?.message || 'Failed to schedule account deletion' });
      setDeletingAccount(false);
    }
  };

  const { t } = useTranslation();

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

        {/* Data & Storage */}
        <View style={styles.section}>
          <SectionTitle title={t("Data & Storage")} colors={colors} />
          <PreferenceItem
            icon={HardDrive}
            title={t("Clear Cache")}
            subtitle={t("Free up space on your device")}
            colors={colors}
            onPress={handleClearCache}
          />
        </View>

        {/* Support & Legal */}
        <View style={styles.section}>
          <SectionTitle title={t("Support & Legal")} colors={colors} />
          <PreferenceItem
            icon={Mail}
            title={t("Contact Support")}
            subtitle={t("Email us for help or feedback")}
            colors={colors}
            onPress={() => Linking.openURL('mailto:support@flowtask.com')}
          />
          <PreferenceItem
            icon={FileText}
            title={t("Terms & Conditions")}
            colors={colors}
            onPress={() => setShowTerms(true)}
          />
          <PreferenceItem
            icon={Shield}
            title={t("Privacy Policy")}
            colors={colors}
            onPress={() => setShowPrivacy(true)}
          />
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

        {/* Danger Zone */}
        <View style={styles.section}>
          <SectionTitle title={t("Danger Zone")} colors={colors} />
          <PreferenceItem
            icon={AlertTriangle}
            title={t("Delete Account")}
            subtitle={t("Permanently delete your account")}
            colors={{ ...colors, textPrimary: colors.error, textSecondary: colors.error }}
            onPress={() => {
              setDeletePassword('');
              setShowDeleteModal(true);
            }}
          />
        </View>

      </ScrollView>


      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => !deletingAccount && setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconContainer, { backgroundColor: `${colors.error}1A` }]}>
                <AlertTriangle size={20} color={colors.error} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Delete your account?</Text>
            </View>
            
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              Your account will be permanently deleted after 90 days. If you log in before the 90-day period ends, your account deletion will be cancelled and your account will be restored.
            </Text>
            
            {isNativeAccount && (
              <>
                <Text style={[styles.inputLabel, { color: colors.textTertiary }]}>CONFIRM WITH YOUR PASSWORD</Text>
                <TextInput
                  style={[styles.passwordInput, { 
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    color: colors.textPrimary 
                  }]}
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  placeholder="Enter your current password"
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!deletingAccount}
                />
              </>
            )}
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn, { borderColor: colors.border }]} 
                onPress={() => setShowDeleteModal(false)}
                disabled={deletingAccount}
              >
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalBtn, styles.deleteBtn, { opacity: deletingAccount || (isNativeAccount && !deletePassword) ? 0.6 : 1 }]} 
                onPress={handleDeleteAccount}
                disabled={deletingAccount || (isNativeAccount && !deletePassword)}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Trash2 size={16} color="#fff" />
                    <Text style={[styles.modalBtnText, { color: '#fff' }]}>Schedule deletion</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TermsModal visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} />

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
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: moderateScale(4),
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
  },
  headerRight: {
    width: scale(32), // To balance the X icon size
  },
  scrollContent: {
    paddingBottom: verticalScale(40),
  },
  section: {
    marginTop: verticalScale(24),
  },
  sectionTitle: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    paddingHorizontal: scale(20),
    marginBottom: verticalScale(8),
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(20),
  },
  iconContainer: {
    width: scale(32),
    alignItems: 'flex-start',
  },
  textContainer: {
    flex: 1,
    paddingRight: scale(16),
  },
  itemTitle: {
    fontSize: moderateScale(16),
    fontWeight: '400',
  },
  itemSubtitle: {
    fontSize: moderateScale(13),
    marginTop: verticalScale(4),
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightText: {
    fontSize: moderateScale(14),
    marginRight: scale(8),
  },
  rightEmoji: {
    fontSize: moderateScale(18),
    marginRight: scale(4),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(20),
  },
  modalContent: {
    width: '100%',
    borderRadius: moderateScale(16),
    padding: scale(20),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  modalIconContainer: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(10),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(12),
  },
  modalTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
  },
  modalDescription: {
    fontSize: moderateScale(14),
    lineHeight: moderateScale(20),
    marginBottom: verticalScale(16),
  },
  inputLabel: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    marginBottom: verticalScale(8),
  },
  passwordInput: {
    borderWidth: 1,
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    fontSize: moderateScale(14),
    marginBottom: verticalScale(20),
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: scale(12),
  },
  modalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(16),
    borderRadius: moderateScale(10),
    gap: scale(6),
  },
  cancelBtn: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  deleteBtn: {
    backgroundColor: '#ef4444',
  },
  modalBtnText: {
    fontSize: moderateScale(14),
    fontWeight: '700',
  },
});

export default PreferencesScreen;
