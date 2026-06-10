import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { useNotificationStore } from "../stores/notificationStore";
import { useLaterStore } from "../stores/laterStore";
import { useDraftStore } from "../stores/draftStore";
import { useThreadStore } from "../stores/threadStore";
import { disconnectSocket } from "../services/socket";
import { AppAvatar } from "../components/common";
import StatusModal from "../components/StatusModal";
import {
  Bookmark,
  MessageSquare,
  Edit3,
  Clock,
  FileText,
  Bell,
  Settings,
  Users,
  User,
  LogOut,
  ChevronRight,
  Smile,
} from "lucide-react-native";

// ─── Row (Slack-style: icon + label + badge + chevron) ───────────────────────

const YouRow = ({ icon: Icon, label, badge, onPress, colors, danger }) => (
  <TouchableOpacity
    style={youRowStyles.row}
    onPress={onPress}
    activeOpacity={0.5}
  >
    <Icon size={18} color={danger ? colors.danger : colors.textSecondary} />
    <Text
      style={[
        youRowStyles.label,
        {
          color: danger ? colors.danger : colors.textPrimary,
        },
      ]}
    >
      {label}
    </Text>
    {badge > 0 && (
      <Text style={[youRowStyles.badge, { color: colors.primary }]}>
        {badge > 99 ? "99+" : badge}
      </Text>
    )}
    <View style={{ flex: 1 }} />
    <ChevronRight size={16} color={colors.textTertiary} />
  </TouchableOpacity>
);

const youRowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
  },
  badge: {
    fontSize: 13,
    fontWeight: "700",
  },
});

// ─── Main Component ──────────────────────────────────────────────────────────

const YouScreen = ({ navigation }) => {
  if (!navigation) navigation = { navigate: () => {} };

  const { colors, effectiveTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const { savedCount } = useLaterStore();
  const { draftCount } = useDraftStore();
  const { unreadThreadCount } = useThreadStore();

  const [statusModalVisible, setStatusModalVisible] = useState(false);

  const handleLogout = useCallback(async () => {
    disconnectSocket();
    await logout();
  }, [logout]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>You</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile section — flat, no card */}
        <View style={styles.profileCard}>
          <AppAvatar user={user} size={64} showStatus statusSize={12} />
          <Text style={[styles.profileName, { color: colors.textPrimary }]}>
            {user?.name || "Unknown"}
          </Text>
          <Text style={[styles.profileEmail, { color: colors.textTertiary }]}>
            {user?.email || ""}
          </Text>
          <TouchableOpacity
            style={[styles.statusBtn, { borderColor: colors.border }]}
            onPress={() => setStatusModalVisible(true)}
          >
            <Smile size={14} color={colors.textTertiary} />
            <Text style={[styles.statusBtnText, { color: colors.textTertiary }]}>
              {user?.customStatus?.text || "Set a status"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Saved & Drafts */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
            SAVED & DRAFTS
          </Text>
          <YouRow icon={Bookmark} label="Saved items" badge={savedCount} onPress={() => navigation.navigate("Later")} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <YouRow icon={MessageSquare} label="Threads" badge={unreadThreadCount} onPress={() => navigation.navigate("Threads")} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <YouRow icon={Edit3} label="Drafts" badge={draftCount} onPress={() => navigation.navigate("Drafts")} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <YouRow icon={Clock} label="Scheduled" onPress={() => navigation.navigate("Scheduled")} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <YouRow icon={FileText} label="Files" onPress={() => navigation.navigate("Files")} colors={colors} />
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
            SETTINGS
          </Text>
          <YouRow icon={Bell} label="Notifications" badge={unreadCount} onPress={() => navigation.navigate("Notifications")} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <YouRow icon={Settings} label="Preferences" onPress={() => navigation.navigate("Preferences")} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <YouRow icon={Users} label="People" onPress={() => navigation.navigate("People")} colors={colors} />
        </View>

        {/* Account */}
        <View style={[styles.section, { marginBottom: 40 }]}>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
            ACCOUNT
          </Text>
          <YouRow icon={User} label="View profile" onPress={() => navigation.navigate("Profile")} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <YouRow icon={LogOut} label="Sign out" onPress={handleLogout} colors={colors} danger />
        </View>
      </ScrollView>

      <StatusModal
        visible={statusModalVisible}
        onClose={() => setStatusModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  profileCard: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  profileEmail: {
    fontSize: 13,
  },
  statusBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    gap: 6,
  },
  statusBtnText: {
    fontSize: 13,
  },
  section: {
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  divider: {
    height: 1,
    marginLeft: 46,
  },
});

export default YouScreen;
