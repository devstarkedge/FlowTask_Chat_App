import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Image,
  Platform,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import { useWorkspaceMembers } from '../hooks/queries/useWorkspaceMembers';
import { useChannelStore } from '../stores/channelStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { ExternalLink, MessageSquare, MapPin, Clock, Phone, Mail, Hash, Video, ChevronRight, Check, ChevronLeft, MoreHorizontal, Headphones, UserX, Shield } from 'lucide-react-native';
import { formatMessageTime } from '../utils/dateUtils';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { AppAvatar, HeaderBackButton } from '../components/common';
import { getAvatarColor } from '../components/Avatar';
import { rnShadowToBoxShadow } from "../utils/styleUtils";
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { useChannels } from '../hooks/queries/useChannels';


import { usersAPI } from '../services/api';


const KNOWN_WORKSPACE_ROLES = new Set(['owner', 'admin', 'member', 'guest']);

const UserProfileScreen = ({ route, navigation }) => {
  const { width } = useWindowDimensions();
  const { user } = route.params;
  const { colors } = useThemeStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { data: channels = [] } = useChannels(activeWorkspace?._id);
  const createDM = useChannelStore(s => s.createDM);
  const setActiveChannel = useChannelStore(s => s.setActiveChannel);
  const { data: members = [] } = useWorkspaceMembers(activeWorkspaceId);
  const rawTargetId = user?._id || user?.id;
  const targetId = typeof rawTargetId === 'object' ? rawTargetId?._id || rawTargetId?.id : rawTargetId;
  const targetIdStr = targetId?.toString ? targetId.toString() : targetId;
  const liveOnlineStatus = useWorkspaceStore(s => s.presenceMap?.[targetIdStr]);
  
  const [fetchedUser, setFetchedUser] = useState(null);
  const [isFetchingUser, setIsFetchingUser] = useState(true);

  const liveUser = useMemo(() => {
    if (fetchedUser) {
      return {
        ...user,
        ...fetchedUser,
        workspaceRole: fetchedUser.workspaceRole || user?.workspaceRole,
      };
    }
    if (!user) return null;
    return { ...user };
  }, [user, fetchedUser]);

  useEffect(() => {
    if (targetId) {
      const fetchFullUser = async () => {
        setIsFetchingUser(true);
        try {
          const { data } = await usersAPI.getUser(targetId);
          setFetchedUser(data?.data || data);
        } catch (err) {
          console.error('Failed to fetch full user profile', err);
        } finally {
          setIsFetchingUser(false);
        }
      };
      fetchFullUser();
    } else {
      setIsFetchingUser(false);
    }
  }, [targetId]);

  const [loadingDM, setLoadingDM] = useState(false);
  const [localTime, setLocalTime] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const updateTime = () => setLocalTime(formatMessageTime(new Date()));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);
  
  if (isFetchingUser && !fetchedUser) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!liveUser) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <UserX size={48} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, marginTop: 16, fontSize: 16 }}>User profile unavailable</Text>
      </View>
    );
  }

  // Find recent DMs involving this user
  const recentDMs = channels.filter(c => 
    c.type === 'dm' && 
    c.dmParticipants?.some(pId => pId === targetIdStr)
  );

  const handleMessage = async () => {
    setLoadingDM(true);
    try {
      // If we have an existing channelId context from the route, go back to it
      if (route.params?.channelId) {
        setActiveChannel(route.params.channelId);
        navigation.navigate("Chat", {
          channelId: route.params.channelId,
        });
        return;
      }

      const channel = await createDM(targetIdStr);
      if (channel) {
        setActiveChannel(channel._id);
        navigation.navigate("Chat", {
          channelId: channel._id,
          channelName: channel.name || liveUser.name,
        });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Failed to start message' });
    } finally {
      setLoadingDM(false);
    }
  };

  const handleHuddle = () => {
    Toast.show({ type: 'info', text1: 'Huddles are coming soon!' });
  };

  const imageSize = width - 32;

  const handleCopyHuddle = () => {
    setShowDropdown(false);
    Toast.show({ type: 'success', text1: 'Huddle link copied' });
  };

  const handleCopyDisplayName = () => {
    setShowDropdown(false);
    Toast.show({ type: 'success', text1: 'Display name copied' });
  };

  const handleHideUser = () => {
    setShowDropdown(false);
    Toast.show({ type: 'success', text1: `${liveUser.name} hidden` });
  };

  const isOnline = liveOnlineStatus === 'online' || liveUser.onlineStatus === 'online';
  const isAway = liveOnlineStatus === 'away' || liveOnlineStatus === 'dnd' || liveUser.onlineStatus === 'away' || liveUser.onlineStatus === 'dnd';
  const statusColor = isOnline ? colors.online : isAway ? colors.away : colors.textSecondary;
  const statusText = isOnline ? 'Active' : (liveOnlineStatus === 'away' || liveUser.onlineStatus === 'away') ? 'Away' : (liveOnlineStatus === 'dnd' || liveUser.onlineStatus === 'dnd') ? 'Do Not Disturb' : 'Offline';

  const memberRecord = members.find(
    (m) => (m.userId?._id || m.userId)?.toString() === targetIdStr
  );
  const workspaceRole =
    (KNOWN_WORKSPACE_ROLES.has(liveUser.workspaceRole) ? liveUser.workspaceRole : null) ||
    (KNOWN_WORKSPACE_ROLES.has(liveUser.role) ? liveUser.role : null) ||
    memberRecord?.role ||
    'member';
  const formattedWorkspaceRole =
    workspaceRole.charAt(0).toUpperCase() + workspaceRole.slice(1);
  const jobTitle =
    liveUser.title ||
    (KNOWN_WORKSPACE_ROLES.has(liveUser.role) ? '' : liveUser.role);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: verticalScale(12) }]}>
        <HeaderBackButton onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('Main');
          }
        }} />
        {/* <TouchableOpacity onPress={() => setShowDropdown(true)} style={[styles.headerButton, { backgroundColor: colors.backgroundSecondary }]}>
          <MoreHorizontal size={24} color={colors.textPrimary} />
        </TouchableOpacity> */}
      </View>

      {/* Dropdown Menu Modal */}
      {/* <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={() => setShowDropdown(false)}>
        <TouchableWithoutFeedback onPress={() => setShowDropdown(false)}>
          <View style={styles.dropdownOverlay}>
            <TouchableWithoutFeedback>
              <View style={[
                styles.dropdownContent, 
                { backgroundColor: colors.backgroundSecondary },
                Platform.OS === 'web' 
                  ? { boxShadow: rnShadowToBoxShadow("#000", { width: scale(0), height: verticalScale(4) }, 0.15, 12) }
                  : { elevation: 8, shadowColor: '#000', shadowOffset: { width: scale(0), height: verticalScale(4) }, shadowOpacity: 0.15, shadowRadius: 12 }
              ]}>
                <TouchableOpacity style={styles.dropdownItem} onPress={handleCopyHuddle}>
                  <Headphones size={20} color={colors.textPrimary} />
                  <Text style={[styles.dropdownText, { color: colors.textPrimary }]}>Copy Huddle Link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dropdownItem} onPress={handleCopyDisplayName}>
                  <ExternalLink size={20} color={colors.textPrimary} />
                  <Text style={[styles.dropdownText, { color: colors.textPrimary }]}>Copy Display Name</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dropdownItem} onPress={handleHideUser}>
                  <UserX size={20} color={colors.error} />
                  <Text style={[styles.dropdownText, { color: colors.error }]}>Hide {liveUser.name?.split(' ')[0]}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal> */}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Profile Image */}
        <View style={styles.imageContainer}>
          <AppAvatar user={liveUser} size={imageSize} showStatus={false} />
        </View>

        {/* User Info */}
        <View style={styles.infoSection}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>
            {liveUser.displayName || liveUser.name}
          </Text>
          {(liveUser.displayName && liveUser.displayName !== liveUser.name) && (
            <Text style={[styles.fullName, { color: colors.textSecondary }]}>
              {liveUser.name}
            </Text>
          )}

          {jobTitle ? (
            <Text style={[styles.roleText, { color: colors.textSecondary, textTransform: 'capitalize', marginTop: 2, marginBottom: 6 }]}>
              {jobTitle}
            </Text>
          ) : null}

          {liveUser.customStatus?.text && (
            <View style={[styles.customStatusRow, { backgroundColor: colors.backgroundSecondary }]}>
              {liveUser.customStatus?.emoji && (
                <Text style={styles.customStatusEmoji}>{liveUser.customStatus.emoji}</Text>
              )}
              <Text style={[styles.customStatusText, { color: colors.textPrimary }]}>
                {liveUser.customStatus.text}
              </Text>
            </View>
          )}
          
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: colors.textPrimary }]}>{statusText}</Text>
          </View>
          
          <View style={styles.timeRow}>
            <Clock size={20} color={colors.textPrimary} />
            <Text style={[styles.timeText, { color: colors.textPrimary }]}>
              {localTime} local time
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary }]} onPress={handleMessage} activeOpacity={0.7}>
            {loadingDM ? <ActivityIndicator size="small" color={colors.textPrimary} /> : <MessageSquare size={20} color={colors.textPrimary} />}
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary }]} onPress={handleHuddle} activeOpacity={0.7}>
            <Headphones size={20} color={colors.textPrimary} />
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Huddle</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Contact Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Contact Information</Text>
          
          <View style={styles.contactRow}>
            <View style={styles.contactIconContainer}>
              <Mail size={24} color={colors.textPrimary} />
            </View>
            <View style={styles.contactDetails}>
              <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>EMAIL</Text>
              <Text style={[styles.contactEmail, { color: colors.textPrimary }]}>{liveUser.email}</Text>
            </View>
          </View>

          <View style={[styles.contactRow, { marginTop: verticalScale(16) }]}>
            <View style={styles.contactIconContainer}>
              <Shield size={24} color={colors.textPrimary} />
            </View>
            <View style={styles.contactDetails}>
              <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>ROLE</Text>
              <Text style={[styles.contactEmail, { color: colors.textPrimary, fontWeight: '700' }]}>
                {formattedWorkspaceRole}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Recent DMs */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent DMs</Text>
          {recentDMs.length > 0 ? recentDMs.map((dm, idx) => (
            <View key={dm._id} style={styles.dmRow}>
              <View style={[styles.dmBadge, { backgroundColor: colors.backgroundSecondary }]}>
                <Text style={[styles.dmBadgeText, { color: colors.textPrimary }]}>{idx + 1}</Text>
              </View>
              <Text style={[styles.dmName, { color: colors.textPrimary }]}>{dm.name || liveUser.name}</Text>
            </View>
          )) : (
            <Text style={{ color: colors.textSecondary, marginLeft: scale(16) }}>No recent DMs found.</Text>
          )}
        </View>

        <View style={{ height: verticalScale(40) }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
  },
  headerButton: {
    width: scale(44),
    height: verticalScale(44),
    borderRadius: moderateScale(22),
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownOverlay: {
    flex: 1,
  },
  dropdownContent: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 70, // Rough estimation depending on safe area
    right: scale(20),
    width: scale(250),
    borderRadius: moderateScale(16),
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(8),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(12),
    gap: 12,
    borderRadius: moderateScale(8),
  },
  dropdownText: {
    fontSize: moderateScale(16),
    fontWeight: '500',
  },
  scrollContent: {
    paddingTop: verticalScale(8),
  },
  imageContainer: {
    alignItems: 'center',
    marginHorizontal: scale(16),
    marginBottom: verticalScale(20),
    borderRadius: moderateScale(24),
    overflow: 'hidden',
  },
  infoSection: {
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(20),
  },
  name: {
    fontSize: moderateScale(22),
    fontWeight: '700',
    marginBottom: verticalScale(4),
  },
  fullName: {
    fontSize: moderateScale(16),
    marginBottom: verticalScale(4),
  },
  roleText: {
    fontSize: moderateScale(15),
  },
  customStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(8),
    marginTop: verticalScale(4),
    marginBottom: verticalScale(8),
    alignSelf: 'flex-start',
    gap: 8,
  },
  customStatusEmoji: {
    fontSize: moderateScale(16),
  },
  customStatusText: {
    fontSize: moderateScale(14),
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: verticalScale(8),
  },
  statusDot: {
    width: scale(10),
    height: verticalScale(10),
    borderRadius: moderateScale(5),
  },
  statusText: {
    fontSize: moderateScale(16),
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: moderateScale(16),
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: scale(16),
    gap: 12,
    marginBottom: verticalScale(24),
  },
  actionButton: {
    flex: 1,
    flexDirection: 'column',
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(16),
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  actionButtonText: {
    fontSize: moderateScale(16),
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginBottom: verticalScale(24),
  },
  section: {
    marginBottom: verticalScale(24),
  },
  sectionTitle: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(16),
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: scale(16),
  },
  contactIconContainer: {
    width: scale(24),
    alignItems: 'center',
  },
  contactDetails: {
    flex: 1,
    gap: 4,
  },
  contactEmail: {
    fontSize: moderateScale(16),
  },
  contactLabel: {
    fontSize: moderateScale(14),
  },
  dmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(16),
  },
  dmBadge: {
    width: scale(28),
    height: verticalScale(28),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(12),
  },
  dmBadgeText: {
    fontSize: moderateScale(13),
    fontWeight: '700',
  },
  dmName: {
    fontSize: moderateScale(16),
  },
});

export default UserProfileScreen;
