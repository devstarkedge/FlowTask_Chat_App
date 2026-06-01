import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useDraftStore, getWorkspaceDrafts } from '../stores/draftStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useThemeStore } from '../stores/themeStore';
import { 
  ArrowLeft,
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
  const [refreshing, setRefreshing] = useState(false);

  const fetchDraftsRef = useRef(fetchDrafts);
  fetchDraftsRef.current = fetchDrafts;

  const workspaceDrafts = getWorkspaceDrafts(drafts, activeWorkspace?._id);

  useEffect(() => {
    console.log('DraftsScreen mounted');
    fetchDraftsRef.current(activeWorkspace?._id);
    return () => console.log('DraftsScreen unmounted');
  }, [activeWorkspace?._id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDrafts(activeWorkspace?._id);
    setRefreshing(false);
  };

  const handleDraftPress = (draft) => {
    navigation.navigate('Chat', {
      channelId: draft.channelId,
      threadId: draft.threadId,
      loadDraft: true,
    });
  };

  const handleDeleteDraft = (draft) => {
    clearDraft(draft.channelId, draft.workspaceId, draft.threadId);
  };

  const renderDraftItem = ({ item }) => {
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
            {formatDate(item.timestamp)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Drafts</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {workspaceDrafts.length === 0 ? (
        <View style={styles.centerContainer}>
          <Edit3 size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No drafts
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>
            Your unsent messages will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={workspaceDrafts}
          renderItem={renderDraftItem}
          keyExtractor={(item) => item._key}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={colors.primary} 
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default DraftsScreen;
