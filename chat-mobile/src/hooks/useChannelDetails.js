import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useChannelStore } from '../stores/channelStore';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useNotificationPrefStore } from '../stores/notificationPrefStore';
import api, { channelAPI, notificationPrefAPI, usersAPI, directoriesAPI, workspaceAPI, categoryAPI } from '../services/api';
import logger from '../utils/logger';
import { isChatAppChannel } from '../utils/channelOrigin';
import Toast from 'react-native-toast-message';
import { useChannels } from './queries/useChannels';

export const useChannelDetails = (channelId, channelName, navigation) => {
  const createDM = useChannelStore((s) => s.createDM);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const updateChannel = useChannelStore((s) => s.updateChannel);
  const starChannel = useChannelStore((s) => s.starChannel);
  const starredIds = useChannelStore((s) => s.starredIds) || [];
  const { user: currentUser } = useAuthStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { data: channels = [] } = useChannels(activeWorkspace?._id);

  const channel = channels.find((c) => c._id === channelId);
  const isOneToOneDM = channel?.type === 'dm' && (channel?.dmParticipants?.length || 0) <= 2;

  const [members, setMembers] = useState([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [showMembersList, setShowMembersList] = useState(false);
  const isMutedStore = useNotificationPrefStore((s) => !!s.mutedChannels?.[channelId]);
  const [isMutedLocal, setIsMutedLocal] = useState(false);
  const isMuted = isMutedStore || isMutedLocal;
  const [isMuteLoading, setIsMuteLoading] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [addingMemberId, setAddingMemberId] = useState(null);

  const fetchMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    try {
      const res = await usersAPI.getChannelMembers(channelId);
      const data = res.data?.data || res.data;
      const list = Array.isArray(data) ? data : data?.members || [];
      setMembers(Array.isArray(list) ? list : []);
    } catch (err) {
      logger.error('Failed to load channel members:', err);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [channelId]);

  const fetchNotificationPrefs = useCallback(async () => {
    try {
      const res = await notificationPrefAPI.get();
      const channelPrefs = res.data?.data?.channels?.[channelId];
      if (channelPrefs) {
        setIsMutedLocal(channelPrefs.paused || false);
      }
    } catch (err) {
      logger.error('Failed to load notification preferences:', err);
    }
  }, [channelId]);

  useEffect(() => {
    if (channelId) {
      fetchMembers();
      fetchNotificationPrefs();
    }
  }, [channelId, fetchMembers, fetchNotificationPrefs]);

  useEffect(() => {
    if (!showAddMemberModal) return;
    const fetchSearchMembers = async () => {
      setIsSearchingMembers(true);
      try {
        const query = memberSearchQuery.trim();
        const params = { limit: 1000 };
        if (query) params.search = query;
        
        const { data } = await directoriesAPI.getUsers(params);
        const rawUsers = data.data?.users || data.data || [];

        const existingIds = new Set(members.map(m => m.userId?._id || m.userId || m._id));
        
        let filtered = rawUsers
          .map(u => ({
            _id: u._id || u.chatUserId || u.id,
            name: u.name || u.displayName,
            email: u.email,
            avatar: u.avatar,
            role: u.role
          }))
          .filter(u => u._id && u._id !== currentUser?._id && !existingIds.has(u._id));
        
        if (channel?.slug === 'flowtask-managers') {
          filtered = filtered.filter(u => (u.role || '').toLowerCase() === 'manager');
        }
        
        if (query) {
          const lowerQ = query.toLowerCase();
          setMemberSearchResults(filtered.filter(u => 
            (u.name && u.name.toLowerCase().includes(lowerQ)) ||
            (u.email && u.email.toLowerCase().includes(lowerQ))
          ));
        } else {
          setMemberSearchResults(filtered);
        }
      } catch (err) {
        logger.error("Failed to search members:", err);
      } finally {
        setIsSearchingMembers(false);
      }
    };

    const timer = setTimeout(fetchSearchMembers, memberSearchQuery ? 250 : 50);
    return () => clearTimeout(timer);
  }, [memberSearchQuery, showAddMemberModal, members, currentUser]);

  const handleSaveName = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setIsEditingName(false);
      return;
    }
    if (trimmed === (channel?.name || channelName)) {
      setIsEditingName(false);
      return;
    }
    try {
      await api.put(`/channels/${channelId}`, { name: trimmed });
      updateChannel(channelId, { name: trimmed });
      setIsEditingName(false);
      Toast.show({ type: 'success', text1: 'Channel name updated' });
    } catch (err) {
      logger.error('Failed to update channel name:', err);
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to update channel name';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleAddMemberToChannel = async (userId, userName) => {
    const isAlreadyMember = members.some(m => (m.userId?._id || m.userId || m._id) === userId);
    if (isAlreadyMember) {
      Toast.show({ type: 'error', text1: 'User has already been added to this group' });
      return;
    }
    try {
      setAddingMemberId(userId);
      await channelAPI.addMember(channelId, userId);
      Alert.alert("Success", "Members added successfully.");
      Toast.show({ type: 'success', text1: `${userName} added to channel` });
      fetchMembers();
      setMemberSearchResults(prev => prev.filter(m => m._id !== userId));
    } catch (err) {
      logger.error('Failed to add member:', err);
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to add member';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setAddingMemberId(null);
    }
  };

  const handleMemberPress = async (member) => {
    try {
      const dmChannel = await createDM(member._id);
      if (dmChannel) {
        setActiveChannel(dmChannel._id);
        navigation.navigate("Chat", {
          channelId: dmChannel._id,
          channelName: dmChannel.name || member.name,
        });
      }
    } catch (err) {
      logger.error("Failed to start DM:", err);
    }
  };

  const handleToggleMute = async (val) => {
    setIsMuteLoading(true);
    setIsMutedLocal(val);
    try {
      await useNotificationPrefStore.getState().toggleChannelMute(channelId, val);
    } catch (err) {
      logger.error('Failed to update channel mute preferences:', err);
      setIsMutedLocal(!val);
      Alert.alert('Error', 'Failed to update notification settings.');
    } finally {
      setIsMuteLoading(false);
    }
  };

  const isStarred = starredIds.includes(channelId);

  const handleToggleStar = async () => {
    try {
      await starChannel(channelId);
    } catch (err) {
      logger.error('Failed to toggle star for channel:', err);
    }
  };

  const handleLeaveChannel = () => {
    Alert.alert(
      'Leave Channel',
      `Are you sure you want to leave #${channelName}? You will not receive any further messages unless you are re-invited.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await channelAPI.leave(channelId);
              Alert.alert('Left Channel', `You have successfully left #${channelName}.`);
              navigation.navigate('Main');
            } catch (err) {
              logger.error('Failed to leave channel:', err);
              const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to leave the channel.';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  const userRole = (currentUser?.role || '').toLowerCase();
  const isSystemAdminOrManager = userRole === 'admin' || userRole === 'manager' || currentUser?.isAdmin;
  const isChannelCreator = channel?.createdBy === currentUser?._id;
  const isChannelAdmin = channel?.admins?.includes(currentUser?._id);
  const canAddMember = isChatAppChannel(channel);
  const canMoveToCategory = channel?.type !== 'dm' && isChatAppChannel(channel);

  const categories = useChannelStore((s) => s.categories) || [];
  const fetchCategories = useChannelStore((s) => s.fetchCategories);
  const [showMoveCategoryModal, setShowMoveCategoryModal] = useState(false);

  const handleAssignCategory = async (categoryId) => {
    const currentCat = categories.find(c => c.channelIds?.includes(channelId));
    const currentCatId = currentCat?._id?.toString?.();
    if (String(categoryId) === String(currentCatId || 'null')) {
      Toast.show({ type: 'error', text1: 'You are already in this category.' });
      return;
    }

    try {
      if (categoryId === null) {
        if (currentCat && currentCat.type === "custom") {
          await categoryAPI.removeChannel(currentCat._id, channelId);
        }
      } else {
        await categoryAPI.addBulkChannels(categoryId, [channelId]);
      }
      Toast.show({ type: 'success', text1: 'Channel category updated' });
      if (fetchCategories) fetchCategories();
      setShowMoveCategoryModal(false);
    } catch (err) {
      logger.error('Failed to update channel category:', err);
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to update category';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  return {
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
  };
};
