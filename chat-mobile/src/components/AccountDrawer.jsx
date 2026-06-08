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
import Avatar from "./Avatar";
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
  CircleChevronRight ,
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
  }) => {
    const [pressed, setPressed] = useState(false);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.menuItem,
          pressed && { backgroundColor: colors.backgroundSecondary },
        ]}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
      >
        <View style={styles.menuIconContainer}>
          <Icon size={22} color={colors.primary} strokeWidth={1.8} />
        </View>
        <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>
          {label}
        </Text>
        {badge && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: "white" }]}>{badge}</Text>
          </View>
        )}
        {showChevron && <CircleChevronRight size={20} color={colors.textTertiary} />}
      </Pressable>
    );
  };

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
            {
              backgroundColor: colors.background,
              transform: [{ translateY }],
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.textPrimary} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Account
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Profile Section */}
            <View style={styles.profileSection}>
              <View style={styles.avatarWrapper}>
                <Avatar user={user} size={80} />
              </View>
              <Text style={[styles.userName, { color: colors.textPrimary }]}>
                {user?.name}
              </Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: colors.online || "#31a24c" },
                  ]}
                />
                <Text
                  style={[styles.statusText, { color: colors.textSecondary }]}
                >
                  Active
                </Text>
              </View>
            </View>

            {/* Status Section */}
            <View style={styles.statusCardContainer}>
              <TouchableOpacity
                style={[
                  styles.statusCard,
                  {
                    backgroundColor:
                      colors.primary + "15" || "rgba(0,0,0,0.05)",
                    borderColor: colors.primary + "30" || "rgba(0,0,0,0.1)",
                  },
                ]}
                onPress={() => {
                  if (Platform.OS === "web") {
                    document.activeElement?.blur();
                    setTimeout(() => setStatusModalVisible(true), 0);
                  } else {
                    setStatusModalVisible(true);
                  }
                }}
                activeOpacity={0.7}
              >
                <Smile size={20} color={colors.primary} strokeWidth={2} />
                <Text
                  style={[
                    styles.statusCardText,
                    { color: colors.textSecondary },
                  ]}
                >
                  What's your status?
                </Text>
              </TouchableOpacity>
            </View>

            <SectionDivider />

            {/* Notification Controls */}
            <View style={styles.section}>
              <MenuItem
                icon={BellOff}
                label="Pause notifications"
                onPress={() => {
                  if (Platform.OS === "web") {
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
                  if (Platform.OS === "web") {
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
                onPress={() => navigateTo("Preferences")}
              />
            </View>

            {/* <SectionDivider /> */}

            {/* Logout Section */}
            {/* <View style={styles.section}>
              <MenuItem
                icon={LogOut}
                label="Sign out"
                onPress={handleLogout}
                showChevron={false}
              />
            </View> */}

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
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      ...(Platform.OS !== "web"
        ? {
            boxShadow: "0px -4px 12px rgba(0, 0, 0, 0.15)",
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
      padding: 8,
      borderRadius: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.5,
    },
    profileSection: {
      alignItems: "center",
      paddingVertical: 28,
      paddingHorizontal: 20,
    },
    avatarWrapper: {
      marginBottom: 16,
      boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.1)",
      elevation: 4,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: "center",
      alignItems: "center",
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
      fontSize: 24,
      fontWeight: "800",
      marginBottom: 8,
      letterSpacing: -0.5,
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
      fontSize: 14,
      fontWeight: "500",
    },
    statusCardContainer: {
      paddingHorizontal: 20,
      marginVertical: 12,
    },
    statusCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    statusCardText: {
      fontSize: 15,
      fontWeight: "600",
    },
    section: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 4,
      paddingHorizontal: 8,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 8,
      marginVertical: 2,
      borderRadius: 12,
      gap: 14,
      transition: "background-color 200ms ease",
    },
    menuIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.02)",
    },
    menuLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: "500",
      letterSpacing: -0.3,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      minWidth: 24,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "700",
    },
    divider: {
      height: 1,
      marginVertical: 12,
      marginHorizontal: 20,
      opacity: 0.5,
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
