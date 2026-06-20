import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../stores/themeStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { workspaceAPI } from "../services/api";
import Toast from "react-native-toast-message";
import {
  ArrowLeft,
  Send,
  UserPlus,
  RefreshCw,
  Ban,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  Eye,
  Shield,
} from "lucide-react-native";
import logger from "../utils/logger";

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────────────────── */

const STATUS_CONFIG = {
  pending:  { label: "Pending",  icon: Clock,       color: "#38bdf8" },
  accepted: { label: "Accepted", icon: CheckCircle2, color: "#22c55e" },
  expired:  { label: "Expired",  icon: AlertCircle,  color: "#94a3b8" },
  revoked:  { label: "Revoked",  icon: XCircle,      color: "#f87171" },
};

const TYPE_CONFIG = {
  member: { label: "Member", icon: Users, color: "#6366f1" },
  guest:  { label: "Guest",  icon: Eye,   color: "#f59e0b" },
};

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export default function InviteManagementScreen({ navigation }) {
  const { colors } = useThemeStore();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspace   = useWorkspaceStore((s) => s.activeWorkspace);

  /* ── Send invite state ── */
  const [email, setEmail]           = useState("");
  const [inviteType, setInviteType] = useState("member");
  const [sending, setSending]       = useState(false);

  /* ── Pending invites state ── */
  const [invites, setInvites]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  /* ── Fetch invites ── */
  const fetchInvites = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const { data } = await workspaceAPI.getAllInvites(activeWorkspaceId, {
        status: "pending",
        limit: 50,
      });
      setInvites(data.data?.invites || []);
    } catch (err) {
      logger.error("Failed to load invites:", err);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    setLoading(true);
    fetchInvites().finally(() => setLoading(false));
  }, [fetchInvites]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchInvites();
    setRefreshing(false);
  };

  /* ── Send invite ── */
  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      Toast.show({ type: "error", text1: "Invalid email", text2: "Please enter a valid email address" });
      return;
    }
    setSending(true);
    try {
      await workspaceAPI.inviteByEmail(activeWorkspaceId, trimmed, inviteType === "guest" ? "guest" : "member");
      Toast.show({ type: "success", text1: "Invite sent", text2: `Invitation sent to ${trimmed}` });
      setEmail("");
      fetchInvites();
    } catch (err) {
      const msg = err.response?.data?.error?.message || "Failed to send invite";
      Toast.show({ type: "error", text1: "Send failed", text2: msg });
    } finally {
      setSending(false);
    }
  };

  /* ── Revoke invite ── */
  const handleRevoke = (inviteId, inviteEmail) => {
    Alert.alert(
      "Revoke Invite",
      `Revoke the invitation sent to ${inviteEmail}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            try {
              await workspaceAPI.revokeInvite(activeWorkspaceId, inviteId);
              Toast.show({ type: "success", text1: "Invite revoked" });
              setInvites((prev) =>
                prev.map((inv) =>
                  inv._id === inviteId ? { ...inv, status: "revoked" } : inv,
                ),
              );
            } catch (err) {
              Toast.show({
                type: "error",
                text1: "Failed",
                text2: err.response?.data?.error?.message || "Could not revoke invite",
              });
            }
          },
        },
      ],
    );
  };

  /* ── Resend invite ── */
  const handleResend = async (inviteId) => {
    try {
      await workspaceAPI.resendInvite(activeWorkspaceId, inviteId);
      Toast.show({ type: "success", text1: "Invite resent", text2: "A new invite link has been sent" });
      fetchInvites();
    } catch (err) {
      Toast.show({
        type: "error",
        text1: "Resend failed",
        text2: err.response?.data?.error?.message || "Could not resend invite",
      });
    }
  };

  /* ────────────────────────────────────────────── RENDER HELPERS ── */

  const renderInviteItem = ({ item }) => {
    const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const typeCfg   = TYPE_CONFIG[item.inviteType] || TYPE_CONFIG.member;
    const StatusIcon = statusCfg.icon;
    const TypeIcon   = typeCfg.icon;
    const isPending  = item.status === "pending";
    const canResend  = isPending && (item.resendCount ?? 0) < 3;

    return (
      <View style={[styles.inviteCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <View style={styles.inviteRow}>
          <View style={styles.inviteInfo}>
            <View style={styles.inviteEmailRow}>
              <Mail size={13} color={colors.textSecondary} />
              <Text style={[styles.inviteEmail, { color: colors.textPrimary }]} numberOfLines={1}>
                {item.email}
              </Text>
            </View>
            <View style={styles.inviteBadges}>
              <View style={[styles.badge, { backgroundColor: typeCfg.color + "22" }]}>
                <TypeIcon size={10} color={typeCfg.color} />
                <Text style={[styles.badgeText, { color: typeCfg.color }]}>{typeCfg.label}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: statusCfg.color + "22" }]}>
                <StatusIcon size={10} color={statusCfg.color} />
                <Text style={[styles.badgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              </View>
            </View>
          </View>
          {isPending && (
            <View style={styles.inviteActions}>
              {canResend && (
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: colors.border }]}
                  onPress={() => handleResend(item._id)}
                >
                  <RefreshCw size={14} color={colors.accent} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: colors.border }]}
                onPress={() => handleRevoke(item._id, item.email)}
              >
                <Ban size={14} color="#f87171" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  const styles = getStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Invite People</Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {activeWorkspace?.name || "Workspace"}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          {/* ── Send Invite Section ── */}
          <View style={[styles.section, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <UserPlus size={15} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Send Invite</Text>
            </View>

            {/* Email Input */}
            <TextInput
              style={[styles.emailInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder="name@company.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Type Toggle */}
            <View style={styles.typeToggle}>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  inviteType === "member" && { backgroundColor: colors.accent + "22", borderColor: colors.accent },
                  inviteType !== "member" && { borderColor: colors.border },
                ]}
                onPress={() => setInviteType("member")}
              >
                <Users size={13} color={inviteType === "member" ? colors.accent : colors.textSecondary} />
                <Text style={[styles.typeBtnText, { color: inviteType === "member" ? colors.accent : colors.textSecondary }]}>
                  Member
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  inviteType === "guest" && { backgroundColor: "#f59e0b22", borderColor: "#f59e0b" },
                  inviteType !== "guest" && { borderColor: colors.border },
                ]}
                onPress={() => setInviteType("guest")}
              >
                <Eye size={13} color={inviteType === "guest" ? "#f59e0b" : colors.textSecondary} />
                <Text style={[styles.typeBtnText, { color: inviteType === "guest" ? "#f59e0b" : colors.textSecondary }]}>
                  Guest
                </Text>
              </TouchableOpacity>
            </View>

            {/* Send Button */}
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.accent }, (!email.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={!email.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Send size={15} color="#fff" />
                  <Text style={styles.sendBtnText}>Send Invitation</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Pending Invites Section ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Clock size={15} color={colors.textSecondary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Pending Invites</Text>
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading…</Text>
              </View>
            ) : invites.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Mail size={28} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No pending invites</Text>
              </View>
            ) : (
              <FlatList
                data={invites}
                keyExtractor={(item) => item._id}
                renderItem={renderInviteItem}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES
   ───────────────────────────────────────────────────────────────────────────── */

function getStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      gap: 12,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    headerText: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "700",
    },
    headerSub: {
      fontSize: 12,
      marginTop: 1,
    },
    scrollContent: {
      padding: 16,
      gap: 20,
    },
    section: {
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 14,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
    },
    emailInput: {
      borderWidth: 1.5,
      borderRadius: 11,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      fontWeight: "500",
      marginBottom: 12,
    },
    typeToggle: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 14,
    },
    typeBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1.5,
    },
    typeBtnText: {
      fontSize: 13,
      fontWeight: "600",
    },
    sendBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 11,
    },
    sendBtnText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "700",
    },
    loadingWrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 30,
    },
    loadingText: {
      fontSize: 13,
    },
    emptyWrap: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 32,
    },
    emptyText: {
      fontSize: 13,
      fontWeight: "500",
    },
    inviteCard: {
      borderRadius: 11,
      padding: 12,
      borderWidth: 1,
    },
    inviteRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    inviteInfo: {
      flex: 1,
      gap: 6,
    },
    inviteEmailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    inviteEmail: {
      fontSize: 13.5,
      fontWeight: "600",
      flex: 1,
    },
    inviteBadges: {
      flexDirection: "row",
      gap: 6,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 20,
    },
    badgeText: {
      fontSize: 10.5,
      fontWeight: "700",
    },
    inviteActions: {
      flexDirection: "row",
      gap: 6,
      marginLeft: 8,
    },
    actionBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
