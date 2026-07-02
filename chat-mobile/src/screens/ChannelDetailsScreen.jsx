import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { useAuthStore } from '../stores/authStore';
import { Hash, Users, Pin, Bell, Settings, LogOut, ArrowLeft, FolderOpen, FileText, Clock, User, Mail, Briefcase } from 'lucide-react-native';
import { channelAPI, notificationPrefAPI, usersAPI } from '../services/api';
import { AppAvatar } from '../components/common';
import logger from '../utils/logger';

const ChannelDetailsScreen = ({ route, navigation }) => {
  const { channelId, channelName, memberCount: initialMemberCount = 0 } = route.params || {};
  const { colors } = useThemeStore();
  const createDM = useChannelStore((s) => s.createDM);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const channels = useChannelStore((s) => s.channels) || [];
  const { user: currentUser } = useAuthStore();

  const channel = channels.find((c) => c._id === channelId);
  const isOneToOneDM = channel?.type === 'dm' && (channel?.dmParticipants?.length || 0) <= 2;

  const [members, setMembers] = useState([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [showMembersList, setShowMembersList] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isMuteLoading, setIsMuteLoading] = useState(false);

  const handleMemberPress = async (member) => {
    try {
      const channel = await createDM(member._id);
      if (channel) {
        setActiveChannel(channel._id);
        navigation.navigate("Chat", {
          channelId: channel._id,
          channelName: channel.name || member.name,
        });
      }
    } catch (err) {
      logger.error("Failed to start DM:", err);
    }
  };

  // Load members and notification preferences
  useEffect(() => {
    if (channelId) {
      fetchMembers();
      fetchNotificationPrefs();
    }
  }, [channelId]);

  const fetchMembers = async () => {
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
  };

  const fetchNotificationPrefs = async () => {
    try {
      const res = await notificationPrefAPI.get();
      const channelPrefs = res.data?.data?.channels?.[channelId];
      if (channelPrefs) {
        setIsMuted(channelPrefs.paused || false);
      }
    } catch (err) {
      logger.error('Failed to load notification preferences:', err);
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
              Alert.alert('Error', 'Failed to leave the channel.');
            }
          },
        },
      ]
    );
  };

  const DetailItem = ({ icon: Icon, label, onPress, children }) => (
    <TouchableOpacity style={[styles.detailItem, { borderBottomColor: colors.border }]} onPress={onPress}>
      <Icon size={20} color={colors.textSecondary} />
      <View style={styles.detailLabelContainer}>
        <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>{label}</Text>
      </View>
      {children}
    </TouchableOpacity>
  );

  if (isOneToOneDM) {
    const otherUser = members.find(m => m._id !== currentUser?._id);
    const dmName = otherUser?.name || channelName;
    const dmStatus = otherUser?.onlineStatus || channel?.onlineStatus || 'offline';
    const dmCustomStatusText = otherUser?.customStatus?.text || '';
    const dmCustomStatusEmoji = otherUser?.customStatus?.emoji || '';
    const dmEmail = otherUser?.email || '';
    const dmRole = otherUser?.role || 'Member';
    const dmTimezone = otherUser?.chatPreferences?.dndSchedule?.timezone || 'UTC';

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        {/* Header Bar */}
        <View style={[styles.navHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: colors.textPrimary }]}>Member Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* User Info Header */}
          <View style={[styles.profileHeader, { borderBottomColor: colors.border }]}>
            <View style={{ marginBottom: 12 }}>
              <AppAvatar user={otherUser || { name: dmName, avatar: channel?.avatar }} size={90} showStatus statusSize={18} />
            </View>
            <Text style={[styles.channelName, { color: colors.textPrimary }]}>{dmName}</Text>
            <Text style={[styles.presenceText, { color: dmStatus === 'online' ? colors.online : colors.textTertiary }]}>
              {dmStatus === 'online' ? 'Active' : 'Away'}
            </Text>

            {/* Custom Status */}
            {(dmCustomStatusEmoji || dmCustomStatusText) && (
              <View style={[styles.customStatusContainer, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                {dmCustomStatusEmoji && <Text style={styles.customStatusEmoji}>{dmCustomStatusEmoji}</Text>}
                {dmCustomStatusText && (
                  <Text style={[styles.customStatusText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {dmCustomStatusText}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* About Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ABOUT</Text>
            <View style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              {dmEmail ? (
                <View style={styles.infoRow}>
                  <Mail size={18} color={colors.textSecondary} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>Email Address</Text>
                    <Text style={{ fontSize: 15, color: colors.textPrimary, marginTop: 2 }}>{dmEmail}</Text>
                  </View>
                </View>
              ) : null}

              <View style={[styles.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Briefcase size={18} color={colors.textSecondary} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>Role</Text>
                  <Text style={{ fontSize: 15, color: colors.textPrimary, marginTop: 2, textTransform: 'capitalize' }}>{dmRole}</Text>
                </View>
              </View>

              <View style={[styles.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Clock size={18} color={colors.textSecondary} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>Local Time</Text>
                  <Text style={{ fontSize: 15, color: colors.textPrimary, marginTop: 2 }}>{dmTimezone}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Shared Content Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SHARED CONTENT</Text>
            <View style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => navigation.navigate('PinnedMessages', { channelId, channelName })}
              >
                <Pin size={18} color={colors.textSecondary} style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 15, color: colors.textPrimary, flex: 1 }}>Pinned Messages</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                onPress={() => navigation.navigate('Files', { channelId, channelName })}
              >
                <FolderOpen size={18} color={colors.textSecondary} style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 15, color: colors.textPrimary, flex: 1 }}>Shared Files</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                onPress={() => navigation.navigate('CanvasList', { channelId, channelName })}
              >
                <FileText size={18} color={colors.textSecondary} style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 15, color: colors.textPrimary, flex: 1 }}>Shared Canvases</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Action Row */}
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <DetailItem
                icon={Bell}
                label="Mute Notifications"
                onPress={null}
              >
                {isMuteLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Switch
                    value={isMuted}
                    onValueChange={handleToggleMute}
                    trackColor={{ false: '#767577', true: colors.primary + '80' }}
                    thumbColor={isMuted ? colors.primary : '#f4f3f4'}
                  />
                )}
              </DetailItem>
            </View>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header Bar */}
      <View style={[styles.navHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={[styles.channelIcon, { backgroundColor: colors.primary + '15' }]}>
            <Hash size={36} color={colors.primary} />
          </View>
          <Text style={[styles.channelName, { color: colors.textPrimary }]}>#{channelName}</Text>
          <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
            {members.length || initialMemberCount} members
          </Text>
        </View>

        <View style={styles.section}>
          <DetailItem
            icon={Users}
            label="View Members"
            onPress={() => setShowMembersList(!showMembersList)}
          />

          {showMembersList && (
            <View style={[styles.membersContainer, { backgroundColor: colors.backgroundSecondary }]}>
              {isLoadingMembers ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ padding: 12 }} />
              ) : members.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No members loaded</Text>
              ) : (
                members.map((member) => (
                  <TouchableOpacity
                    key={member._id}
                    style={styles.memberRow}
                    onPress={() => handleMemberPress(member)}
                    activeOpacity={0.6}
                  >
                    <AppAvatar user={member} size={28} />
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                        {member.name || 'Member'}
                      </Text>
                      <Text style={[styles.memberEmail, { color: colors.textSecondary }]}>
                        {member.email}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          <DetailItem
            icon={Pin}
            label="Pinned Messages"
            onPress={() => navigation.navigate('PinnedMessages', { channelId, channelName })}
          />

          <DetailItem
            icon={Bell}
            label="Mute Notifications"
            onPress={null}
          >
            {isMuteLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Switch
                value={isMuted}
                onValueChange={handleToggleMute}
                trackColor={{ false: '#767577', true: colors.primary + '80' }}
                thumbColor={isMuted ? colors.primary : '#f4f3f4'}
              />
            )}
          </DetailItem>

          <DetailItem
            icon={LogOut}
            label="Leave Channel"
            onPress={handleLeaveChannel}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
  },
  presenceText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  customStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '85%',
  },
  customStatusEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  customStatusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  channelIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  channelName: {
    fontSize: 22,
    fontWeight: '700',
  },
  memberCount: {
    fontSize: 13,
    marginTop: 4,
  },
  section: {
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  detailLabelContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  membersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
  },
  memberEmail: {
    fontSize: 11,
    marginTop: 1,
  },
  emptyText: {
    fontSize: 13,
    paddingVertical: 8,
    textAlign: 'center',
  },
});

export default ChannelDetailsScreen;
