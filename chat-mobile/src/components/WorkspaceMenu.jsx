import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useThemeStore } from "../stores/themeStore";
import {
  Plus,
  Settings,
  HelpCircle,
  MoreHorizontal,
} from "lucide-react-native";
import { rnShadowToBoxShadow } from "../utils/styleUtils";

const { width } = Dimensions.get("window");
const DRAWER_WIDTH = width * 0.85;

const WorkspaceMenu = ({ visible, onClose, navigation }) => {
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspaceStore();
  const { colors } = useThemeStore();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -DRAWER_WIDTH,
      duration: 300,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [visible]);

  const handleWorkspaceSwitch = async (workspaceId) => {
    await switchWorkspace(workspaceId);
    onClose();
  };

  const handleClose = () => {
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }

    onClose();
  };

  const styles = createStyles(colors);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable onPress={handleClose}>
        <View style={styles.backdrop} />
      </Pressable>

      <Animated.View
        style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Workspaces</Text>
        </View>

        <ScrollView
          style={styles.workspaceList}
          showsVerticalScrollIndicator={false}
        >
          {workspaces.map((workspace) => (
            <TouchableOpacity
              key={workspace._id}
              style={[
                styles.workspaceItem,
                workspace._id === activeWorkspace?._id &&
                  styles.activeWorkspace,
              ]}
              onPress={() => handleWorkspaceSwitch(workspace._id)}
              activeOpacity={0.7}
            >
              <View style={styles.workspaceContent}>
                <View
                  style={[
                    styles.workspaceLogo,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.workspaceLogoText}>
                    {workspace.name?.substring(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.workspaceInfo}>
                  <Text style={styles.workspaceName}>{workspace.name}</Text>
                  <Text style={styles.workspaceUrl}>
                    {workspace.slug}.flowtask.com
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.moreButton}>
                <MoreHorizontal size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={() => {
              onClose();
              navigation?.navigate("CreateWorkspace");
            }}
          >
            <Plus size={20} color={colors.textPrimary} />
            <Text style={styles.footerButtonText}>Add a Workspace</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.footerButton}
            onPress={() => {
              onClose();
              navigation?.navigate("Settings");
            }}
          >
            <Settings size={20} color={colors.textPrimary} />
            <Text style={styles.footerButtonText}>Preferences</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.footerButton} onPress={handleClose}>
            <HelpCircle size={20} color={colors.textPrimary} />
            <Text style={styles.footerButtonText}>Help</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
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
      backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    drawer: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: DRAWER_WIDTH,
      backgroundColor: colors.card,
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
      padding: 24,
      paddingTop: 60,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    workspaceList: {
      flex: 1,
    },
    workspaceItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      marginHorizontal: 12,
      marginVertical: 4,
      borderRadius: 12,
    },
    activeWorkspace: {
      backgroundColor: colors.backgroundSecondary,
    },
    workspaceContent: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 12,
    },
    workspaceLogo: {
      width: 56,
      height: 56,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    workspaceLogoText: {
      color: "white",
      fontSize: 24,
      fontWeight: "700",
    },
    workspaceInfo: {
      flex: 1,
    },
    workspaceName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    workspaceUrl: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    moreButton: {
      padding: 8,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingBottom: 20,
    },
    footerButton: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      paddingHorizontal: 24,
      gap: 12,
    },
    footerButtonText: {
      fontSize: 15,
      fontWeight: "500",
      color: colors.textPrimary,
    },
  });

export default WorkspaceMenu;
