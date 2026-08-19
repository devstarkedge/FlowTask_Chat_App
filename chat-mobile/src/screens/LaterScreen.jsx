import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useLaterStore } from '../stores/laterStore';
import { useThemeStore } from '../stores/themeStore';
import { formatRelativeTime } from '../utils/dateUtils';
import { ScreenLayout, FilterTabs, LoadingState, EmptyState, HeaderBackButton } from '../components/common';
import ReminderModal from '../components/ReminderModal';
import CreateReminderModal from '../components/CreateReminderModal';
import { 
  Bookmark,
  FileText,
  Clock,
  ChevronLeft,
  Plus,
  AlignRight,
  Check,
  Archive,
  Trash2,
  Share,
  Link,
  Square,
  Hash,
  Lock,
} from 'lucide-react-native';
import { AppAvatar } from '../components/common';
import { useConversationDetails } from '../hooks/useConversationDetails';
import logger from '../utils/logger';
import Toast from 'react-native-toast-message';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const LaterItem = React.memo(({ item, onPress, onLongPress, onBottomSheet, filter, handleStatusChange, setReminderTarget, colors }) => {
  const message = item.messageId;
  const isCanvas = item.type === 'canvas' || item.scope === 'canvas' || !!item.canvasRef;
  const isCustom = (item.type === 'custom' || item.type === 'standalone') && !isCanvas;
  const canvasObj = item.canvasId || (typeof item.canvasRef === 'object' ? item.canvasRef : {});

  let messageText = 'Saved Message';
  if (message) {
    messageText = message.content || message.text || message.message || messageText;
    if (typeof messageText === 'string') {
      messageText = messageText.replace(/<[^>]*>?/gm, '').trim() || messageText;
    }
  }

  let title;
  if (isCustom) title = item.title;
  else if (isCanvas) title = canvasObj.title || item.title || 'Untitled Canvas';
  else if (message?.contentType === 'gif' || item.contentType === 'gif') title = '[GIF]';
  else if (message?.contentType === 'audio' || item.contentType === 'audio') title = '[Voice Message]';
  else if (message?.contentType === 'video' || item.contentType === 'video') title = '[Video]';
  else title = messageText;

  const formattedDate = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  let subtitle = '';
  if (item.recurrence && item.recurrence !== 'None') {
    subtitle = `Repeats ${item.recurrence.toLowerCase()}`;
  } else if (isCustom) {
    subtitle = `Custom reminder`;
  } else if (isCanvas && canvasObj.updatedAt) {
    const days = Math.floor((new Date() - new Date(canvasObj.updatedAt)) / (1000 * 60 * 60 * 24));
    subtitle = days > 0 ? `Last edited ${days} days ago` : 'Last edited today';
  } else {
    subtitle = `Saved ${formatRelativeTime(item.createdAt)}`;
  }
  
  const styles = createStyles(colors);
  const { isDM, icon: ChannelIcon, dmUser, displayName } = useConversationDetails(item.channelId);
  const IconComponent = isCustom ? Clock : (isCanvas ? FileText : Bookmark);

  return (
    <TouchableOpacity
      style={[styles.savedItem]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.topRow}>
        <Text style={[styles.typeLabel, { color: colors.textSecondary }]}>{isCustom ? 'Reminder' : (isCanvas ? 'Canvas' : 'Message')}</Text>
        <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{formattedDate}</Text>
      </View>

      <View style={styles.mainRow}>
        <View style={styles.mainIconBox}>
          {isCustom || isCanvas ? (
            <IconComponent size={20} color="#fff" />
          ) : isDM && dmUser ? (
            <AppAvatar user={dmUser} size={28} showStatus={true} statusSize={8} />
          ) : ChannelIcon ? (
            <ChannelIcon size={20} color="#fff" />
          ) : (
            <Bookmark size={20} color="#fff" />
          )}
        </View>
        <Text style={[styles.mainTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
      </View>

      {!isCustom && (
        <TouchableOpacity 
          style={[styles.embeddedCard, { borderColor: colors.border }]}
          onPress={() => onPress(item)}
          onLongPress={() => onBottomSheet(item)}
          activeOpacity={0.7}
        >
          <View style={styles.embeddedIconBox}>
            {isCanvas ? (
              <FileText size={16} color="#fff" />
            ) : isDM && dmUser ? (
              <AppAvatar user={dmUser} size={20} showStatus={true} statusSize={6} />
            ) : ChannelIcon ? (
              <ChannelIcon size={16} color="#fff" />
            ) : (
              <Bookmark size={16} color="#fff" />
            )}
          </View>
          <View style={styles.embeddedInfo}>
            <Text style={[styles.embeddedTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
            <Text style={[styles.embeddedSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {isCanvas && canvasObj.updatedAt
                ? subtitle
                : `Message in ${isDM ? displayName : displayName}`}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {isCustom && (
        <Text style={[styles.embeddedSubtitle, { color: colors.textSecondary, marginLeft: scale(56), marginTop: -8 }]}>{subtitle}</Text>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity 
          style={[styles.completeBtn, { backgroundColor: filter === 'completed' ? colors.border : '#0F835F' }]}
          onPress={() => handleStatusChange(message?._id || item.messageId?._id || item._id, filter === 'completed' ? 'in_progress' : 'completed')}
        >
          <Text style={[styles.completeBtnText, { color: filter === 'completed' ? colors.textPrimary : '#fff' }]}>
            {filter === 'completed' ? 'Reopen' : 'Complete'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.clockBtn, { borderColor: colors.border }]}
          onPress={() => setReminderTarget(item)}
        >
          <Clock size={16} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

const LaterScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const savedMessages = useLaterStore(state => state.savedMessages ?? []);
  const isLoading = useLaterStore(state => state.isLoading);
  const fetchSavedMessages = useLaterStore(state => state.fetchSavedMessages);
  const updateStatus = useLaterStore(state => state.updateStatus);
  const updateReminder = useLaterStore(state => state.updateReminder);
  const toggleSaveMessage = useLaterStore(state => state.toggleSaveMessage);
  const addCustomReminder = useLaterStore(state => state.addCustomReminder);
  const deleteSavedItem = useLaterStore(state => state.deleteSavedItem);
  
  const [filter, setFilter] = useState('in_progress'); 
  const [refreshing, setRefreshing] = useState(false);
  const [reminderTarget, setReminderTarget] = useState(null); 
  const [contextMenuTarget, setContextMenuTarget] = useState(null);
  const [bottomSheetTarget, setBottomSheetTarget] = useState(null);
  const [createReminderVisible, setCreateReminderVisible] = useState(false);

  const fetchSavedMessagesRef = useRef(fetchSavedMessages);
  fetchSavedMessagesRef.current = fetchSavedMessages;

  useEffect(() => {
    fetchSavedMessagesRef.current();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSavedMessages();
    setRefreshing(false);
  }, [fetchSavedMessages]);

  const inProgressCount = useMemo(() => savedMessages.filter(m => !m.status || m.status === 'in_progress').length, [savedMessages]);
  const archivedCount = useMemo(() => savedMessages.filter(m => m.status === 'archived').length, [savedMessages]);
  const completedCount = useMemo(() => savedMessages.filter(m => m.status === 'completed').length, [savedMessages]);

  const filteredMessages = useMemo(() => savedMessages.filter(msg => {
    const status = msg.status || 'in_progress';
    return status === filter;
  }), [savedMessages, filter]);

  const handleMessagePress = useCallback((savedMessage) => {
    const channelId = savedMessage.channelId?._id || savedMessage.channelId;
    const canvasId = savedMessage.canvasRef?._id || savedMessage.canvasRef || savedMessage.canvasId?._id || savedMessage.canvasId;
    if (savedMessage.type === 'canvas' || savedMessage.scope === 'canvas' || canvasId) {
      if (!channelId || !canvasId) return;
      navigation.navigate('CanvasEditor', {
        canvasId,
        channelId,
      });
    } else if (savedMessage.messageId) {
      if (!channelId) return;
      navigation.navigate('Chat', {
        channelId,
        messageId: savedMessage.messageId._id || savedMessage.messageId,
      });
    }
  }, [navigation]);

  const handleStatusChange = useCallback(async (messageId, newStatus) => {
    try {
      await updateStatus(messageId, newStatus);
    } catch (error) {
      logger.error('Failed to update status:', error);
    }
  }, [updateStatus]);

  const handleSetReminder = useCallback(async (date, recurrence = 'None') => {
    if (!reminderTarget) return;
    const targetId = reminderTarget.messageId?._id || reminderTarget.messageId || reminderTarget._id;
    try {
      await updateReminder(targetId, { date, recurrence });
    } catch (error) {
      logger.error('Failed to set reminder:', error);
    }
  }, [reminderTarget, updateReminder]);

  const renderSavedItem = useCallback(({ item }) => {
    return (
      <LaterItem
        item={item}
        onPress={handleMessagePress}
        onLongPress={setContextMenuTarget}
        onBottomSheet={setBottomSheetTarget}
        filter={filter}
        handleStatusChange={handleStatusChange}
        setReminderTarget={setReminderTarget}
        colors={colors}
      />
    );
  }, [handleMessagePress, setContextMenuTarget, setBottomSheetTarget, filter, handleStatusChange, setReminderTarget, colors]);

  const styles = createStyles(colors);
  
  const filterTabs = [
    { key: 'in_progress', label: `In Progress ${inProgressCount}` },
    { key: 'archived', label: `Archived ${archivedCount}` },
    { key: 'completed', label: `Completed ${completedCount}` },
  ];

  return (
    <ScreenLayout>
      {/* Custom Header */}
      <View style={styles.customHeader}>
        <HeaderBackButton onPress={() => navigation.goBack()} />
        
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Later</Text>
        
        <View style={styles.headerRightPill}>
          <TouchableOpacity style={styles.headerIconButton} onPress={() => setCreateReminderVisible(true)}>
            <Plus size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          {/* <TouchableOpacity style={styles.headerIconButton}>
            <AlignRight size={18} color={colors.textPrimary} />
          </TouchableOpacity> */}
        </View>
      </View>

      <FilterTabs tabs={filterTabs} activeTab={filter} onTabChange={setFilter} />

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : filteredMessages.length === 0 ? (
        <EmptyState icon={Bookmark} title="No saved items" />
      ) : (
        <FlatList
          data={filteredMessages}
          renderItem={renderSavedItem}
          keyExtractor={(item) => item._key || item._id || Math.random().toString()}
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

      {/* ReminderModal for setting reminders */}
      <ReminderModal
        visible={!!reminderTarget}
        onClose={() => setReminderTarget(null)}
        onSetReminder={handleSetReminder}
        colors={colors}
        hasReminder={!!reminderTarget?.reminderAt}
      />

      {/* Context Menu Modal (Floating) */}
      <Modal visible={!!contextMenuTarget} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setContextMenuTarget(null)}>
          <View style={styles.contextOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.contextMenu, { backgroundColor: colors.background }]}>
                {(filter === 'in_progress' || !filter) && (
                  <>
                    <TouchableOpacity style={styles.contextMenuItem} onPress={() => {
                      handleStatusChange(contextMenuTarget.messageId?._id || contextMenuTarget._id, 'completed');
                      setContextMenuTarget(null);
                    }}>
                      <Check size={20} color={colors.textPrimary} />
                      <Text style={[styles.contextMenuText, { color: colors.textPrimary }]}>Complete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.contextMenuItem} onPress={() => {
                      handleStatusChange(contextMenuTarget.messageId?._id || contextMenuTarget._id, 'archived');
                      setContextMenuTarget(null);
                    }}>
                      <Archive size={20} color={colors.textPrimary} />
                      <Text style={[styles.contextMenuText, { color: colors.textPrimary }]}>Archive</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.contextMenuItem} onPress={() => {
                      const target = contextMenuTarget;
                      setContextMenuTarget(null);
                      setTimeout(() => setReminderTarget(target), 350);
                    }}>
                      <Clock size={20} color={colors.textPrimary} />
                      <Text style={[styles.contextMenuText, { color: colors.textPrimary }]}>Set reminder</Text>
                    </TouchableOpacity>
                  </>
                )}

                {filter === 'completed' && (
                  <TouchableOpacity style={styles.contextMenuItem} onPress={() => {
                    handleStatusChange(contextMenuTarget.messageId?._id || contextMenuTarget._id, 'in_progress');
                    setContextMenuTarget(null);
                  }}>
                    <Square size={20} color={colors.textPrimary} />
                    <Text style={[styles.contextMenuText, { color: colors.textPrimary }]}>Mark as incomplete</Text>
                  </TouchableOpacity>
                )}

                {filter === 'archived' && (
                  <TouchableOpacity style={styles.contextMenuItem} onPress={() => {
                    handleStatusChange(contextMenuTarget.messageId?._id || contextMenuTarget._id, 'in_progress');
                    setContextMenuTarget(null);
                  }}>
                    <Archive size={20} color={colors.textPrimary} />
                    <Text style={[styles.contextMenuText, { color: colors.textPrimary }]}>Unarchive</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.contextMenuItem} onPress={() => {
                  deleteSavedItem(contextMenuTarget._id, contextMenuTarget.messageId?._id);
                  setContextMenuTarget(null);
                }}>
                  <Trash2 size={20} color="#E53E3E" />
                  <Text style={[styles.contextMenuText, { color: '#E53E3E' }]}>Remove from Later</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Bottom Sheet Modal */}
      <Modal visible={!!bottomSheetTarget} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setBottomSheetTarget(null)}>
          <View style={styles.bottomSheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.bottomSheet, { backgroundColor: colors.background }]}>
                <View style={[styles.bottomSheetHandle, { backgroundColor: colors.border }]} />
                <Text style={[styles.bottomSheetTitle, { color: colors.textPrimary }]}>
                  {bottomSheetTarget?.type === 'canvas' ? (bottomSheetTarget?.canvasId?.title || bottomSheetTarget?.title) : (bottomSheetTarget?.messageId?.authorId?.name || 'Item')}
                </Text>

                <TouchableOpacity style={styles.bottomSheetItem} onPress={() => {
                  deleteSavedItem(bottomSheetTarget._id, bottomSheetTarget.messageId?._id);
                  setBottomSheetTarget(null);
                }}>
                  <Bookmark size={20} color={colors.textPrimary} />
                  <Text style={[styles.bottomSheetText, { color: colors.textPrimary }]}>Remove from Later</Text>
                </TouchableOpacity>

                {/* <TouchableOpacity style={styles.bottomSheetItem} onPress={() => {
                  Toast.show({ type: 'info', text1: 'Sharing coming soon' });
                  setBottomSheetTarget(null);
                }}>
                  <Share size={20} color={colors.textPrimary} />
                  <Text style={[styles.bottomSheetText, { color: colors.textPrimary }]}>Share in Slack</Text>
                </TouchableOpacity> */}
{/* 
                <TouchableOpacity style={styles.bottomSheetItem} onPress={() => {
                  Toast.show({ type: 'success', text1: 'Link copied to clipboard' });
                  setBottomSheetTarget(null);
                }}>
                  <Link size={20} color={colors.textPrimary} />
                  <Text style={[styles.bottomSheetText, { color: colors.textPrimary }]}>Copy</Text>
                </TouchableOpacity> */}

                <TouchableOpacity style={styles.bottomSheetItem} onPress={() => {
                  deleteSavedItem(bottomSheetTarget._id, bottomSheetTarget.messageId?._id);
                  setBottomSheetTarget(null);
                }}>
                  <Trash2 size={20} color="#E53E3E" />
                  <Text style={[styles.bottomSheetText, { color: '#E53E3E' }]}>Delete</Text>
                </TouchableOpacity>
                <View style={{ height: verticalScale(30) }} />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <CreateReminderModal
        visible={createReminderVisible}
        onClose={() => setCreateReminderVisible(false)}
        onSubmit={(data) => {
          addCustomReminder(data);
          Toast.show({ type: 'success', text1: 'Reminder created!' });
        }}
        colors={colors}
      />
  
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    paddingTop: verticalScale(16),
    backgroundColor: 'transparent',
  },
  headerBackButton: {
    width: scale(44),
    height: verticalScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: scale(0), height: verticalScale(2) },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
  },
  headerRightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: moderateScale(22),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: scale(0), height: verticalScale(2) },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  headerIconButton: {
    padding: moderateScale(2),
  },
  listContainer: {
    padding: moderateScale(16),
    paddingTop: verticalScale(24),
    gap: 24,
  },
  savedItem: {
    paddingVertical: verticalScale(8),
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(12),
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeLabel: {
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  dateLabel: {
    fontSize: moderateScale(12),
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mainIconBox: {
    width: scale(44),
    height: verticalScale(44),
    borderRadius: moderateScale(12),
    backgroundColor: '#1DA1F2', 
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTitle: {
    fontSize: moderateScale(16),
    fontWeight: '500',
    flex: 1,
  },
  embeddedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: moderateScale(16),
    padding: moderateScale(14),
    gap: 14,
    marginLeft: scale(0),
  },
  embeddedIconBox: {
    width: scale(36),
    height: verticalScale(36),
    borderRadius: moderateScale(10),
    backgroundColor: '#1DA1F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  embeddedInfo: {
    flex: 1,
  },
  embeddedTitle: {
    fontSize: moderateScale(15),
    fontWeight: '600',
    marginBottom: verticalScale(4),
  },
  embeddedSubtitle: {
    fontSize: moderateScale(13),
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: verticalScale(4),
  },
  completeBtn: {
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(10),
  },
  completeBtnText: {
    fontWeight: '600',
    fontSize: moderateScale(14),
  },
  clockBtn: {
    width: scale(40),
    height: verticalScale(40),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  // Context Menu
  contextOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  contextMenu: {
    width: scale(250),
    borderRadius: moderateScale(24),
    paddingVertical: verticalScale(8),
    shadowColor: '#000',
    shadowOffset: { width: scale(0), height: verticalScale(8) },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(24),
    paddingVertical: verticalScale(14),
    gap: 16,
  },
  contextMenuText: {
    fontSize: moderateScale(16),
    fontWeight: '400',
  },
  // Bottom Sheet
  bottomSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: scale(24),
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(24),
    shadowColor: '#000',
    shadowOffset: { width: scale(0), height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  bottomSheetHandle: {
    width: scale(40),
    height: verticalScale(4),
    borderRadius: moderateScale(2),
    alignSelf: 'center',
    marginBottom: verticalScale(20),
  },
  bottomSheetTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    alignSelf: 'center',
    marginBottom: verticalScale(24),
  },
  bottomSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(16),
    gap: 16,
  },
  bottomSheetText: {
    fontSize: moderateScale(16),
  }
});

export default LaterScreen;
