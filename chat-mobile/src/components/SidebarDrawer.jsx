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
  Platform,
} from "react-native";
import { useUIStore } from "../stores/uiStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAuthStore } from "../stores/authStore";
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
} from "lucide-react-native";
import { rnShadowToBoxShadow } from "../utils/styleUtils";

const { width } = Dimensions.get("window");
const DRAWER_WIDTH = width * 0.8;

const SidebarDrawer = ({ navigation }) => {
  const { isDrawerOpen, closeDrawer } = useUIStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { user, logout } = useAuthStore();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isDrawerOpen ? 0 : -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [isDrawerOpen]);

  const handleLogout = async () => {
    closeDrawer();
    disconnectSocket();
    await logout();
  };

  const handleCloseDrawer = () => {
    if (Platform.OS === "web" && document.activeElement) {
      document.activeElement.blur();
    }

    closeDrawer();
  };

  const navigate = (screen) => {
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }

    closeDrawer();
    navigation.navigate(screen);
  };

  if (!isDrawerOpen) return null;

  return (
    <View style={styles.overlay}>
      <Pressable onPress={handleCloseDrawer}>
        <View style={styles.backdrop} />
      </Pressable>

      <Animated.View
        style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.workspaceInfo}>
              <View style={styles.workspaceLogo}>
                <Text style={styles.workspaceLogoText}>
                  {activeWorkspace?.name?.substring(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.workspaceDetails}>
                <Text style={styles.workspaceName}>
                  {activeWorkspace?.name}
                </Text>
                <Text style={styles.userName}>{user?.name}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleCloseDrawer}
              style={styles.closeButton}
            >
              <X size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Navigation */}
          <View style={styles.section}>
            <MenuItem
              icon={Hash}
              label="Channels"
              onPress={() => navigate("Chats")}
            />
            <MenuItem
              icon={MessageSquare}
              label="Direct Messages"
              onPress={() => navigate("DMs")}
            />
            <MenuItem
              icon={User}
              label="Profile"
              onPress={() => navigate("Profile")}
            />
          </View>

          {/* Workspace Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>WORKSPACE</Text>
            <MenuItem
              icon={Plus}
              label="Create Channel"
              onPress={handleCloseDrawer}
            />
            <MenuItem icon={Hash} label="Join Channel" onPress={handleCloseDrawer} />
            <MenuItem
              icon={UserPlus}
              label="Invite Members"
              onPress={handleCloseDrawer}
            />
          </View>

          {/* Account */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
            <MenuItem
              icon={Settings}
              label="Settings"
              onPress={() => navigate("Settings")}
            />
            <MenuItem
              icon={HelpCircle}
              label="Help & Support"
              onPress={handleCloseDrawer}
            />
            <MenuItem
              icon={LogOut}
              label="Logout"
              onPress={handleLogout}
              danger
            />
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const MenuItem = ({ icon: Icon, label, onPress, danger }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress}><Icon size={20} color={danger ? "#ef4444" : "#6b7280"} /><Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text></TouchableOpacity>
);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "white",
    ...(Platform.OS !== "web"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 2, height: 0 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 5,
        }
      : {
          boxShadow: rnShadowToBoxShadow(
            "#000",
            { width: 2, height: 0 },
            0.25,
            8,
          ),
        }),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  workspaceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  workspaceLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#6366f1",
    justifyContent: "center",
    alignItems: "center",
  },
  workspaceLogoText: {
    color: "white",
    fontWeight: "800",
    fontSize: 20,
  },
  workspaceDetails: {
    flex: 1,
  },
  workspaceName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  userName: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  section: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
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
    color: "#374151",
    fontWeight: "500",
  },
  menuLabelDanger: {
    color: "#ef4444",
  },
});

export default SidebarDrawer;
