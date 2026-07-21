import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useChannelStore } from '../stores/channelStore';
import { useAuthStore } from '../stores/authStore';
import api, { channelAPI, notificationPrefAPI, usersAPI, directoriesAPI } from '../services/api';
import logger from '../utils/logger';
import Toast from 'react-native-toast-message';

export const useChannelDetails = (channelId, channelName, navigation) => {
  const createDM = useChannelStore((s) => s.createDM);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const updateChannel = useChannelStore((s) => s.updateChannel);
  const starChannel = useChannelStore((s) => s.starChannel);
  const starredIds = useChannelStore((s) => s.starredIds) || [];
  const channels = useChannelStore((s) => s.channels) || [];
  const { user: currentUser } = useAuthStore();

  const channel = channels.find((c) => c._id === channelId);
  const isOneToOneDM = channel?.type === 'dm' && (channel?.dmParticipants?.length || 0) <= 2;

  const [members, setMembers] = useState([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [showMembersList, setShowMembersList] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
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
        setIsMuted(channelPrefs.paused || false);
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
        const params = { limit: 100 };
        if (query) params.search = query;
        const { data } = await directoriesAPI.getUsers(params);
        const contacts = data.data || data;
        
        const existingIds = new Set(members.map(m => m._id));
        
        const filtered = (Array.isArray(contacts) ? contacts : contacts?.users || [])
          .map(u => ({
            _id: u._id || u.chatUserId,
            name: u.name,
            email: u.email,
            avatar: u.avatar
          }))
          .filter(u => u._id && u._id !== currentUser?._id && !existingIds.has(u._id));
        setMemberSearchResults(filtered);
      } catch (err) {
        logger.error("Failed to search members:", err);
      } finally {
        setIsSearchingMembers(false);
      }
    };

    const timer = setTimeout(fetchSearchMembers, memberSearchQuery ? 350 : 50);
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
    try {
      setAddingMemberId(userId);
      await channelAPI.addMember(channelId, userId);
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
    setIsMuted(val);
    try {
      await notificationPrefAPI.updateChannel(channelId, { paused: val });
    } catch (err) {
      logger.error('Failed to update channel mute preferences:', err);
      setIsMuted(!val);
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

  return {
    currentUser,
    channel,
    isOneToOneDM,
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
