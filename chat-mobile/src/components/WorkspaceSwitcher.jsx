import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
} from "react-native";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useThemeStore } from "../stores/themeStore";
import {
  Plus,
  Settings,
  HelpCircle,
  MoreVertical,
  UserPlus,
  LogOut,
  X,
} from "lucide-react-native";
import { useAuthStore } from "../stores/authStore";
import { disconnectSocket } from "../services/socket";
import { workspaceAPI } from "../services/api";
import { rnShadowToBoxShadow } from "../utils/styleUtils";
import AccessibleModal from "./AccessibleModal";
import WorkspaceAvatar from "./WorkspaceAvatar";

const { width } = Dimensions.get("window");
const DRAWER_WIDTH = width * 0.85;

const WorkspaceSwitcher = ({ visible, onClose, navigation }) => {
  const {
    workspaces,
    activeWorkspace,
    switchWorkspace,
    fetchWorkspaces,
    isLoading,
    error,
  } = useWorkspaceStore();
  const { colors } = useThemeStore();
  const { logout } = useAuthStore();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const [actionMenuVisible, setActionMenuVisible] = useState(null);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  useEffect(() => {
    if (visible) {
      fetchWorkspaces();
    }
  }, [visible]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -DRAWER_WIDTH,
      duration: 300,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [visible]);

  const handleWorkspaceSwitch = async (workspaceId) => {
    if (workspaceId === activeWorkspace?._id) {
      if (Platform.OS === "web") {
        document.activeElement?.blur();
      }
      onClose();
      return;
    }
    await switchWorkspace(workspaceId);
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }
    onClose();
  };

  const handleSignOutFromWorkspace = (workspace) => {
    Alert.alert(
      "Sign out from workspace?",
      "You will stop receiving updates from this workspace until you join again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              setActionMenuVisible(null);
              await workspaceAPI.leave(workspace._id);

              if (workspace._id === activeWorkspace?._id) {
                const otherWorkspace = workspaces.find(
                  (w) => w._id !== workspace._id,
                );
                if (otherWorkspace) {
                  await switchWorkspace(otherWorkspace._id);
                } else {
                  onClose();
                  navigation?.navigate("WorkspaceSelector");
                }
              }

              await fetchWorkspaces();
            } catch (error) {
              Alert.alert("Error", "Failed to leave workspace");
            }
          },
        },
      ],
    );
  };

  const handleInviteMembers = (workspace) => {
    setSelectedWorkspace(workspace);
    setActionMenuVisible(null);
    if (Platform.OS === "web") {
      document.activeElement?.blur();
      setTimeout(() => setInviteModalVisible(true), 0);
    } else {
      setInviteModalVisible(true);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert("Error", "Please enter an email address");
      return;
    }

    try {
      await workspaceAPI.inviteByEmail(
        selectedWorkspace._id,
        inviteEmail,
        inviteRole,
      );
      Alert.alert("Success", "Invitation sent successfully");
      setInviteModalVisible(false);
      setInviteEmail("");
      setInviteRole("member");
    } catch (error) {
      Alert.alert(
        "Error",
        error.response?.data?.error?.message || "Failed to send invitation",
      );
    }
  };

  const styles = createStyles(colors);

  const WorkspaceCard = ({ workspace }) => {
    const isActive = workspace._id === activeWorkspace?._id;
    const userRole = workspace.role || "member";

    return (
      <View>
        <TouchableOpacity
          style={[
            styles.workspaceCard,
            {
              backgroundColor: isActive
                ? colors.primary
                : colors.backgroundSecondary,
            },
          ]}
          onPress={() => handleWorkspaceSwitch(workspace._id)}
          activeOpacity={0.7}
        >
          <View style={styles.workspaceContent}>
            <WorkspaceAvatar
              workspace={workspace}
              size={48}
              showBorder
              style={{
                borderWidth: 2,
                borderColor: isActive ? colors.background : colors.border,
              }}
            />
            <View style={styles.workspaceInfo}>
              <Text
                style={[
                  styles.workspaceName,
                  { color: isActive ? colors.textInverse : colors.textPrimary },
                ]}
              >
                {workspace.name}
              </Text>
              <Text
                style={[
                  styles.workspaceRole,
                  {
                    color: isActive ? colors.textInverse : colors.textTertiary,
                    opacity: 0.8,
                  },
                ]}
              >
                {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.moreButton}
            onPress={() =>
              setActionMenuVisible(
                actionMenuVisible === workspace._id ? null : workspace._id,
              )
            }
          >
            <MoreVertical
              size={20}
              color={isActive ? colors.textInverse : colors.textSecondary}
            />
          </TouchableOpacity>
        </TouchableOpacity>

        {actionMenuVisible === workspace._id && (
          <View
            style={[
              styles.actionMenu,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => handleInviteMembers(workspace)}
            >
              <UserPlus size={18} color={colors.textPrimary} />
              <Text
                style={[styles.actionMenuText, { color: colors.textPrimary }]}
              >
                Invite Members
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => handleSignOutFromWorkspace(workspace)}
            >
              <LogOut size={18} color={colors.error} />
              <Text style={[styles.actionMenuText, { color: colors.error }]}>
                Sign Out
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const FooterButton = ({ icon: Icon, label, onPress }) => (
    <TouchableOpacity
      style={styles.footerButton}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.footerButtonIconContainer}>
        <Icon size={20} color={colors.primary} strokeWidth={1.5} />
      </View>
      <Text style={[styles.footerButtonText, { color: colors.textPrimary }]}>
        {label}
      </Text>
      <View style={{ flex: 1 }} />
    </TouchableOpacity>
  );

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable
        onPress={() => {
          if (Platform.OS === "web") {
            document.activeElement?.blur();
          }
          onClose();
        }}
      >
        <View style={styles.backdrop} />
      </Pressable>

      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: colors.background,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Workspaces
          </Text>
        </View>

        <View style={styles.drawerContent}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            scrollEnabled={!isLoading && !error && workspaces.length > 0}
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text
                  style={[styles.loadingText, { color: colors.textSecondary }]}
                >
                  Loading workspaces...
                </Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={[styles.errorText, { color: colors.error }]}>
                  {error}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.retryButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={fetchWorkspaces}
                >
                  <Text
                    style={[
                      styles.retryButtonText,
                      { color: colors.textInverse },
                    ]}
                  >
                    Retry
                  </Text>
                </TouchableOpacity>
              </View>
            ) : workspaces.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  No workspaces found
                </Text>
                <TouchableOpacity
                  style={[
                    styles.createButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={() => {
                    onClose();
                    navigation?.navigate("CreateWorkspace");
                  }}
                >
                  <Text
                    style={[
                      styles.createButtonText,
                      { color: colors.textInverse },
                    ]}
                  >
                    Create Workspace
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.workspaceList}>
                {workspaces.map((workspace) => (
                  <WorkspaceCard key={workspace._id} workspace={workspace} />
                ))}
              </View>
            )}
          </ScrollView>
        </View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <FooterButton
            icon={Plus}
            label="Add a Workspace"
            onPress={() => {
              onClose();
              navigation?.navigate("CreateWorkspace");
            }}
          />
          <FooterButton
            icon={Settings}
            label="Preferences"
            onPress={() => {
              onClose();
              navigation?.navigate("Preferences");
            }}
          />
          <FooterButton
            icon={HelpCircle}
            label="Help"
            onPress={() => {
              onClose();
            }}
          />
        </View>
      </Animated.View>

      <AccessibleModal
        visible={inviteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setInviteModalVisible(false)}
        >
          <View
            style={[styles.inviteModal, { backgroundColor: colors.card }]}
            onStartShouldSetResponder={() => true}
          >
            <View
              style={[
                styles.inviteHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <Text style={[styles.inviteTitle, { color: colors.textPrimary }]}>
                Invite Members
              </Text>
              <TouchableOpacity onPress={() => setInviteModalVisible(false)}>
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.inviteContent}>
              <Text
                style={[styles.inviteLabel, { color: colors.textSecondary }]}
              >
                Email Address
              </Text>
              <TextInput
                style={[
                  styles.inviteInput,
                  {
                    backgroundColor: colors.background,
                    color: colors.textPrimary,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="Enter email address"
                placeholderTextColor={colors.textTertiary}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text
                style={[styles.inviteLabel, { color: colors.textSecondary }]}
              >
                Role
              </Text>
              <View style={styles.roleButtons}>
                {["admin", "member", "guest"].map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleButton,
                      { borderColor: colors.border },
                      inviteRole === role && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => setInviteRole(role)}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        {
                          color:
                            inviteRole === role
                              ? colors.textInverse
                              : colors.textPrimary,
                        },
                      ]}
                    >
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inviteActions}>
              <TouchableOpacity
                style={[
                  styles.inviteButton,
                  { backgroundColor: colors.backgroundSecondary },
                ]}
                onPress={() => setInviteModalVisible(false)}
              >
                <Text
                  style={[
                    styles.inviteButtonText,
                    { color: colors.textPrimary },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.inviteButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleSendInvite}
              >
                <Text
                  style={[
                    styles.inviteButtonText,
                    { color: colors.textInverse },
                  ]}
                >
                  Send Invite
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </AccessibleModal>
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
      flexDirection: "column",
      ...(Platform.OS !== "web"
        ? {
            boxShadow: "2px 0px 8px rgba(0, 0, 0, 0.25)",
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
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700",
      letterSpacing: -0.4,
      marginBottom: 0,
    },
    drawerContent: {
      flex: 1,
      overflow: "hidden",
    },
    workspaceList: {
      paddingVertical: 14,
      paddingHorizontal: 8,
    },
    workspaceCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 6,
      paddingVertical: 7,
      marginHorizontal: 12,
      marginVertical: 8,
      borderRadius: 12,
      ...(Platform.OS !== "web"
        ? {
            boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.08)",
            elevation: 1,
          }
        : {
            boxShadow: rnShadowToBoxShadow(
              "#000",
              { width: 0, height: 2 },
              0.08,
              4,
            ),
          }),
    },
    workspaceContent: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 9,
    },
    workspaceInfo: {
      flex: 1,
      justifyContent: "center",
    },
    workspaceName: {
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 4,
      letterSpacing: -0.2,
      lineHeight: 22,
    },
    workspaceUrl: {
      fontSize: 13,
      marginBottom: 3,
      fontWeight: "500",
      lineHeight: 18,
    },
    workspaceRole: {
      fontSize: 12,
      fontWeight: "600",
      textTransform: "capitalize",
      lineHeight: 16,
    },
    moreButton: {
      padding: 8,
      marginLeft: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    actionMenu: {
      marginHorizontal: 12,
      marginTop: 0,
      marginBottom: 8,
      borderRadius: 10,
      borderWidth: 1,
      overflow: "hidden",
      ...(Platform.OS !== "web"
        ? {
            boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.05)",
            elevation: 1,
          }
        : {
            boxShadow: rnShadowToBoxShadow(
              "#000",
              { width: 0, height: 1 },
              0.05,
              2,
            ),
          }),
    },
    actionMenuItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      minHeight: 48,
    },
    actionMenuText: {
      fontSize: 14,
      fontWeight: "500",
      lineHeight: 20,
    },
    footer: {
      borderTopWidth: 1,
      // paddingVertical: 2,
      paddingBottom: Platform.OS === "web" ? 11 : 15,
    },
    footerButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 3,
      minHeight: 52,
    },
    footerButtonIconContainer: {
      width: 28,
      height: 16,
      justifyContent: "center",
      alignItems: "center",
      flexShrink: 0,
    },
    footerButtonText: {
      flex: 1,
      fontSize: 15,
      fontWeight: "500",
      letterSpacing: -0.2,
      lineHeight: 16,
    },
    loadingContainer: {
      padding: 60,
      alignItems: "center",
      gap: 18,
      justifyContent: "center",
    },
    loadingText: {
      fontSize: 14,
      fontWeight: "500",
      lineHeight: 20,
    },
    errorContainer: {
      padding: 40,
      alignItems: "center",
      gap: 16,
      justifyContent: "center",
    },
    errorText: {
      fontSize: 14,
      textAlign: "center",
      fontWeight: "500",
      lineHeight: 20,
    },
    retryButton: {
      paddingHorizontal: 28,
      paddingVertical: 12,
      borderRadius: 10,
      marginTop: 8,
      minHeight: 44,
      justifyContent: "center",
    },
    retryButtonText: {
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 21,
      textAlign: "center",
    },
    emptyContainer: {
      padding: 60,
      alignItems: "center",
      gap: 24,
      justifyContent: "center",
    },
    emptyText: {
      fontSize: 14,
      textAlign: "center",
      fontWeight: "500",
      lineHeight: 20,
    },
    createButton: {
      paddingHorizontal: 28,
      paddingVertical: 12,
      borderRadius: 10,
      marginTop: 8,
      minHeight: 44,
      justifyContent: "center",
    },
    createButtonText: {
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 21,
      textAlign: "center",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    inviteModal: {
      width: "85%",
      borderRadius: 16,
      overflow: "hidden",
      ...(Platform.OS !== "web"
        ? {
            boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
            elevation: 8,
          }
        : {
            boxShadow: rnShadowToBoxShadow(
              "#000",
              { width: 0, height: 4 },
              0.15,
              12,
            ),
          }),
    },
    inviteHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 18,
      borderBottomWidth: 1,
      minHeight: 64,
    },
    inviteTitle: {
      fontSize: 20,
      fontWeight: "700",
      letterSpacing: -0.3,
      lineHeight: 28,
      flex: 1,
    },
    inviteContent: {
      paddingHorizontal: 20,
      paddingVertical: 22,
      gap: 18,
    },
    inviteLabel: {
      fontSize: 14,
      fontWeight: "600",
      marginBottom: 8,
      lineHeight: 20,
    },
    inviteInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
      fontWeight: "500",
      lineHeight: 21,
      minHeight: 48,
    },
    roleButtons: {
      flexDirection: "row",
      gap: 10,
      marginTop: 4,
    },
    roleButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
    },
    roleButtonText: {
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 20,
      textAlign: "center",
    },
    inviteActions: {
      flexDirection: "row",
      paddingHorizontal: 20,
      paddingVertical: 18,
      gap: 12,
    },
    inviteButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
    },
    inviteButtonText: {
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 21,
    },
  });

export default WorkspaceSwitcher;