import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Modal,
  TextInput,
  Platform,
  Pressable,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { Hash, Users, Pin, Bell, LogOut, FolderOpen, FileText, UserPlus, X, Search, Plus, Lock, Edit2, Star, MessageSquare, FolderInput } from 'lucide-react-native';
import { AppAvatar, HeaderBackButton } from '../components/common';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { useChannelDetails } from '../hooks/useChannelDetails';

const DetailItem = ({ icon: Icon, label, onPress, colors, children }) => (
  <TouchableOpacity style={[styles.detailItem, { borderBottomColor: colors.border }]} onPress={onPress}>
    <Icon size={20} color={colors.textSecondary} />
    <View style={styles.detailLabelContainer}>
      <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>{label}</Text>
    </View>
    {children}
  </TouchableOpacity>
);

const ChannelDetailsScreen = ({ route, navigation }) => {
  const { channelId, channelName, memberCount: initialMemberCount = 0 } = route.params || {};
  const { colors } = useThemeStore();

  const {
    currentUser,
    channel,
    isOneToOneDM,
    canAddMember,
    canMoveToCategory,
    categories,
    showMoveCategoryModal,
    setShowMoveCategoryModal,
    handleAssignCategory,
    members,
    isLoadingMembers,
    showMembersList,
    setShowMembersList,
    isMuted,
    isMuteLoading,
    isEditingName,
    setIsEditingName,
    newName,
    setNewName,
    showAddMemberModal,
    setShowAddMemberModal,
    memberSearchQuery,
    setMemberSearchQuery,
    memberSearchResults,
    isSearchingMembers,
    addingMemberId,
    handleSaveName,
    handleAddMemberToChannel,
    handleMemberPress,
    handleToggleMute,
    isStarred,
    handleToggleStar,
    handleLeaveChannel
  } = useChannelDetails(channelId, channelName, navigation);

  if (isOneToOneDM) {
    const otherUser = members.find(m => m._id !== currentUser?._id);

    if (!otherUser && isLoadingMembers) {
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]} edges={['top', 'bottom']}>
          <ActivityIndicator size="large" color={colors.primary} />
        </SafeAreaView>
      );
    }

    const displayUser = otherUser || currentUser;
    const dmName = displayUser?.name || channelName;
    const username = `@${dmName.replace(/\s+/g, '')}`;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={[styles.dmNavHeader, { borderBottomColor: 'transparent' }]}>
          <HeaderBackButton onPress={() => navigation.goBack()} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={[styles.dmProfileHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.dmAvatarWrapper}>
              <AppAvatar user={otherUser || { name: dmName, avatar: channel?.avatar }} size={64} showStatus statusSize={16} />
            </View>
            <Text style={[styles.dmName, { color: colors.textPrimary }]}>{dmName}</Text>
            <Text style={[styles.dmUsername, { color: colors.textSecondary }]}>{username}</Text>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={handleToggleStar}>
                <Star size={18} color={isStarred ? '#E5A443' : colors.textPrimary} fill={isStarred ? '#E5A443' : 'transparent'} />
                <Text style={[styles.actionBtnText, { color: isStarred ? '#E5A443' : colors.textPrimary }]}>Star</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => navigation.navigate('ChannelSearch', { channelId, channelName: dmName, isPrivate: true })}>
                <Search size={18} color={colors.textPrimary} />
                <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Search</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={{ width: '100%', marginTop: verticalScale(12), borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <DetailItem icon={Users} label="View Profile" colors={colors} onPress={() => navigation.navigate('UserProfile', { user: displayUser, channelId })} />
            <DetailItem icon={FileText} label="Canvas" colors={colors} onPress={() => navigation.navigate('CanvasList', { channelId, channelName: dmName })} />
          </View>

          <View style={styles.dmSection}>
            <Text style={[styles.dmSectionTitle, { color: colors.textPrimary }]}>Settings</Text>
            
            <View style={styles.dmSettingRow}>
              <Bell size={24} color={colors.textPrimary} style={{ marginRight: scale(16), marginTop: verticalScale(4) }} />
              <View style={{ flex: 1, paddingRight: scale(12) }}>
                <Text style={{ fontSize: moderateScale(16), color: colors.textPrimary }}>Mute</Text>
                <Text style={{ fontSize: moderateScale(14), color: colors.textSecondary, marginTop: verticalScale(4), lineHeight: 20 }}>
                  Muted conversations will always appear read and you won't receive any notifications from them.
                </Text>
              </View>
              {isMuteLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Switch
                  value={isMuted}
                  onValueChange={handleToggleMute}
                  trackColor={{ false: '#767577', true: colors.primary }}
                  thumbColor={isMuted ? '#fff' : '#f4f3f4'}
                />
              )}
            </View>
          </View>

          <View style={{ paddingHorizontal: scale(16), marginTop: verticalScale(32), paddingBottom: verticalScale(40) }}>
            <TouchableOpacity style={styles.closeConversationBtn} onPress={handleLeaveChannel}>
              <LogOut size={20} color="#E53E3E" style={{ marginRight: scale(8), transform: [{ rotate: '180deg' }] }} />
              <Text style={{ color: '#E53E3E', fontSize: moderateScale(16), fontWeight: '600' }}>Close Conversation</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.navHeader, { borderBottomColor: colors.border }]}>
        <HeaderBackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>Details</Text>
        <View style={{ width: scale(40) }} />
      </View>

      <ScrollView>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={[styles.channelIcon, { backgroundColor: colors.primary + '15' }]}>
            {(channel?.visibility === 'private' || channel?.type === 'private') ? (
              <Lock size={36} color={colors.primary} />
            ) : (
              <Hash size={36} color={colors.primary} />
            )}
          </View>
          {isEditingName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', paddingHorizontal: scale(20), marginTop: verticalScale(12), gap: scale(8) }}>
              <TextInput
                style={[styles.channelName, { color: colors.textPrimary, borderBottomWidth: 1, borderColor: colors.primary, flex: 1, padding: 0 }]}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                onSubmitEditing={handleSaveName}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={handleSaveName} style={{ padding: scale(4) }}>
                <Text style={{ color: colors.primary, fontWeight: 'bold' }}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsEditingName(false)} style={{ padding: scale(4) }}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', paddingHorizontal: scale(20), marginTop: verticalScale(12) }}>
              <Text style={[styles.channelName, { color: colors.textPrimary, flexShrink: 1, marginTop: 0 }]} numberOfLines={2}>
                {channel?.name || channelName}
              </Text>
              {!(channel?.type === 'project' && channel?.systemManaged) && (
                <TouchableOpacity onPress={() => { setNewName(channel?.name || channelName); setIsEditingName(true); }} style={{ marginLeft: scale(8), padding: scale(4) }}>
                  <Edit2 size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          )}


          <View style={styles.actionButtonsRow}>
            {canAddMember && (
              <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => { setMemberSearchQuery(""); setShowAddMemberModal(true); }}>
                <UserPlus size={18} color={colors.textPrimary} />
                <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Add</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={handleToggleStar}>
              <Star size={18} color={isStarred ? '#E5A443' : colors.textPrimary} fill={isStarred ? '#E5A443' : 'transparent'} />
              <Text style={[styles.actionBtnText, { color: isStarred ? '#E5A443' : colors.textPrimary }]}>Star</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => navigation.navigate('ChannelSearch', { channelId, channelName: channel?.name || channelName, isPrivate: channel?.visibility === 'private' || channel?.type === 'private' })}>
              <Search size={18} color={colors.textPrimary} />
              <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Search</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <DetailItem icon={Users} label="View Members" colors={colors} onPress={() => setShowMembersList(!showMembersList)}>
            <Text style={{ fontSize: moderateScale(14), color: colors.textSecondary }}>
              {isLoadingMembers ? initialMemberCount : members.length}
            </Text>
          </DetailItem>

          {showMembersList && (
            <View style={[styles.membersContainer, { backgroundColor: colors.backgroundSecondary }]}>
              {isLoadingMembers ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ padding: moderateScale(12) }} />
              ) : members.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No members loaded</Text>
              ) : (
                members.map((member) => (
                  <TouchableOpacity key={member._id} style={styles.memberRow} onPress={() => handleMemberPress(member)} activeOpacity={0.6}>
                    <AppAvatar user={member} size={28} />
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.textPrimary }]}>{member.name || 'Member'}</Text>
                      <Text style={[styles.memberEmail, { color: colors.textSecondary }]}>{member.email}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          <DetailItem icon={FolderOpen} label="Files" colors={colors} onPress={() => navigation.navigate('Files', { channelId, channelName })} />
          <DetailItem icon={FileText} label="Canvas" colors={colors} onPress={() => navigation.navigate('CanvasList', { channelId, channelName })} />
          <DetailItem icon={Pin} label="Pinned Messages" colors={colors} onPress={() => navigation.navigate('PinnedMessages', { channelId, channelName })} />
          
          {canMoveToCategory && (
            <DetailItem icon={FolderInput} label="Move to Category" colors={colors} onPress={() => setShowMoveCategoryModal(true)} />
          )}
          
          <DetailItem icon={Bell} label="Mute Notifications" colors={colors} onPress={null}>
            {isMuteLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Switch value={isMuted} onValueChange={handleToggleMute} trackColor={{ false: '#767577', true: colors.primary + '80' }} thumbColor={isMuted ? colors.primary : '#f4f3f4'} />
            )}
          </DetailItem>

          <DetailItem icon={LogOut} label="Leave Channel" colors={colors} onPress={handleLeaveChannel} />
        </View>
      </ScrollView>

      {/* Move to Category Modal */}
      <Modal visible={showMoveCategoryModal} animationType="slide" transparent onRequestClose={() => setShowMoveCategoryModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMoveCategoryModal(false)} />
          <View style={[styles.modalContainer, { backgroundColor: colors.background, height: undefined, maxHeight: '60%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Move to Category</Text>
              <TouchableOpacity onPress={() => setShowMoveCategoryModal(false)} style={styles.modalCloseBtn}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: moderateScale(16) }} contentContainerStyle={{ paddingBottom: moderateScale(32) }}>
              {categories.filter(c => c.type === 'custom').map((cat) => (
                <TouchableOpacity
                  key={cat._id}
                  style={[styles.searchResultItem, { borderBottomColor: colors.border }]}
                  onPress={() => handleAssignCategory(cat._id)}
                >
                  <Text style={{ fontSize: moderateScale(15), color: colors.textPrimary }}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Members Modal */}
      <Modal visible={showAddMemberModal} animationType="slide" transparent onRequestClose={() => setShowAddMemberModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAddMemberModal(false)} />
          <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add Members</Text>
              <TouchableOpacity onPress={() => setShowAddMemberModal(false)} style={styles.modalCloseBtn}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: moderateScale(16), flex: 1 }}>
              <View style={[styles.searchInputRow, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
                <Search size={18} color={colors.textTertiary} />
                <TextInput
                  style={[styles.searchInput, { color: colors.inputText }]}
                  placeholder="Search people..."
                  placeholderTextColor={colors.inputPlaceholder}
                  value={memberSearchQuery}
                  onChangeText={setMemberSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {isSearchingMembers && <ActivityIndicator size="small" color={colors.primary} />}
              </View>

              <ScrollView style={[styles.searchResultsContainer, { borderColor: colors.border, backgroundColor: colors.inputBackground }]} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                {memberSearchResults.length === 0 ? (
                  <Text style={[styles.noResultsText, { color: colors.textTertiary }]}>{isSearchingMembers ? "Loading..." : "No people found to add"}</Text>
                ) : (
                  memberSearchResults.map((m) => (
                    <TouchableOpacity key={m._id} style={[styles.searchResultItem, { borderBottomColor: 'rgba(0,0,0,0.05)' }]} onPress={() => handleAddMemberToChannel(m._id, m.name)} disabled={addingMemberId === m._id}>
                      <AppAvatar user={m} size={32} />
                      <View style={styles.searchResultInfo}>
                        <Text style={[styles.searchResultName, { color: colors.textPrimary }]}>{m.name}</Text>
                        <Text style={[styles.searchResultEmail, { color: colors.textTertiary }]}>{m.email}</Text>
                      </View>
                      <View style={[styles.searchResultAddBtn, { borderColor: colors.primary }]}>
                        {addingMemberId === m._id ? <ActivityIndicator size="small" color={colors.primary} /> : <Plus size={14} color={colors.primary} />}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  navHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: scale(12), paddingVertical: verticalScale(12), borderBottomWidth: 1 },
  navTitle: { fontSize: moderateScale(18), fontWeight: '700' },
  header: { alignItems: 'center', paddingVertical: verticalScale(24), borderBottomWidth: 1 },
  channelIcon: { width: scale(72), height: verticalScale(72), borderRadius: moderateScale(36), justifyContent: 'center', alignItems: 'center', marginBottom: verticalScale(12) },
  channelName: { fontSize: moderateScale(22), fontWeight: '700', textAlign: 'center' },
  memberCount: { fontSize: moderateScale(13), marginTop: verticalScale(4) },
  section: { paddingVertical: verticalScale(8) },
  detailItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: scale(16), paddingVertical: verticalScale(15), borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  detailLabelContainer: { flex: 1 },
  detailLabel: { fontSize: moderateScale(15), fontWeight: '500' },
  membersContainer: { paddingHorizontal: scale(16), paddingVertical: verticalScale(8) },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(8), gap: 10 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: moderateScale(14), fontWeight: '600' },
  memberEmail: { fontSize: moderateScale(11), marginTop: verticalScale(1) },
  emptyText: { fontSize: moderateScale(13), paddingVertical: verticalScale(8), textAlign: 'center' },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContainer: { height: "80%", borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: moderateScale(16), borderBottomWidth: 1 },
  modalTitle: { fontSize: moderateScale(18), fontWeight: "700" },
  modalCloseBtn: { padding: moderateScale(4) },
  searchInputRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: scale(12), paddingVertical: verticalScale(10), borderRadius: moderateScale(8), borderWidth: 1, marginBottom: verticalScale(12), gap: 8 },
  searchInput: { flex: 1, fontSize: moderateScale(15), padding: moderateScale(0) },
  searchResultsContainer: { flex: 1, borderWidth: 1, borderRadius: moderateScale(8), overflow: "hidden" },
  noResultsText: { padding: moderateScale(20), textAlign: "center", fontSize: moderateScale(14) },
  searchResultItem: { flexDirection: "row", alignItems: "center", padding: moderateScale(12), borderBottomWidth: StyleSheet.hairlineWidth },
  searchResultInfo: { flex: 1, marginLeft: scale(12) },
  searchResultName: { fontSize: moderateScale(15), fontWeight: "600" },
  searchResultEmail: { fontSize: moderateScale(13), marginTop: verticalScale(2) },
  searchResultAddBtn: { width: scale(28), height: verticalScale(28), borderRadius: moderateScale(14), borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dmNavHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: scale(16), paddingVertical: verticalScale(12) },
  dmProfileHeader: { paddingHorizontal: scale(20), paddingVertical: verticalScale(12), alignItems: 'flex-start', borderBottomWidth: 1 },
  dmAvatarWrapper: { marginBottom: verticalScale(16) },
  dmName: { fontSize: moderateScale(24), fontWeight: '800', marginBottom: verticalScale(4) },
  dmUsername: { fontSize: moderateScale(15) },
  dmSection: { paddingVertical: verticalScale(24), paddingHorizontal: scale(20) },
  dmSectionTitle: { fontSize: moderateScale(16), fontWeight: '700', marginBottom: verticalScale(16) },
  dmSettingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  closeConversationBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: moderateScale(12), paddingVertical: verticalScale(14) },
  actionButtonsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: verticalScale(16), marginBottom: verticalScale(8), gap: scale(10) },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(8), paddingHorizontal: scale(14), borderRadius: moderateScale(24), borderWidth: 1 },
  actionBtnText: { marginLeft: scale(6), fontSize: moderateScale(14), fontWeight: '600' }
});

export default ChannelDetailsScreen;
