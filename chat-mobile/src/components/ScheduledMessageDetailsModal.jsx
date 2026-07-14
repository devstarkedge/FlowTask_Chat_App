import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  X,
  Clock,
  Edit3,
  Trash2,
  Send,
  Calendar,
} from 'lucide-react-native';
import { formatRelativeTime, formatScheduledDate } from '../utils/dateUtils';
import { useScheduledStore } from '../stores/scheduledStore';
import { useChannelStore } from '../stores/channelStore';
import { useConversationDetails } from '../hooks/useConversationDetails';
import ScheduleModal from './ScheduleModal';

const ScheduledMessageDetailsModal = ({
  visible,
  message,
  onClose,
  colors,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);

  const editScheduledMessageText = useScheduledStore(state => state.editScheduledMessageText);
  const cancelScheduledMessage = useScheduledStore(state => state.cancelScheduledMessage);
  const sendNowScheduledMessage = useScheduledStore(state => state.sendNowScheduledMessage);
  const rescheduleMessage = useScheduledStore(state => state.rescheduleMessage);
  const { channels } = useChannelStore();
  
  const { isDM, displayName } = useConversationDetails(message?.channelId);

  useEffect(() => {
    if (visible && message) {
      setEditText(message.content || '');
      setIsEditing(false);
    }
  }, [visible, message]);

  if (!visible || !message) return null;

  const scheduledDate = new Date(message.scheduledAt);
  const isPast = scheduledDate < new Date();

  const handleSaveEdit = async () => {
    if (!editText.trim()) {
      Alert.alert('Error', 'Message content cannot be empty.');
      return;
    }
    setIsUpdating(true);
    try {
      await editScheduledMessageText(message._id, editText, editText);
      setIsEditing(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to update message.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Scheduled Message',
      'Are you sure you want to cancel this scheduled message?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelScheduledMessage(message._id);
              onClose();
            } catch (err) {
              Alert.alert('Error', 'Failed to cancel scheduled message');
            }
          },
        },
      ]
    );
  };

  const handleSendNow = () => {
    Alert.alert(
      'Send Now',
      'Are you sure you want to send this scheduled message immediately?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              await sendNowScheduledMessage(message._id);
              onClose();
            } catch (err) {
              Alert.alert('Error', 'Failed to send message');
            }
          },
        },
      ]
    );
  };

  const handleRescheduleSubmit = async (scheduledAt) => {
    setShowReschedule(false);
    setIsUpdating(true);
    try {
      await rescheduleMessage(message._id, scheduledAt);
    } catch (err) {
      Alert.alert('Error', 'Failed to reschedule message');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: 24 }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Scheduled Message Details
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Meta Info */}
            <View style={[styles.metaBox, { backgroundColor: colors.card }]}>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>{isDM ? 'Direct Message:' : 'Channel:'}</Text>
                <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                  {isDM ? displayName : `${displayName}`}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Scheduled for:</Text>
                <Text style={[styles.metaValue, { color: isPast ? colors.error : colors.success }]}>
                  {formatScheduledDate(message.scheduledAt)}
 
 
  
                  </Text>
              </View>
              {/* <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Created:</Text>
                <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                  {formatRelativeTime(message.createdAt)}
                </Text>
              </View> */}
              {isPast && (
                <View style={[styles.statusBadge, { backgroundColor: colors.error + '20', alignSelf: 'flex-start', marginTop: 8 }]}>
                  <Text style={[styles.statusText, { color: colors.error }]}>Sending...</Text>
                </View>
              )}
            </View>

            {/* Message Content */}
            <View style={styles.messageSection}>
              <View style={styles.messageHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Message Content</Text>
                {!isEditing && !isPast && (
                  <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editBtn}>
                    <Edit3 size={16} color={colors.primary} />
                    <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>

              {isEditing ? (
                <View>
                  <TextInput
                    style={[styles.textInput, { 
                      color: colors.inputText, 
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.border 
                    }]}
                    multiline
                    value={editText}
                    onChangeText={setEditText}
                    placeholder="Message content..."
                    placeholderTextColor={colors.inputPlaceholder}
                    autoFocus
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity 
                      style={[styles.btn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                      onPress={() => {
                        setIsEditing(false);
                        setEditText(message.content || '');
                      }}
                    >
                      <Text style={[styles.btnText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.btn, { backgroundColor: colors.primary }]}
                      onPress={handleSaveEdit}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={[styles.btnText, { color: '#fff' }]}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={[styles.messageBubble, { backgroundColor: colors.card }]}>
                  <Text style={[styles.messageText, { color: colors.textPrimary }]}>
                    {message.content?.replace(/<[^>]*>/g, '') || 'No content'}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity 
              style={[styles.actionSquare, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
              onPress={() => setShowReschedule(true)}
            >
              <Calendar size={20} color={colors.textSecondary} />
              <Text style={[styles.actionSquareText, { color: colors.textSecondary }]}>Reschedule</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionSquare, { backgroundColor: colors.primary + '20', borderColor: colors.primary, borderWidth: 1 }]}
              onPress={handleSendNow}
            >
              <Send size={20} color={colors.primary} />
              <Text style={[styles.actionSquareText, { color: colors.primary }]}>Send Now</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionSquare, { backgroundColor: colors.error + '10', borderColor: colors.error + '30', borderWidth: 1 }]}
              onPress={handleCancel}
            >
              <Trash2 size={20} color={colors.error} />
              <Text style={[styles.actionSquareText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScheduleModal
          visible={showReschedule}
          onClose={() => setShowReschedule(false)}
          onSchedule={handleRescheduleSubmit}
          colors={colors}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    height: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  metaBox: {
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabel: {
    width: 100,
    fontSize: 13,
    fontWeight: '500',
  },
  metaValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  messageSection: {
    marginBottom: 24,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  messageBubble: {
    padding: 16,
    borderRadius: 12,
    minHeight: 100,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  textInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  btnText: {
    fontWeight: '600',
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  actionSquare: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  actionSquareText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ScheduledMessageDetailsModal;
