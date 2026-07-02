import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import {
  User,
  Mail,
  Briefcase,
  CircleChevronLeft,
  CircleChevronRight,
  Settings,
  Bell,
  Palette,
  LogOut,
} from 'lucide-react-native';
import { AppAvatar } from '../../components/common';

const ProfileScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const { activeWorkspace } = useWorkspaceStore();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <CircleChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={[styles.profileHeader, { backgroundColor: colors.backgroundSecondary }]}>
          <AppAvatar user={user} size={100}  />
          <Text style={[styles.name, { color: colors.textPrimary }]}>{user?.name}</Text>
          <View style={styles.statusRow}>
            {/* <View style={[styles.statusDot, { backgroundColor: colors.online }]} /> */}
            <Text style={[styles.statusText, { color: colors.online }]}>Active</Text>
          </View>
        </View>

        {/* User Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            INFORMATION
          </Text>
          
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <InfoRow
              icon={User}
              label="Full Name"
              value={user?.name}
              colors={colors}
            />
            <InfoRow
              icon={Mail}
              label="Email"
              value={user?.email}
              colors={colors}
            />
            <InfoRow
              icon={Briefcase}
              label="Role"
              value={user?.role || 'Member'}
              colors={colors}
            />
            <InfoRow
              icon={Briefcase}
              label="Workspace"
              value={activeWorkspace?.name}
              colors={colors}
            />
          </View>
        </View>

        {/* Quick Links */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            SETTINGS
          </Text>
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <LinkRow icon={Palette} label="Preferences" colors={colors} onPress={() => navigation.navigate('Preferences')} />
            <LinkRow icon={Bell} label="Notifications" colors={colors} onPress={() => navigation.navigate('Notifications')} />
          </View>
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <TouchableOpacity style={styles.logoutRow} onPress={logout} activeOpacity={0.7}>
              <LogOut size={20} color={colors.error} />
              <Text style={[styles.logoutLabel, { color: colors.error }]}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const InfoRow = ({ icon: Icon, label, value, colors }) => {
  const styles = createStyles(colors);
  
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <Icon size={20} color={colors.textSecondary} />
        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
      </View>
      <Text style={[styles.infoValue, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
};

const LinkRow = ({ icon: Icon, label, colors, onPress }) => (
  <TouchableOpacity style={prStyles.linkRow} onPress={onPress} activeOpacity={0.7}>
    <Icon size={20} color={colors.textSecondary} />
    <Text style={[prStyles.linkLabel, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
    <CircleChevronRight size={20} color={colors.textTertiary} />
  </TouchableOpacity>
);

const prStyles = StyleSheet.create({
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  linkLabel: { fontSize: 15, fontWeight: '500' },
});

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
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '800',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
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
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  logoutLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ProfileScreen;
