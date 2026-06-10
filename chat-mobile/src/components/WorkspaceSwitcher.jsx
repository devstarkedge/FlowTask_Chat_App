import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Pressable,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useThemeStore } from "../stores/themeStore";
import {
  Plus,
  Settings,
  HelpCircle,
  MoreVertical,
  X,
} from "lucide-react-native";
import WorkspaceAvatar from "./WorkspaceAvatar";
import AddWorkspaceScreen from "./workspace/AddWorkspaceScreen";

const { width } = Dimensions.get("window");
const SIDEBAR_WIDTH = Math.min(width * 0.82, 320);

const WorkspaceSwitcher = ({ visible, onClose, navigation }) => {
  const insets = useSafeAreaInsets();
  const {
    workspaces,
    activeWorkspace,
    switchWorkspace,
    fetchWorkspaces,
    isLoading,
    error,
  } = useWorkspaceStore();
  const { colors } = useThemeStore();
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const [actionMenuVisible, setActionMenuVisible] = useState(null);
  const [addWorkspaceVisible, setAddWorkspaceVisible] = useState(false);

  useEffect(() => {
    if (visible) fetchWorkspaces();
  }, [visible]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -SIDEBAR_WIDTH,
      duration: 220,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [visible]);

  const handleWorkspaceSwitch = async (workspaceId) => {
    if (workspaceId === activeWorkspace?._id) { onClose(); return; }
    await switchWorkspace(workspaceId);
    onClose();
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />

      <Animated.View
        style={[
          styles.sidebar,
          {
            width: SIDEBAR_WIDTH,
            backgroundColor: colors.background,
            transform: [{ translateX: slideAnim }],
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Workspaces</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Workspace list */}
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContent}>
          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              <TouchableOpacity onPress={fetchWorkspaces}>
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.wsList}>
              {workspaces.map((ws) => {
                const isActive = ws._id === activeWorkspace?._id;
                return (
                  <TouchableOpacity
                    key={ws._id}
                    style={[styles.wsCard, { backgroundColor: isActive ? colors.backgroundTertiary : "transparent" }]}
                    onPress={() => handleWorkspaceSwitch(ws._id)}
                    activeOpacity={0.7}
                  >
                    <WorkspaceAvatar workspace={ws} size={40} />
                    <View style={styles.wsInfo}>
                      <Text style={[styles.wsName, { color: colors.textPrimary }]} numberOfLines={1}>{ws.name}</Text>
                      <Text style={[styles.wsUrl, { color: colors.textSecondary }]} numberOfLines={1}>
                        {(ws.slug || ws.name || "").toLowerCase().replace(/\s+/g, "")}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.moreBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setActionMenuVisible(actionMenuVisible === ws._id ? null : ws._id);
                      }}
                    >
                      <MoreVertical size={18} color={colors.textSecondary} style={{ opacity: 0.6 }} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Footer options */}
          <View style={styles.footerOptions}>
            <TouchableOpacity
              style={styles.footerRow}
              onPress={() => setAddWorkspaceVisible(true)}
              activeOpacity={0.6}
            >
              <Plus size={20} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.footerLabel, { color: colors.textPrimary }]}>Add a Workspace</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.footerRow}
              onPress={() => {
                onClose();
                navigation?.navigate("Preferences");
              }}
              activeOpacity={0.6}
            >
              <Settings size={20} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.footerLabel, { color: colors.textPrimary }]}>Preferences</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.footerRow}
              onPress={() => { onClose(); }}
              activeOpacity={0.6}
            >
              <HelpCircle size={20} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.footerLabel, { color: colors.textPrimary }]}>Help</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Slack-style Add Workspace screen */}
      <AddWorkspaceScreen
        visible={addWorkspaceVisible}
        onClose={() => setAddWorkspaceVisible(false)}
        navigation={navigation}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1100,
  },
  backdrop: {
    flex: 1,
  },
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: "column",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    flex: 1,
  },
  wsList: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wsCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 4,
    marginVertical: 3,
  },
  wsInfo: {
    flex: 1,
    marginLeft: 10,
  },
  wsName: {
    fontSize: 15,
    fontWeight: "700",
  },
  wsUrl: {
    fontSize: 13,
    marginTop: 2,
  },
  moreBtn: {
    padding: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    // marginTop: 16,
    marginBottom: 8,
  },
  footerOptions: {
    paddingHorizontal: 4,
    paddingBottom: 20,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  footerLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  loadingBox: {
    padding: 40,
    alignItems: "center",
  },
  errorBox: {
    padding: 30,
    alignItems: "center",
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
  },
});

export default WorkspaceSwitcher;
