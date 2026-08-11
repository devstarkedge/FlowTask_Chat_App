import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Switch,
  ActivityIndicator,
  FlatList,
  ScrollView,
} from "react-native";
import KeyboardAwareContainer from "./common/KeyboardAwareContainer";
import { useThemeStore } from "../stores/themeStore";
import { useChannelStore } from "../stores/channelStore";
import { X, Hash, Lock, Search, Check, Plus } from "lucide-react-native";
import { directoriesAPI } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { AppAvatar } from "./common";
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import useResponsive from '../hooks/useResponsive';

/**
 * CreateChannelModal — Slack-like modal for creating a new channel.
 */
const CreateChannelModal = ({ visible, onClose, onCreated, navigation }) => {
  const { isTablet, isDesktop, width } = useResponsive();
  const isWide = isTablet || isDesktop || width > 640;
  const formPadding = moderateScale(20);
  const gap = 12;
  const containerWidth = isWide ? (Math.min(width, 600) - 2 * formPadding) : (width - 2 * formPadding);
  const chipWidth = (containerWidth - 2 * gap) / 2.5;
  const { colors } = useThemeStore();
  const createChannel = useChannelStore((s) => s.createChannel);
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);

  React.useEffect(() => {
    if (!isPrivate) return;
    const fetchMembers = async () => {
      setIsSearchingMembers(true);
      try {
        const query = memberSearchQuery.trim();
        const params = { limit: 100 };
        if (query) params.search = query;
        const { data } = await directoriesAPI.getUsers(params);
        const contacts = data.data || data; // Handle depending on exact payload structure
        const filtered = (Array.isArray(contacts) ? contacts : contacts?.users || [])
          .map(u => ({
            _id: u._id || u.chatUserId,
            name: u.name,
            email: u.email,
            avatar: u.avatar
          }))
          .filter(u => u._id && u._id !== user?._id);
        setMemberSearchResults(filtered);
      } catch (err) {
        console.error("Failed to search members:", err);
      } finally {
        setIsSearchingMembers(false);
      }
    };

    const timer = setTimeout(fetchMembers, memberSearchQuery ? 350 : 50);
    return () => clearTimeout(timer);
  }, [memberSearchQuery, isPrivate, user]);

  const handleToggleMember = (member) => {
    setSelectedMembers((prev) => {
      const exists = prev.some((m) => m._id === member._id);
      if (exists) return prev.filter((m) => m._id !== member._id);
      return [...prev, member];
    });
  };

  const handleRemoveMember = (memberId) => {
    setSelectedMembers((prev) => prev.filter((m) => m._id !== memberId));
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmedName) {
      setError("Channel name is required");
      return;
    }

    setLoading(true);
    try {
      const channel = await createChannel({
        name: trimmedName,
        visibility: isPrivate ? "private" : "public",
        topic: topic.trim(),
        memberIds: isPrivate ? selectedMembers.map(m => m._id) : [],
      });
      // Reset form
      setName("");
      setTopic("");
      setIsPrivate(false);
      onClose();
      // Navigate to the new channel
      if (channel && navigation) {
        navigation.navigate("Chat", {
          channelId: channel._id,
          channelName: channel.name,
        });
      }
      onCreated?.(channel);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to create channel");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName("");
    setTopic("");
    setIsPrivate(false);
    setError(null);
    setMemberSearchQuery("");
    setSelectedMembers([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAwareContainer
        style={[
          styles.overlay,
          { backgroundColor: colors.overlay },
          isWide && styles.wideOverlay,
        ]}
        disablePadding={false}
      >
        <View style={[
          styles.container,
          { backgroundColor: colors.background },
          isWide && styles.wideContainer,
        ]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <X size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Create a channel
            </Text>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading || !name.trim()}
              style={[
                styles.createBtn,
                { backgroundColor: colors.primary },
                (!name.trim() || loading) && { opacity: 0.4 },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary} />
              ) : (
                <Text style={[styles.createBtnText, { color: colors.textOnPrimary }]}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Form */}
          <ScrollView 
            style={styles.form} 
            contentContainerStyle={{ paddingBottom: verticalScale(40) }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Channel name */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Channel name
            </Text>
            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
              <Hash size={18} color={colors.textTertiary} />
              <TextInput
                style={[styles.input, { color: colors.inputText }]}
                placeholder="e.g. project-updates"
                placeholderTextColor={colors.inputPlaceholder}
                value={name}
                onChangeText={(text) => {
                  let newText = text.toLowerCase().replace(/\s/g, "-");
                  newText = newText.replace(/[^a-z0-9-_]/g, "");
                  setName(newText);
                  setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={80}
              />
            </View>
            {error && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {error}
              </Text>
            )}
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              Channels are where your team communicates. They're best when
              organized around a topic — #marketing, for example.
            </Text>

            {/* Topic */}
            <Text style={[styles.label, { color: colors.textSecondary, marginTop: verticalScale(20) }]}>
              Description (optional)
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  color: colors.inputText,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBackground,
                },
              ]}
              placeholder="What's this channel about?"
              placeholderTextColor={colors.inputPlaceholder}
              value={topic}
              onChangeText={setTopic}
              multiline
              numberOfLines={3}
              maxLength={250}
            />

            {/* Private toggle */}
            <View style={[styles.toggleRow, { borderTopColor: colors.border }]}>
              <View style={styles.toggleInfo}>
                <Lock size={18} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>
                    Make private
                  </Text>
                  <Text style={[styles.toggleHint, { color: colors.textTertiary }]}>
                    Only invited members can see private channels
                  </Text>
                </View>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={setIsPrivate}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            {/* Add Members (Private only) */}
            {isPrivate && (
              <View style={styles.membersSection}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Add Members (optional)
                </Text>

                {selectedMembers.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.selectedMembersContainer}
                  >
                    {selectedMembers.map((m) => (
                      <View key={m._id} style={[styles.selectedChip, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40', width: chipWidth }]}>
                        <AppAvatar user={m} size={28} />
                        <Text style={[styles.selectedChipName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {m.name}
                        </Text>
                        <TouchableOpacity onPress={() => handleRemoveMember(m._id)} style={styles.removeChipBtn}>
                          <X size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}

                <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.inputBackground, marginTop: verticalScale(8) }]}>
                  <Search size={18} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.input, { color: colors.inputText }]}
                    placeholder="Search people..."
                    placeholderTextColor={colors.inputPlaceholder}
                    value={memberSearchQuery}
                    onChangeText={setMemberSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {isSearchingMembers && <ActivityIndicator size="small" color={colors.primary} />}
                </View>

                {/* Search Results */}
                <ScrollView 
                  style={[styles.searchResultsContainer, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled={true}
                >
                  {memberSearchResults.length === 0 ? (
                    <Text style={[styles.noResultsText, { color: colors.textTertiary }]}>
                      {isSearchingMembers ? "Loading..." : "No people found"}
                    </Text>
                  ) : (
                    memberSearchResults.map((m) => {
                      const isSelected = selectedMembers.some((sm) => sm._id === m._id);
                      return (
                        <TouchableOpacity
                          key={m._id}
                          style={[styles.searchResultItem, isSelected && { backgroundColor: colors.primary + '10' }]}
                          onPress={() => handleToggleMember(m)}
                        >
                          <AppAvatar user={m} size={32} />
                          <View style={styles.searchResultInfo}>
                            <Text style={[styles.searchResultName, { color: colors.textPrimary }]}>{m.name}</Text>
                            <Text style={[styles.searchResultEmail, { color: colors.textTertiary }]}>{m.email}</Text>
                          </View>
                          <View style={[
                            styles.searchResultCheck, 
                            { borderColor: isSelected ? colors.primary : colors.border },
                            isSelected && { backgroundColor: colors.primary }
                          ]}>
                            {isSelected ? <Check size={12} color="#fff" strokeWidth={3} /> : <Plus size={12} color={colors.textTertiary} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAwareContainer>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  wideOverlay: {
    justifyContent: "center",
    alignItems: "center",
    padding: moderateScale(24),
  },
  container: {
    maxHeight: "90%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  wideContainer: {
    width: "100%",
    maxWidth: 600,
    borderRadius: 16,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(14),
    borderBottomWidth: 1,
  },
  closeBtn: { padding: moderateScale(4) },
  title: { fontSize: moderateScale(16), fontWeight: "700" },
  createBtn: {
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(8),
    minWidth: moderateScale(64),
    minHeight: moderateScale(36),
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontWeight: "700",
    fontSize: moderateScale(14),
  },
  form: {
    padding: moderateScale(20),
  },
  label: {
    fontSize: moderateScale(13),
    fontWeight: "700",
    marginBottom: moderateScale(8),
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: moderateScale(8),
    paddingHorizontal: moderateScale(12),
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: moderateScale(15),
    paddingVertical: moderateScale(10),
  },
  hint: {
    fontSize: moderateScale(12),
    marginTop: moderateScale(8),
    lineHeight: 18,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: moderateScale(8),
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(10),
    fontSize: moderateScale(14),
    minHeight: moderateScale(70),
    textAlignVertical: "top",
  },
  errorText: {
    fontSize: moderateScale(13),
    marginTop: moderateScale(6),
    fontWeight: "500",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: moderateScale(24),
    paddingTop: moderateScale(20),
    borderTopWidth: 0.5,
    gap: 12,
  },
  toggleInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  toggleLabel: {
    fontSize: moderateScale(14),
    fontWeight: "600",
  },
  toggleHint: {
    fontSize: moderateScale(12),
    marginTop: moderateScale(2),
  },
  membersSection: {
    marginTop: moderateScale(24),
  },
  selectedMembersContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: moderateScale(12),
    marginBottom: moderateScale(12),
    paddingRight: moderateScale(16),
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(6),
    borderRadius: moderateScale(20),
    borderWidth: 1,
    gap: 8,
  },
  selectedChipName: {
    fontSize: moderateScale(14),
    fontWeight: "600",
    flex: 1,
  },
  removeChipBtn: {
    padding: moderateScale(4),
  },
  searchResultsContainer: {
    marginTop: moderateScale(8),
    borderWidth: 1,
    borderRadius: moderateScale(8),
    maxHeight: moderateScale(180),
    overflow: "hidden",
  },
  noResultsText: {
    padding: moderateScale(12),
    textAlign: "center",
    fontSize: moderateScale(13),
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: moderateScale(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  searchResultInfo: {
    flex: 1,
    marginLeft: moderateScale(10),
  },
  searchResultName: {
    fontSize: moderateScale(14),
    fontWeight: "600",
  },
  searchResultEmail: {
    fontSize: moderateScale(12),
    marginTop: moderateScale(2),
  },
  searchResultCheck: {
    width: moderateScale(20),
    height: moderateScale(20),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CreateChannelModal;
