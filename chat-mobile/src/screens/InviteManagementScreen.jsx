import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Switch,
  Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStore } from "../stores/themeStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useChannelStore } from "../stores/channelStore";
import { workspaceAPI } from "../services/api";
import ENV from "../config/environment";
import * as Clipboard from "expo-clipboard";
import Toast from "react-native-toast-message";
import {
  ArrowLeft,
  Mail,
  Plus,
  X,
  Check,
  Copy,
  ChevronRight,
  Search,
  Hash,
  Globe,
  UserPlus,
  Shield,
  Info,
} from "lucide-react-native";
import logger from "../utils/logger";

const PLAN_FEATURES = {
  free:       { guestAccess: false },
  pro:        { guestAccess: true  },
  enterprise: { guestAccess: true  },
};

export default function InviteManagementScreen({ navigation }) {
  const { colors, effectiveTheme } = useThemeStore();
  const insets = useSafeAreaInsets();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspace   = useWorkspaceStore((s) => s.activeWorkspace);
  const { channels, fetchChannels } = useChannelStore();

  const [emails, setEmails] = useState([]);
  const [emailInput, setEmailInput] = useState("");
  const [isGuest, setIsGuest] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [channelSearch, setChannelSearch] = useState("");
  const [channelModalVisible, setChannelModalVisible] = useState(false);
  
  const [sending, setSending] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  // Load channels
  useEffect(() => {
    if (activeWorkspaceId) {
      fetchChannels(activeWorkspaceId).catch(() => {});
    }
  }, [activeWorkspaceId, fetchChannels]);

  // Pre-select general channel by default
  useEffect(() => {
    if (channels.length > 0 && selectedChannels.length === 0) {
      const generalCh = channels.find(c => c.name.toLowerCase() === "general");
      if (generalCh) {
        // Store as string to avoid ObjectId reference-equality failures in .includes()
        setSelectedChannels([String(generalCh._id)]);
      }
    }
  }, [channels]);

  // Invite Link
  const inviteLink = useMemo(() => {
    const inviteCode = activeWorkspace?.inviteCode || activeWorkspaceId;
    return `${ENV.SOCKET_URL}/invite?code=${inviteCode}`;
  }, [activeWorkspace, activeWorkspaceId]);

  const addEmailChip = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      Toast.show({ type: "error", text1: "Invalid email address" });
      return;
    }
    if (emails.includes(trimmed)) {
      Toast.show({ type: "error", text1: "Email already added" });
      return;
    }
    setEmails([...emails, trimmed]);
    setEmailInput("");
  };

  const removeEmailChip = (target) => {
    setEmails(emails.filter((e) => e !== target));
  };

  const filteredChannels = useMemo(() => {
    return channels.filter((ch) => {
      if (ch.type === "dm" || ch.type === "group_dm" || ch.type === "system" || ch.type === "self" || ch.isArchived) return false;
      return ch.name.toLowerCase().includes(channelSearch.toLowerCase());
    });
  }, [channels, channelSearch]);

  const toggleChannel = (channelId) => {
    if (!channelId) return;
    const id = String(channelId);
    setSelectedChannels((prev) => {
      const prevStrings = prev.map((x) => String(x));
      return prevStrings.includes(id)
        ? prevStrings.filter((prevId) => prevId !== id)
        : [...prevStrings, id];
    });
  };

  const copyInviteLink = async () => {
    await Clipboard.setStringAsync(inviteLink);
    setLinkCopied(true);
    Toast.show({ type: "success", text1: "Invite link copied!" });
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleSend = async () => {
    let finalEmails = [...emails];
    if (emailInput.trim()) {
      const trimmed = emailInput.trim().toLowerCase();
      if (isValidEmail(trimmed) && !finalEmails.includes(trimmed)) {
        finalEmails.push(trimmed);
      } else if (!isValidEmail(trimmed)) {
        Toast.show({ type: "error", text1: "Invalid email address" });
        return;
      }
    }

    if (finalEmails.length === 0) {
      Toast.show({ type: "error", text1: "Please add at least one email address" });
      return;
    }

    if (isGuest && selectedChannels.length === 0) {
      Toast.show({ type: "error", text1: "Guests must join at least one channel" });
      return;
    }

    setSending(true);

    try {
      const role = isGuest ? "guest" : (isAdmin ? "admin" : "member");
      const inviteType = isGuest ? "guest" : "member";

      const results = await Promise.allSettled(
        finalEmails.map((email) =>
          workspaceAPI.inviteByEmail(activeWorkspaceId, {
            email,
            channels: selectedChannels,
            inviteType,
            role,
          })
        )
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const rejected = results.filter((r) => r.status === "rejected");

      if (succeeded > 0) {
        Toast.show({
          type: "success",
          text1: "Invitations Sent",
          text2: `Successfully sent ${succeeded} invitation${succeeded > 1 ? "s" : ""}`,
        });
        setEmails([]);
        setEmailInput("");
        // Reset but keep default channels
        const generalCh = channels.find(c => c.name.toLowerCase() === "general");
        setSelectedChannels(generalCh ? [String(generalCh._id)] : []);
        navigation.goBack();
      }

      if (rejected.length > 0) {
        rejected.forEach((r) => {
          console.error("Invitation failed error details:", r.reason?.response?.data || r.reason?.message || r.reason);
          const msg = r.reason?.response?.data?.error?.message || r.reason?.response?.data?.message || r.reason?.message || "Failed to invite";
          Toast.show({ type: "error", text1: "Invite failed", text2: msg });
        });
      }
    } catch (err) {
      logger.error("Failed to send invitations:", err);
      Toast.show({ type: "error", text1: "Error sending invitations" });
    } finally {
      setSending(false);
    }
  };

  const plan = activeWorkspace?.plan || "free";
  const guestAccess = PLAN_FEATURES[plan]?.guestAccess ?? false;

  const selectedChannelsNames = useMemo(() => {
    const stringSelected = selectedChannels.map((x) => String(x));
    return channels
      .filter((ch) => stringSelected.includes(String(ch._id)))
      .map((ch) => `#${ch.name}`)
      .join(", ");
  }, [channels, selectedChannels]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Slack Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <X size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Add Members</Text>
        <TouchableOpacity
          onPress={handleSend}
          disabled={sending || (emails.length === 0 && !emailInput.trim())}
          style={[styles.sendBtn, (emails.length === 0 && !emailInput.trim()) && { opacity: 0.4 }]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.sendText, { color: colors.primary }]}>Invite</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Recipient area (Slack To: style) */}
        <View style={[styles.recipientArea, { borderBottomColor: colors.border }]}>
          <Text style={[styles.toLabel, { color: colors.textSecondary }]}>To:</Text>
          <View style={styles.recipientInputWrap}>
            {emails.length > 0 && (
              <View style={styles.chipsRow}>
                {emails.map((e) => (
                  <View key={e} style={[styles.chip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                    <Text style={[styles.chipText, { color: colors.textPrimary }]} numberOfLines={1}>{e}</Text>
                    <TouchableOpacity onPress={() => removeEmailChip(e)} style={styles.chipRemove}>
                      <X size={10} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder={emails.length === 0 ? "Enter email address" : "Add another..."}
              placeholderTextColor={colors.textMuted}
              value={emailInput}
              onChangeText={setEmailInput}
              onSubmitEditing={addEmailChip}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              blurOnSubmit={false}
            />
          </View>
        </View>

        {/* Channels Row */}
        <TouchableOpacity
          style={[styles.rowItem, { borderBottomColor: colors.border }]}
          onPress={() => setChannelModalVisible(true)}
        >
          <View style={styles.rowLeft}>
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Add to channels</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]} numberOfLines={1}>
              {selectedChannelsNames || "Select channels..."}
            </Text>
          </View>
          <ChevronRight size={20} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* Guest Toggle (if permitted) */}
        {guestAccess && (
          <View style={[styles.rowItem, { borderBottomColor: colors.border }]}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Invite as guest</Text>
              <Text style={[styles.rowSubLabel, { color: colors.textSecondary }]}>
                Guests only have access to selected channels
              </Text>
            </View>
            <Switch
              value={isGuest}
              onValueChange={(val) => {
                setIsGuest(val);
                if (val) setIsAdmin(false);
              }}
              trackColor={{ false: "#767577", true: colors.primary + "80" }}
              thumbColor={isGuest ? colors.primary : "#f4f3f4"}
            />
          </View>
        )}

        {/* Admin Toggle (only if member type) */}
        {!isGuest && (
          <View style={[styles.rowItem, { borderBottomColor: colors.border }]}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Make workspace admin</Text>
              <Text style={[styles.rowSubLabel, { color: colors.textSecondary }]}>
                Admins can manage channels, members, and settings
              </Text>
            </View>
            <Switch
              value={isAdmin}
              onValueChange={setIsAdmin}
              trackColor={{ false: "#767577", true: colors.primary + "80" }}
              thumbColor={isAdmin ? colors.primary : "#f4f3f4"}
            />
          </View>
        )}

        {/* Link Copy Widget */}
        <View style={styles.linkContainer}>
          <Text style={[styles.linkLabel, { color: colors.textSecondary }]}>Or invite by sharing a link:</Text>
          <TouchableOpacity
            style={[styles.linkBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={copyInviteLink}
            activeOpacity={0.7}
          >
            <Copy size={16} color={colors.primary} />
            <Text style={[styles.linkText, { color: colors.textPrimary }]} numberOfLines={1}>
              {inviteLink}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>

    {/* Channel Multi-Select Modal */}
    <Modal
      visible={channelModalVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => setChannelModalVisible(false)}
    >
      <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingTop: insets.top > 0 ? insets.top : 20 }]}>
        {/* Modal Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setChannelModalVisible(false)} style={styles.modalHeaderBtn}>
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Channels</Text>
          <TouchableOpacity onPress={() => setChannelModalVisible(false)} style={styles.modalHeaderBtn}>
            <Text style={[styles.doneText, { color: colors.primary }]}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Modal Search */}
        <View style={[styles.searchBox, { backgroundColor: colors.backgroundSecondary }]}>
          <Search size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search channels..."
            placeholderTextColor={colors.textMuted}
            value={channelSearch}
            onChangeText={setChannelSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Modal Channels List */}
        <ScrollView keyboardShouldPersistTaps="handled">
          {filteredChannels.map((item) => {
            const isSelected = selectedChannels.map((x) => String(x)).includes(String(item._id));
            return (
              <TouchableOpacity
                key={String(item._id)}
                style={[styles.channelItemRow, { borderBottomColor: colors.border }]}
                onPress={() => toggleChannel(item._id)}
                activeOpacity={0.7}
              >
                <Hash size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                <Text style={[styles.channelItemName, { color: colors.textPrimary }]}>{item.name}</Text>
                <View style={[styles.checkOuter, { borderColor: colors.border }, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {isSelected && <Check size={12} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
          {filteredChannels.length === 0 && (
            <Text style={[styles.emptyLabel, { color: colors.textSecondary }]}>No channels found</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES
   ───────────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  sendBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sendText: {
    fontSize: 16,
    fontWeight: "700",
  },
  scrollContent: {
    flexGrow: 1,
  },
  recipientArea: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "flex-start",
  },
  toLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginRight: 10,
    marginTop: 4,
  },
  recipientInputWrap: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "500",
    maxWidth: 150,
  },
  chipRemove: {
    marginLeft: 4,
    padding: 2,
  },
  input: {
    fontSize: 16,
    paddingVertical: 4,
    minWidth: 150,
    flex: 1,
  },
  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: "space-between",
  },
  rowLeft: {
    flex: 1,
    paddingRight: 16,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  rowSubLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  rowValue: {
    fontSize: 14,
    marginTop: 4,
    fontWeight: "500",
  },
  linkContainer: {
    padding: 16,
    marginTop: 16,
  },
  linkLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalHeaderBtn: {
    paddingVertical: 4,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
  doneText: {
    fontSize: 16,
    fontWeight: "700",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  searchInput: {
    fontSize: 15,
    flex: 1,
    paddingVertical: 0,
  },
  channelItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  channelItemName: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
  },
  checkOuter: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyLabel: {
    textAlign: "center",
    padding: 32,
    fontSize: 14,
  },
});
// File touched to trigger metro reload
