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
  Alert,
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
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import useResponsive from '../hooks/useResponsive';
import api from '../services/api';
import { useWorkspaces } from '../hooks/queries/useWorkspaces';

const WorkspaceSwitcher = ({ visible, onClose, navigation }) => {
  const { width } = useResponsive();
  const SIDEBAR_WIDTH = Math.min(width * 0.82, 360);
  const insets = useSafeAreaInsets();
  const {
    activeWorkspace,
    switchWorkspace,
    fetchWorkspaces,
    isLoading,
    error,
  } = useWorkspaceStore();
  // Workspaces live in the TanStack Query cache (populated by store's fetchWorkspaces),
  // not in the zustand store — read them via the query hook (same key, keeps in sync).
  const { data: workspaces = [] } = useWorkspaces();
  const { colors } = useThemeStore();
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const [actionMenuVisible, setActionMenuVisible] = useState(null);
  const [addWorkspaceVisible, setAddWorkspaceVisible] = useState(false);
  const [unreadByWorkspace, setUnreadByWorkspace] = useState({});

  useEffect(() => {
    if (visible) {
      fetchWorkspaces();
      // Workspace-level unread badges (parity with web WorkspaceSwitcher)
      api
        .get('/notifications/unread-counts-all')
        .then(({ data }) => setUnreadByWorkspace(data?.data?.counts ?? {}))
        .catch(() => {});
    }
  }, [visible]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -SIDEBAR_WIDTH,
      duration: 220,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [visible, SIDEBAR_WIDTH]);

  const handleInvite = (ws) => {
    const code = ws?.inviteCode || ws?.code || 'WS123';
    Alert.alert(
      'Invite to Workspace',
      `Share this invite code with others to let them join ${ws.name}:\n\nCode: ${code}`,
      [
        { text: 'OK' },
        {
          text: 'Copy Code',
          onPress: () => {
            const Clipboard = require('expo-clipboard');
            Clipboard.setStringAsync(code);
          }
        }
      ]
    );
  };

  const handleWorkspaceSwitch = (workspaceId) => {
    if (workspaceId === activeWorkspace?._id) { onClose(); return; }
    switchWorkspace(workspaceId);
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

        {/* Workspace list (scrollable) */}
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
                const wsUnread = unreadByWorkspace[ws._id] || 0;
                return (
                  <View key={ws._id}>
                    <TouchableOpacity
                      style={[styles.wsCard, { backgroundColor: isActive ? colors.backgroundTertiary : "transparent" }]}
                      onPress={() => handleWorkspaceSwitch(ws._id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.avatarWrap}>
                        <WorkspaceAvatar workspace={ws} size={40} />
                        {!isActive && wsUnread > 0 && (
                          <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                        )}
                      </View>
                      <View style={styles.wsInfo}>
                        <Text style={[styles.wsName, { color: colors.textPrimary }]} numberOfLines={1}>{ws.name}</Text>
                        <Text style={[styles.wsUrl, { color: colors.textSecondary }]} numberOfLines={1}>
                          {(ws.slug || ws.name || "").toLowerCase().replace(/\s+/g, "")}
                        </Text>
                      </View>
                      {!isActive && wsUnread > 0 && (
                        <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                          <Text style={styles.unreadBadgeText}>
                            {wsUnread > 99 ? '99+' : wsUnread}
                          </Text>
                        </View>
                      )}
                      {['owner', 'admin'].includes(ws.role) && (
                        <TouchableOpacity
                          style={styles.moreBtn}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            setActionMenuVisible(actionMenuVisible === ws._id ? null : ws._id);
                          }}
                        >
                          <MoreVertical size={18} color={colors.textSecondary} style={{ opacity: 0.6 }} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                    {actionMenuVisible === ws._id && (
                      <View style={[styles.actionDropdown, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                        {['owner', 'admin'].includes(ws.role) && (
                          <TouchableOpacity
                            style={styles.dropdownItem}
                            onPress={() => {
                              setActionMenuVisible(null);
                              onClose();
                              navigation?.navigate("InviteManagement");
                            }}
                          >
                            <Plus size={16} color={colors.primary} />
                            <Text style={[styles.dropdownText, { color: colors.textPrimary }]}>Invite Members</Text>
                          </TouchableOpacity>
                        )}

                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Fixed Footer options dynamically padded for all devices */}
        <View style={[styles.footerOptions, { paddingBottom: Math.max(insets.bottom, verticalScale(12)) }]}>
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
        </View>
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
    left: scale(0),
    top: verticalScale(0),
    bottom: verticalScale(0),
    flexDirection: "column",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
  },
  title: {
    fontSize: moderateScale(22),
    fontWeight: "800",
  },
  closeBtn: {
    padding: moderateScale(4),
  },
  scrollContent: {
    flex: 1,
  },
  wsList: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
  },
  wsCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: moderateScale(10),
    borderRadius: moderateScale(8),
    marginHorizontal: scale(4),
    marginVertical: verticalScale(3),
  },
  avatarWrap: {
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: moderateScale(11),
    fontWeight: '700',
  },
  wsInfo: {
    flex: 1,
    marginLeft: scale(10),
  },
  wsName: {
    fontSize: moderateScale(15),
    fontWeight: "700",
  },
  wsUrl: {
    fontSize: moderateScale(13),
    marginTop: verticalScale(2),
  },
  moreBtn: {
    padding: moderateScale(6),
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: scale(16),
    // marginTop: verticalScale(16),
    marginBottom: verticalScale(8),
  },
  footerOptions: {
    paddingHorizontal: scale(4),
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(12),
    gap: 12,
    borderRadius: moderateScale(8),
    marginHorizontal: scale(4),
  },
  footerLabel: {
    fontSize: moderateScale(15),
    fontWeight: "500",
  },
  loadingBox: {
    padding: moderateScale(40),
    alignItems: "center",
  },
  errorBox: {
    padding: moderateScale(30),
    alignItems: "center",
    gap: 10,
  },
  errorText: {
    fontSize: moderateScale(14),
    textAlign: "center",
  },
  actionDropdown: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    marginHorizontal: scale(16),
    marginVertical: verticalScale(4),
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  dropdownText: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
});

export default WorkspaceSwitcher;
