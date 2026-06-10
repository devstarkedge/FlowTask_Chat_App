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
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { formatRelativeTime } from '../utils/dateUtils';
import { ScreenLayout, ScreenHeader, EmptyState } from '../components/common';
import { 
  Edit3,
  Hash,
  MessageSquare,
  Trash2,
} from 'lucide-react-native';

const DraftsScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const drafts = useDraftStore(state => state.drafts);
  const clearDraft = useDraftStore(state => state.clearDraft);
  const fetchDrafts = useDraftStore(state => state.fetchDrafts);
  const { activeWorkspace } = useWorkspaceStore();
  const { channels } = useChannelStore();
  const [refreshing, setRefreshing] = useState(false);

  const fetchDraftsRef = useRef(fetchDrafts);
  fetchDraftsRef.current = fetchDrafts;

  const workspaceDrafts = useMemo(() => getWorkspaceDrafts(drafts, activeWorkspace?._id), [drafts, activeWorkspace?._id]);

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

  const renderDraftItem = useCallback(({ item }) => {
    const isThread = item.threadId && item.threadId !== 'root';
    
    return (
      <TouchableOpacity
        style={[styles.draftItem, { backgroundColor: colors.card }]}
        onPress={() => handleDraftPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.draftHeader}>
          <View style={styles.draftIconContainer}>
            {isThread ? (
              <MessageSquare size={16} color={colors.info} />
            ) : (
              <Hash size={16} color={colors.textSecondary} />
            )}
          </View>
          <View style={styles.draftInfo}>
            <Text style={[styles.draftLabel, { color: colors.textTertiary }]}>
              {isThread ? 'Thread draft' : 'Channel draft'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteDraft(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Trash2 size={18} color={colors.error} />
          </TouchableOpacity>
        </View>

        <Text 
          style={[styles.draftContent, { color: colors.textPrimary }]} 
          numberOfLines={3}
        >
          {item.text || item.html?.replace(/<[^>]*>/g, '') || 'Empty draft'}
        </Text>

        <View style={styles.draftMeta}>
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [colors, handleDraftPress, handleDeleteDraft]);

  const styles = createStyles(colors);

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
          contentContainerStyle={styles.listContainer}
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
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
  listContainer: {
    padding: 16,
    gap: 12,
  },
  draftItem: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  draftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  draftIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  draftInfo: {
    flex: 1,
  },
  draftLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  deleteButton: {
    padding: 4,
  },
  draftContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  draftMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
  },
});

export default DraftsScreen;
