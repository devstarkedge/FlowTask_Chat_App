import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import KeyboardAwareContainer from "./common/KeyboardAwareContainer";
import { useThemeStore } from "../stores/themeStore";
import { X, Search, Check, Plus } from "lucide-react-native";
import { useDirectoryUsers } from "../hooks/queries/useDirectoryUsers";
import { useAuthStore } from "../stores/authStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { AppAvatar } from "./common";
import { verticalScale, moderateScale } from '../utils/responsive';
import useResponsive from '../hooks/useResponsive';

const AddMembersDrawer = ({ visible, onClose, onConfirm, isLoading }) => {
  const { isTablet, isDesktop, width } = useResponsive();
  const isWide = isTablet || isDesktop || width > 640;
  const formPadding = moderateScale(20);
  const gap = 12;
  const containerWidth = isWide ? (Math.min(width, 600) - 2 * formPadding) : (width - 2 * formPadding);
  const chipWidth = (containerWidth - 2 * gap) / 2.5;
  const { colors } = useThemeStore();
  const user = useAuthStore((s) => s.user);

  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);


  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { data: searchData, isFetching: isSearchingMembers } = useDirectoryUsers(
    activeWorkspaceId,
    { limit: 100, search: memberSearchQuery.trim() }
  );

  useEffect(() => {
    if (!visible || !searchData) return;
    const contacts = searchData;
    const filtered = (Array.isArray(contacts) ? contacts : contacts?.users || [])
      .map(u => ({
        _id: u._id || u.chatUserId,
        name: u.name,
        email: u.email,
        avatar: u.avatar
      }))
      .filter(u => u._id && u._id !== user?._id);
    setMemberSearchResults(filtered);
  }, [searchData, visible, user]);

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

  const handleClose = () => {
    onClose();
  };

  const handleConfirm = () => {
    onConfirm(selectedMembers);
  };

  // Add cleanup when drawer successfully finishes/closes
  useEffect(() => {
    if (!visible) {
      setMemberSearchQuery("");
      setSelectedMembers([]);
    }
  }, [visible]);

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
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} disabled={isLoading}>
              <X size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Add Members
            </Text>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={isLoading}
              style={[
                styles.createBtn,
                { backgroundColor: colors.primary },
                isLoading && { opacity: 0.6 }
              ]}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary} />
              ) : (
                <Text style={[styles.createBtnText, { color: colors.textOnPrimary }]}>
                  Confirm
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {selectedMembers.length > 0 && (
              <View style={{ maxHeight: moderateScale(60) }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.selectedMembersContainer}
                >
                  {selectedMembers.map((m) => (
                    <View key={m._id} style={[styles.selectedChip, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40' }]}>
                      <AppAvatar user={m} size={28} />
                      <Text style={[styles.selectedChipName, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
                        {m.name}
                      </Text>
                      <TouchableOpacity onPress={() => handleRemoveMember(m._id)} style={styles.removeChipBtn}>
                        <X size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
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
    height: "85%", // Use most of the screen for members drawer
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  wideContainer: {
    width: "100%",
    maxWidth: 600,
    borderRadius: 16,
    height: "80%",
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
    height: moderateScale(36),
    borderRadius: moderateScale(8),
    minWidth: moderateScale(64),
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontWeight: "700",
    fontSize: moderateScale(14),
  },
  form: {
    padding: moderateScale(20),
    flex: 1,
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
  selectedMembersContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    maxWidth: moderateScale(160),
    alignSelf: "flex-start",
  },
  selectedChipName: {
    fontSize: moderateScale(14),
    fontWeight: "600",
    flexShrink: 1,
  },
  removeChipBtn: {
    padding: moderateScale(4),
  },
  searchResultsContainer: {
    marginTop: moderateScale(12),
    borderWidth: 1,
    borderRadius: moderateScale(8),
    flex: 1,
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

export default AddMembersDrawer;
