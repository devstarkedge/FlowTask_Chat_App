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
  TouchableWithoutFeedback,
} from "react-native";
import AccessibleModal from "./AccessibleModal";
import AppAvatar from "./common/AppAvatar";
import { useThemeStore } from "../stores/themeStore";
import { useAuthStore } from "../stores/authStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useLaterStore } from "../stores/laterStore";
import { useThreadStore } from "../stores/threadStore";
import { useDraftStore } from "../stores/draftStore";
import { useScheduledStore } from "../stores/scheduledStore";
import { disconnectSocket } from "../services/socket";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "../utils/i18n";
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
  CircleChevronRight,
  Smile,
  LogOut as LogOutIcon,
} from "lucide-react-native";
import { rnShadowToBoxShadow } from "../utils/styleUtils";
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const AccountDrawer = ({ visible, onClose, navigation }) => {
  const { colors } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { activeWorkspace, leaveWorkspace } = useWorkspaceStore();
  const { savedCount = 0 } = useLaterStore();
  const { unreadThreadCount = 0 } = useThreadStore();
  const { draftCount = 0 } = useDraftStore();
  const { scheduledCount = 0 } = useScheduledStore();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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
    color,
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
          <Icon size={22} color={color || colors.primary} strokeWidth={1.8} />
        </View>
        <Text style={[styles.menuLabel, { color: color || colors.textPrimary }]}>
          {label}
        </Text>
        {badge && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: colors.textOnPrimary }]}>{badge}</Text>
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
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <Animated.View
              style={[
                styles.drawer,
                {
                  backgroundColor: colors.background,
                  transform: [{ translateY }],
                },
              ]}
            >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.textPrimary} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {t("You")}
            </Text>
            <View style={{ width: scale(40) }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Profile Section */}
            <View style={styles.profileSection}>
              <View style={styles.profileRow}>
                  <View style={styles.avatarWrapper}>
                  <AppAvatar user={user} size={56} showStatus />
                </View>
                <View style={styles.profileInfo}>
                  <Text style={[styles.userName, { color: colors.textPrimary }]}>
                    {user?.name}
                  </Text>
                  <View style={styles.statusRow}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: user?.onlineStatus === 'away' ? colors.away : user?.onlineStatus === 'dnd' ? colors.busy : colors.online },
                      ]}
                    />
                    <Text
                      style={[styles.statusText, { color: colors.textSecondary }]}
                    >
                      {user?.onlineStatus === 'away' ? t("Away") : user?.onlineStatus === 'dnd' ? t("Do Not Disturb") : t("Active")}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Status Section */}
            <View style={styles.statusCardContainer}>
              <TouchableOpacity
                style={[
                  styles.statusCard,
                  {
                    backgroundColor: colors.primaryOverlay,
                    borderColor: colors.primaryOverlayBorder,
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
                  numberOfLines={1}
                >
                  {user?.customStatus?.text
                    ? `${user.customStatus.emoji || '💬'} ${user.customStatus.text}`
                    : t("What's your status?")}
                </Text>
              </TouchableOpacity>
            </View>

            <SectionDivider />

            {/* Notification Controls */}
            <View style={styles.section}>
              <MenuItem
                icon={BellOff}
                label={t("Pause notifications")}
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
                label={t("Set yourself as away")}
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
                label={t("Invite members")}
                onPress={() => navigateTo("InviteManagement")}
              />

              {activeWorkspace && (
                <MenuItem
                  icon={Settings}
                  label={t("Workspace Settings")}
                  onPress={() => navigateTo("WorkspaceSettings")}
                />
              )}

              <MenuItem
                icon={User}
                label={t("View profile")}
                onPress={() => navigateTo("Profile")}
              />
              <MenuItem
                icon={Settings}
                label={t("Preferences")}
                onPress={() => navigateTo("Preferences")}
              />
            </View>

            <SectionDivider />

            <View style={styles.section}>
              <MenuItem
                icon={LogOut}
                label={t("Sign out")}
                onPress={handleLogout}
                showChevron={false}
                color={colors.error}
              />
            </View>

            <View style={{ height: Math.max(insets.bottom, 20) }} />
          </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

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
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
    },
    drawer: {
      maxHeight: "90%",
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      ...(Platform.OS !== "web"
        ? {
            boxShadow: `0px -4px 12px ${colors.shadowMd}`,
          }
        : {
            boxShadow: rnShadowToBoxShadow(
              '#000',
              { width: scale(0), height: -4 },
              0.15,
              12,
            ),
          }),
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(16),
      borderBottomWidth: 1,
    },
    closeButton: {
      padding: moderateScale(8),
      borderRadius: moderateScale(8),
    },
    headerTitle: {
      fontSize: moderateScale(18),
      fontWeight: "700",
      letterSpacing: -0.5,
    },
    profileSection: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(16),
    },
    profileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    profileInfo: {
      flex: 1,
    },
    avatarWrapper: {
      shadowColor: '#000',
      shadowOffset: { width: scale(0), height: verticalScale(2) },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    avatar: {
      width: scale(80),
      height: verticalScale(80),
      borderRadius: moderateScale(40),
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
    },
    avatarText: {
      fontSize: moderateScale(32),
      fontWeight: "800",
    },
    statusIndicator: {
      position: "absolute",
      bottom: verticalScale(2),
      right: scale(2),
      width: scale(20),
      height: verticalScale(20),
      borderRadius: moderateScale(10),
      borderWidth: 3,
      borderColor: colors.background,
    },
    userName: {
      fontSize: moderateScale(18),
      fontWeight: "800",
      marginBottom: verticalScale(4),
      letterSpacing: -0.3,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    statusDot: {
      width: scale(8),
      height: verticalScale(8),
      borderRadius: moderateScale(4),
    },
    statusText: {
      fontSize: moderateScale(14),
      fontWeight: "500",
    },
    statusCardContainer: {
      paddingHorizontal: scale(20),
      marginVertical: verticalScale(12),
    },
    statusCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: moderateScale(16),
      borderRadius: moderateScale(14),
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    statusCardText: {
      fontSize: moderateScale(15),
      fontWeight: "600",
    },
    section: {
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(8),
    },
    sectionTitle: {
      fontSize: moderateScale(11),
      fontWeight: "700",
      letterSpacing: 0.5,
      marginBottom: verticalScale(8),
      marginTop: verticalScale(4),
      paddingHorizontal: scale(8),
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: verticalScale(12),
      paddingHorizontal: scale(8),
      marginVertical: verticalScale(2),
      borderRadius: moderateScale(12),
      gap: 14,
      transition: "background-color 200ms ease",
    },
    menuIconContainer: {
      width: scale(36),
      height: verticalScale(36),
      borderRadius: moderateScale(10),
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.backgroundSecondary,
    },
    menuLabel: {
      flex: 1,
      fontSize: moderateScale(16),
      fontWeight: "500",
      letterSpacing: -0.3,
    },
    badge: {
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
      borderRadius: moderateScale(12),
      minWidth: scale(24),
      alignItems: "center",
      justifyContent: "center",
      marginRight: scale(8),
    },
    badgeText: {
      fontSize: moderateScale(12),
      fontWeight: "700",
    },
    divider: {
      height: verticalScale(1),
      marginVertical: verticalScale(12),
      marginHorizontal: scale(20),
      opacity: 0.5,
    },
    logoutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingVertical: verticalScale(16),
    },
    logoutText: {
      fontSize: moderateScale(16),
      fontWeight: "600",
    },
  });

export default AccountDrawer;
