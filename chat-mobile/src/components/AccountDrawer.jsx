import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Animated,
  Platform,
} from "react-native";
import AccessibleModal from "./AccessibleModal";
import { useThemeStore } from "../stores/themeStore";
import { useAuthStore } from "../stores/authStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useLaterStore } from "../stores/laterStore";
import { useThreadStore } from "../stores/threadStore";
import { useDraftStore } from "../stores/draftStore";
import { useScheduledStore } from "../stores/scheduledStore";
import { disconnectSocket } from "../services/socket";
import StatusModal from "./StatusModal";
import PauseNotificationsModal from "./PauseNotificationsModal";
import PresenceModal from "./PresenceModal";
import {
  X,
  User,
  Settings,
  Bell,
  Lock,
  Key,
  Bookmark,
  MessageSquare,
  Edit3,
  Clock,
  Users,
  UserPlus,
  Hash,
  BellOff,
  Activity,
  FileText,
  Send,
  LogOut,
  ChevronRight,
  Smile,
} from "lucide-react-native";
import { rnShadowToBoxShadow } from "../utils/styleUtils";

const AccountDrawer = ({ visible, onClose, navigation }) => {
  const { colors } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { savedCount = 0 } = useLaterStore();
  const { unreadThreadCount = 0 } = useThreadStore();
  const { draftCount = 0 } = useDraftStore();
  const { scheduledCount = 0 } = useScheduledStore();
  const [slideAnim] = useState(new Animated.Value(0));
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [pauseNotificationsVisible, setPauseNotificationsVisible] =
    useState(false);
  const [presenceModalVisible, setPresenceModalVisible] = useState(false);

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: Platform.OS !== "web",
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    }
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  const handleLogout = async () => {
    onClose();
    disconnectSocket();
    await logout();
  };

  const handleClose = () => {
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }
    onClose();
  };

  const navigateTo = (screen) => {
    onClose();
    navigation.navigate(screen);
  };

  const styles = createStyles(colors);

  const MenuItem = ({
    icon: Icon,
    label,
    onPress,
    badge,
    showChevron = true,
  }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Icon size={22} color={colors.textPrimary} strokeWidth={1.5} />
      <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>
        {label}
      </Text>
      {badge && (
        <View
          style={[styles.badge, { backgroundColor: colors.badgeBackground }]}
        >
          <Text style={[styles.badgeText, { color: colors.badgeText }]}>
            {badge}
          </Text>
        </View>
      )}
      {showChevron && <ChevronRight size={20} color={colors.textTertiary} />}
    </TouchableOpacity>
  );

  const SectionDivider = () => (
    <View style={[styles.divider, { backgroundColor: colors.border }]} />
  );

  const SectionTitle = ({ title }) => (
    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
      {title}
    </Text>
  );

  return (
    <AccessibleModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[
            styles.drawer,
            { backgroundColor: colors.background, transform: [{ translateY }] },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              You
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Profile Section */}
            <View style={styles.profileSection}>
              <View
                style={[styles.avatar, { backgroundColor: colors.primary }]}
              >
                <Text
                  style={[styles.avatarText, { color: colors.textInverse }]}
                >
                  {user?.name?.substring(0, 1).toUpperCase()}
                </Text>
                <View
                  style={[
                    styles.statusIndicator,
                    { backgroundColor: colors.online },
                  ]}
                />
              </View>
              <Text style={[styles.userName, { color: colors.textPrimary }]}>
                {user?.name}
              </Text>
              <View style={styles.statusRow}>
                <View
                  style={[styles.statusDot, { backgroundColor: colors.online }]}
                />
                <Text
                  style={[styles.statusText, { color: colors.textSecondary }]}
                >
                  Active
                </Text>
              </View>
            </View>

            {/* Status Section */}
            <TouchableOpacity
              style={[
                styles.statusCard,
                { backgroundColor: colors.backgroundSecondary },
              ]}
              onPress={() => {
                if (Platform.OS === 'web') {
                  document.activeElement?.blur();
                  setTimeout(() => setStatusModalVisible(true), 0);
                } else {
                  setStatusModalVisible(true);
                }
              }}
              activeOpacity={0.7}
            >
              <Smile size={20} color={colors.textSecondary} />
              <Text
                style={[styles.statusCardText, { color: colors.textSecondary }]}
              >
                What's your status?
              </Text>
            </TouchableOpacity>

            <SectionDivider />

            {/* Notification Controls */}
            <View style={styles.section}>
              <MenuItem
                icon={BellOff}
                label="Pause notifications"
                onPress={() => {
                  if (Platform.OS === 'web') {
                    document.activeElement?.blur();
                    setTimeout(() => setPauseNotificationsVisible(true), 0);
                  } else {
                    setPauseNotificationsVisible(true);
                  }
                }}
              />
              <MenuItem
                icon={Activity}
                label="Set yourself as away"
                onPress={() => {
                  if (Platform.OS === 'web') {
                    document.activeElement?.blur();
                    setTimeout(() => setPresenceModalVisible(true), 0);
                  } else {
                    setPresenceModalVisible(true);
                  }
                }}
              />
            </View>

            <SectionDivider />

            {/* Profile & Account */}
            <View style={styles.section}>
              <MenuItem
                icon={UserPlus}
                label="Invite members"
                onPress={() => {}}
              />

              <MenuItem
                icon={User}
                label="View profile"
                onPress={() => navigateTo("Profile")}
              />
              <MenuItem
                icon={Bell}
                label="Notification settings"
                onPress={() => navigateTo("Notifications")}
              />
              <MenuItem
                icon={Settings}
                label="Preferences"
                onPress={() => navigateTo("Settings")}
              />
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      </Pressable>

      {/* Modals */}
      <StatusModal
        visible={statusModalVisible}
        onClose={() => setStatusModalVisible(false)}
      />
      <PauseNotificationsModal
        visible={pauseNotificationsVisible}
        onClose={() => setPauseNotificationsVisible(false)}
      />
      <PresenceModal
        visible={presenceModalVisible}
        onClose={() => setPresenceModalVisible(false)}
      />
    </AccessibleModal>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    drawer: {
      maxHeight: "90%",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      ...(Platform.OS !== "web"
        ? {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
          }
        : {
            boxShadow: rnShadowToBoxShadow(
              "#000",
              { width: 0, height: -4 },
              0.15,
              12,
            ),
          }),
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
    },
    closeButton: {
      padding: 4,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
    },
    profileSection: {
      alignItems: "center",
      paddingVertical: 24,
      paddingHorizontal: 20,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 12,
      position: "relative",
    },
    avatarText: {
      fontSize: 32,
      fontWeight: "800",
    },
    statusIndicator: {
      position: "absolute",
      bottom: 2,
      right: 2,
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 3,
      borderColor: "white",
    },
    userName: {
      fontSize: 22,
      fontWeight: "700",
      marginBottom: 6,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 15,
      fontWeight: "500",
    },
    statusCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: 20,
      marginVertical: 12,
      padding: 16,
      borderRadius: 12,
    },
    statusCardText: {
      fontSize: 15,
      fontWeight: "500",
    },
    section: {
      paddingHorizontal: 20,
      paddingVertical: 8,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 4,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      gap: 14,
    },
    menuLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: "500",
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      minWidth: 20,
      alignItems: "center",
    },
    badgeText: {
      fontSize: 11,
      fontWeight: "700",
    },
    divider: {
      height: 1,
      marginVertical: 12,
    },
    logoutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingVertical: 16,
    },
    logoutText: {
      fontSize: 16,
      fontWeight: "600",
    },
  });

export default AccountDrawer;
