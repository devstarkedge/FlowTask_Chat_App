import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  Platform,
} from "react-native";
import { useUIStore } from "../stores/uiStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { disconnectSocket } from "../services/socket";
import {
  X,
  Hash,
  MessageSquare,
  User,
  Settings,
  HelpCircle,
  LogOut,
  Plus,
  UserPlus,
  Bell,
  Bookmark,
  AtSign,
  Home,
  ChevronDown,
  Lock,
  Volume2,
  Edit3,
  Clock,
} from "lucide-react-native";

const { width } = Dimensions.get("window");
const DRAWER_WIDTH = width * 0.85;

const DrawerNavigation = ({ navigation }) => {
  const { isDrawerOpen, closeDrawer } = useUIStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { user, logout } = useAuthStore();
  const { colors } = useThemeStore();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isDrawerOpen ? 0 : -DRAWER_WIDTH,
      duration: 280,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [isDrawerOpen]);

  const handleLogout = async () => {
    closeDrawer();
    disconnectSocket();
    await logout();
  };

  const navigate = (screen) => {
    closeDrawer();
    navigation.navigate(screen);
  };

  if (!isDrawerOpen) return null;

  const styles = createStyles(colors);

  return (
    <View style={styles.overlay}>
      <StatusBar
        barStyle={
          colors.effectiveTheme === "dark" ? "light-content" : "dark-content"
        }
      />
      <Pressable onPress={closeDrawer}>
        <View style={styles.backdrop} />
      </Pressable>

      <Animated.View
        style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Workspace Header */}
          <View style={styles.header}>
            <View style={styles.workspaceInfo}>
              <View style={styles.workspaceLogo}>
                <Text style={styles.workspaceLogoText}>
                  {activeWorkspace?.name?.substring(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.workspaceDetails}>
                <View style={styles.workspaceNameRow}>
                  <Text style={styles.workspaceName} numberOfLines={1}>
                    {activeWorkspace?.name}
                  </Text>
                  <ChevronDown size={16} color={colors.sidebarText} />
                </View>
                <View style={styles.userStatus}>
                  <View style={styles.statusDot} />
                  <Text style={styles.userName} numberOfLines={1}>
                    {user?.name}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={closeDrawer} style={styles.closeButton}>
              <X size={24} color={colors.sidebarText} />
            </TouchableOpacity>
          </View>

          {/* Navigation */}
          <View style={styles.section}>
            <MenuItem
              icon={Home}
              label="Home"
              onPress={() => navigate("HomeTab")}
              colors={colors}
            />
            <MenuItem
              icon={Hash}
              label="Channels"
              onPress={() => navigate("HomeTab")}
              colors={colors}
            />
            <MenuItem
              icon={MessageSquare}
              label="Direct Messages"
              onPress={() => navigate("DMsTab")}
              colors={colors}
            />
            <MenuItem
              icon={Bell}
              label="Activity"
              onPress={() => navigate("ActivityTab")}
              colors={colors}
            />
          </View>

          {/* Quick Access */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>QUICK ACCESS</Text>
            <MenuItem
              icon={Bookmark}
              label="Saved Items"
              onPress={() => {
                closeDrawer();
                navigation.navigate("Later");
              }}
              colors={colors}
            />
            <MenuItem
              icon={MessageSquare}
              label="Threads"
              onPress={() => {
                closeDrawer();
                navigation.navigate("Threads");
              }}
              colors={colors}
            />
            <MenuItem
              icon={Edit3}
              label="Drafts"
              onPress={() => {
                closeDrawer();
                navigation.navigate("Drafts");
              }}
              colors={colors}
            />
            <MenuItem
              icon={Clock}
              label="Scheduled"
              onPress={() => {
                closeDrawer();
                navigation.navigate("Scheduled");
              }}
              colors={colors}
            />
          </View>

          {/* Workspace Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>WORKSPACE</Text>
            <MenuItem
              icon={Plus}
              label="Create Channel"
              onPress={closeDrawer}
              colors={colors}
            />
            <MenuItem
              icon={Hash}
              label="Browse Channels"
              onPress={closeDrawer}
              colors={colors}
            />
            <MenuItem
              icon={UserPlus}
              label="Invite Members"
              onPress={closeDrawer}
              colors={colors}
            />
          </View>

          {/* Account */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
            <MenuItem
              icon={User}
              label="Profile"
              onPress={() => navigate("MoreTab")}
              colors={colors}
            />
            <MenuItem
              icon={Settings}
              label="Settings"
              onPress={() => navigate("Settings")}
              colors={colors}
            />
            <MenuItem
              icon={HelpCircle}
              label="Help & Support"
              onPress={closeDrawer}
              colors={colors}
            />
            <MenuItem
              icon={LogOut}
              label="Logout"
              onPress={handleLogout}
              danger
              colors={colors}
            />
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const MenuItem = ({ icon: Icon, label, onPress, danger, colors }) => {
  const styles = createStyles(colors);

  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Icon size={20} color={danger ? colors.error : colors.sidebarText} />
      <Text style={[styles.menuLabel, danger && { color: colors.error }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1000,
    },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
    },
    drawer: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: DRAWER_WIDTH,
      backgroundColor: colors.sidebar,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      padding: 20,
      paddingTop: 60,
      borderBottomWidth: 1,
      borderBottomColor: colors.sidebarHover,
    },
    workspaceInfo: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      flex: 1,
    },
    workspaceLogo: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.sidebarActive,
      justifyContent: "center",
      alignItems: "center",
    },
    workspaceLogoText: {
      color: colors.sidebarActiveText,
      fontWeight: "800",
      fontSize: 20,
    },
    workspaceDetails: {
      flex: 1,
    },
    workspaceNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    workspaceName: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.sidebarText,
      flex: 1,
    },
    userStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.online,
    },
    userName: {
      fontSize: 14,
      color: colors.sidebarText,
      opacity: 0.8,
      flex: 1,
    },
    closeButton: {
      padding: 4,
    },
    section: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.sidebarHover,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.sidebarText,
      opacity: 0.6,
      paddingHorizontal: 20,
      paddingVertical: 8,
      letterSpacing: 0.5,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 12,
    },
    menuLabel: {
      fontSize: 15,
      color: colors.sidebarText,
      fontWeight: "500",
    },
  });

export default DrawerNavigation;
