import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Image,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
  Platform,
  StatusBar
} from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { ExternalLink, MessageSquare, MapPin, Clock, Phone, Mail, Hash, Video, ChevronRight, Check, ChevronLeft, MoreHorizontal, Headphones, UserX } from 'lucide-react-native';
import { formatMessageTime } from '../utils/dateUtils';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { AppAvatar, HeaderBackButton } from '../components/common';
import { getAvatarColor } from '../components/Avatar';
import { rnShadowToBoxShadow } from "../utils/styleUtils";

const { width } = Dimensions.get('window');

const UserProfileScreen = ({ route, navigation }) => {
  const { user } = route.params;
  const { colors } = useThemeStore();
  const channels = useChannelStore(s => s.channels);
  const createDM = useChannelStore(s => s.createDM);
  const setActiveChannel = useChannelStore(s => s.setActiveChannel);
  const liveMember = useWorkspaceStore(s => {
    if (!user) return null;
    return s.members.find(m => (m.userId?._id || m.userId || m._id) === user._id);
  });
  const liveUser = useMemo(() => {
    if (!user) return null;
    return { ...user, ...(liveMember?.userId || liveMember || {}) };
  }, [user, liveMember]);

  const [loadingDM, setLoadingDM] = useState(false);
  const [localTime, setLocalTime] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const updateTime = () => setLocalTime(formatMessageTime(new Date()));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);
  
  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textPrimary }}>User not found.</Text>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Find recent DMs involving this user
  const recentDMs = channels.filter(c => 
    c.type === 'dm' && 
    c.dmParticipants?.some(pId => pId === user._id)
  );

  const handleMessage = async () => {
    setLoadingDM(true);
    try {
      const channel = await createDM(user._id);
      if (channel) {
        setActiveChannel(channel._id);
        navigation.navigate("Chat", {
          channelId: channel._id,
          channelName: channel.name || user.name,
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

  const isOnline = liveUser.onlineStatus === 'online';
  const isAway = liveUser.onlineStatus === 'away' || liveUser.onlineStatus === 'dnd';
  const statusColor = isOnline ? colors.online : isAway ? colors.away : colors.textSecondary;
  const statusText = isOnline ? 'Active' : liveUser.onlineStatus === 'away' ? 'Away' : liveUser.onlineStatus === 'dnd' ? 'Do Not Disturb' : 'Offline';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 }]}>
        <HeaderBackButton onPress={() => navigation.goBack()} />
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
                  ? { boxShadow: rnShadowToBoxShadow("#000", { width: 0, height: 4 }, 0.15, 12) }
                  : { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 }
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
          <Text style={[styles.name, { color: colors.textPrimary }]}>{liveUser.name}</Text>
          
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
              <Text style={[styles.contactEmail, { color: colors.textPrimary }]}>{user.email}</Text>
              <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Work</Text>
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
              <Text style={[styles.dmName, { color: colors.textPrimary }]}>{dm.name || user.name}</Text>
            </View>
          )) : (
            <Text style={{ color: colors.textSecondary, marginLeft: 16 }}>No recent DMs found.</Text>
          )}
        </View>

        <View style={{ height: 40 }} />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownOverlay: {
    flex: 1,
  },
  dropdownContent: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 70, // Rough estimation depending on safe area
    right: 20,
    width: 250,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 12,
    borderRadius: 8,
  },
  dropdownText: {
    fontSize: 16,
    fontWeight: '500',
  },
  scrollContent: {
    paddingTop: 8,
  },
  imageContainer: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 24,
    overflow: 'hidden',
  },
  infoSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 16,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'column',
    paddingVertical: 14,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  contactIconContainer: {
    width: 24,
    alignItems: 'center',
  },
  contactDetails: {
    flex: 1,
    gap: 4,
  },
  contactEmail: {
    fontSize: 16,
  },
  contactLabel: {
    fontSize: 14,
  },
  dmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  dmBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dmBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  dmName: {
    fontSize: 16,
  },
});

export default UserProfileScreen;
