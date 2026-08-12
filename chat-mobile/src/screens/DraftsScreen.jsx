import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useDraftStore, getWorkspaceDrafts } from '../stores/draftStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChatStore } from '../stores/chatStore';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { useAuthStore } from '../stores/authStore';
import { formatRelativeTime } from '../utils/dateUtils';
import { ScreenLayout, ScreenHeader, EmptyState } from '../components/common';
import { 
  Edit3,
  Hash,
  MessageSquare,
  Trash2,
  Clock,
  Send,
} from 'lucide-react-native';
import ScheduleModal from '../components/ScheduleModal';
import { AppAvatar } from '../components/common';
import { useConversationDetails } from '../hooks/useConversationDetails';
import { Alert } from 'react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const DraftItem = React.memo(({ item, onPress, onSchedule, onDelete, onSend, colors }) => {
  const isThread = item.threadId && item.threadId !== 'root';
  const { isDM, icon: IconComponent, dmUser, displayName } = useConversationDetails(item.channelId);
  const styles = createStyles(colors);

  return (
    <TouchableOpacity
      style={[styles.draftItem, { backgroundColor: colors.card }]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.draftHeader}>
        <View style={styles.draftIconContainer}>
          {isThread ? (
            <MessageSquare size={16} color={colors.info} />
          ) : isDM && dmUser ? (
            <AppAvatar user={dmUser} size={20} showStatus={true} statusSize={6} />
          ) : IconComponent ? (
            <IconComponent size={16} color={colors.textSecondary} />
          ) : null}
        </View>
        <View style={styles.draftInfo}>
          <Text style={[styles.draftLabel, { color: colors.textTertiary }]} numberOfLines={1}>
            {isThread ? `Thread reply in ${isDM ? '' : ''}${displayName}` : `${isDM ? '' : ''}${displayName}`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onSend(item)}
          hitSlop={{ top: verticalScale(10), bottom: verticalScale(10), left: scale(10), right: scale(10) }}
        >
          <Send size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onSchedule(item)}
          hitSlop={{ top: verticalScale(10), bottom: verticalScale(10), left: scale(10), right: scale(10) }}
        >
          <Clock size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onDelete(item)}
          hitSlop={{ top: verticalScale(10), bottom: verticalScale(10), left: scale(10), right: scale(10) }}
        >
          <Trash2 size={18} color={colors.error} />
        </TouchableOpacity>
      </View>

      <Text 
        style={[styles.draftContent, { color: colors.textPrimary }]} 
        numberOfLines={3}
      >
        {item.pendingFiles?.length > 0 ? `[${item.pendingFiles.length} Attachment${item.pendingFiles.length > 1 ? 's' : ''}] ` : ''}
        {item.text || item.html?.replace(/<[^>]*>/g, '') || (item.pendingFiles?.length > 0 ? '' : 'Empty draft')}
      </Text>

      <View style={styles.draftMeta}>
        <Text style={[styles.metaText, { color: colors.textTertiary }]}>
          {formatRelativeTime(item.timestamp)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const DraftsScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const drafts = useDraftStore(state => state.drafts);
  const clearDraft = useDraftStore(state => state.clearDraft);
  const fetchDrafts = useDraftStore(state => state.fetchDrafts);
  const { activeWorkspace } = useWorkspaceStore();
  const { channels } = useChannelStore();
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [refreshing, setRefreshing] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState(null);

  const fetchDraftsRef = useRef(fetchDrafts);
  fetchDraftsRef.current = fetchDrafts;
  const userId = useAuthStore(state => state.user?._id);
  const workspaceDrafts = useMemo(() => getWorkspaceDrafts(drafts, activeWorkspace?._id, userId), [drafts, activeWorkspace?._id, userId]);

  useEffect(() => {
    fetchDraftsRef.current(activeWorkspace?._id);
  }, [activeWorkspace?._id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDrafts(activeWorkspace?._id);
    setRefreshing(false);
  }, [fetchDrafts, activeWorkspace?._id]);

  const handleDraftPress = useCallback((draft) => {
    const channel = channels.find(ch => ch._id === draft.channelId);
    navigation.navigate('Chat', {
      channelId: draft.channelId,
      channelName: channel?.name || 'Chat',
      threadId: draft.threadId,
      loadDraft: true,
    });
  }, [channels, navigation]);

  const handleDeleteDraft = useCallback((draft) => {
    clearDraft(draft.channelId, draft.workspaceId, draft.threadId);
  }, [clearDraft]);

  const handleScheduleSend = useCallback(async (scheduledAt) => {
    if (!scheduleDraft) return;
    try {
      await sendMessage(scheduleDraft.channelId, scheduleDraft.text, {
        htmlContent: scheduleDraft.html,
        threadId: scheduleDraft.threadId === 'root' ? null : scheduleDraft.threadId,
        scheduledAt,
      });
      clearDraft(scheduleDraft.channelId, scheduleDraft.workspaceId, scheduleDraft.threadId);
      setScheduleDraft(null);
      fetchDrafts(activeWorkspace?._id);
    } catch (err) {
      console.error('Failed to schedule draft', err);
      Alert.alert('Error', 'Failed to schedule message');
    }
  }, [scheduleDraft, clearDraft, activeWorkspace?._id, fetchDrafts, sendMessage]);

  const handleSendDraft = useCallback(async (draft) => {
    try {
      const result = await sendMessage(draft.channelId, draft.text, {
        htmlContent: draft.html,
        threadId: draft.threadId === 'root' ? null : draft.threadId,
      });
      
      if (result && result.error) {
        throw new Error('Failed to send message via API');
      }

      clearDraft(draft.channelId, draft.workspaceId, draft.threadId);
      fetchDrafts(activeWorkspace?._id);
    } catch (err) {
      console.error('Failed to send draft', err);
      Alert.alert('Error', 'Failed to send message');
    }
  }, [clearDraft, activeWorkspace?._id, fetchDrafts, sendMessage]);

  const renderDraftItem = useCallback(({ item }) => {
    return (
      <DraftItem
        item={item}
        onPress={handleDraftPress}
        onSchedule={setScheduleDraft}
        onDelete={handleDeleteDraft}
        onSend={handleSendDraft}
        colors={colors}
      />
    );
  }, [handleDraftPress, handleDeleteDraft, handleSendDraft, colors]);

  const stylesObj = createStyles(colors);

  return (
    <ScreenLayout>
      <ScreenHeader title="Drafts" onBack={() => navigation.goBack()} />

      {/* Content */}
      {workspaceDrafts.length === 0 ? (
        <EmptyState icon={Edit3} title="No drafts" subtitle="Your unsent messages will appear here" />
      ) : (
        <FlatList
          data={workspaceDrafts}
          renderItem={renderDraftItem}
          keyExtractor={(item) => item._key}
          contentContainerStyle={stylesObj.listContainer}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={colors.primary} 
            />
          }
        />
      )}

      <ScheduleModal
        visible={!!scheduleDraft}
        onClose={() => setScheduleDraft(null)}
        onSchedule={handleScheduleSend}
        colors={colors}
      />
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
  listContainer: {
    padding: moderateScale(16),
    gap: 12,
  },
  draftItem: {
    padding: moderateScale(16),
    borderRadius: moderateScale(12),
    gap: 12,
  },
  draftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  draftIconContainer: {
    width: scale(32),
    height: verticalScale(32),
    justifyContent: 'center',
    alignItems: 'center',
  },
  draftInfo: {
    flex: 1,
  },
  draftLabel: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  actionButton: {
    padding: moderateScale(4),
  },
  draftContent: {
    fontSize: moderateScale(14),
    lineHeight: 20,
  },
  draftMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: moderateScale(12),
  },
});

export default DraftsScreen;
