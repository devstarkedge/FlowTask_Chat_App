import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { AppAvatar } from './common';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { useAuthStore } from '../stores/authStore';
import { useChannelStore } from '../stores/channelStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react-native';
import logger from '../utils/logger';
import useReceipts from '../chat/hooks/useReceipts';
import { getMessageAttachments } from '../utils/mediaUtils';
import MobileFileCard from './common/MobileFileCard';

const MessageInfoModal = ({ visible, onClose, message, colors }) => {
  const user = useAuthStore((s) => s.user);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const channel = useChannelStore((s) => s.channels.find(ch => ch._id === message?.channelId));
  const attachments = getMessageAttachments(message);

  const { deliveredTo, readBy, pending, loading } = useReceipts(
    visible && message ? message.channelId : null,
    visible && message ? message._id : null
  );

  // Filter out users who have read the message
  const readUserIds = new Set(readBy.map(r => r.userId));
  
  // Only use actual deliveredTo arrays from backend, strictly segregating those who have read it.
  // We no longer fallback to pending because real-time socket events now handle delivery.
  const filteredDelivered = deliveredTo.filter(d => !readUserIds.has(d.userId));

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const datePart = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${datePart} ${timePart}`;
  };

  const renderMemberItem = (member, statusKey) => {
    const timeVal = statusKey === 'read' ? member.readAt : member.deliveredAt;
    return (
      <View key={member.userId} style={[styles.memberItem, { borderBottomColor: colors.border }]}>
        <AppAvatar user={member} size={40} showStatus={false} />
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: colors.textPrimary }]}>
            {member.name}
            {member.userId === user?._id && ' (You)'}
          </Text>
          <Text style={[styles.timeText, { color: colors.textSecondary }]}>
            {timeVal ? formatDateTime(timeVal) : ''}
          </Text>
        </View>
      </View>
    );
  };

  if (!message) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.fullScreenContainer, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: colors.backgroundSecondary }]}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <Text style={[styles.backButtonText, { color: colors.textPrimary }]}>←</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Message info</Text>
          </View>

          {/* Message Preview Area */}
          <View style={[styles.messagePreviewArea, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
            <View style={styles.bubbleContainer}>
              {attachments.length > 0 ? (
                <View style={{ gap: 8, alignItems: 'flex-end' }}>
                  {attachments.map((file, i) => (
                    <View key={file._id || i} style={{ width: scale(250), borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                      <MobileFileCard
                        file={file}
                        colors={colors}
                        isUploading={false}
                      />
                    </View>
                  ))}
                  <View style={[styles.messageBubble, { backgroundColor: colors.primary || '#005c4b', marginTop: 4, alignSelf: 'flex-end' }]}>
                    {!!message.content && (
                      <Text style={[styles.messageText, { color: '#ffffff', marginBottom: 4 }]}>{message.content}</Text>
                    )}
                    <View style={styles.metaRow}>
                      <Text style={[styles.metaTime, { color: 'rgba(255,255,255,0.7)' }]}>
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </Text>
                      <CheckCheck size={16} color="#53bdeb" style={styles.tickIcon} />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={[styles.messageBubble, { backgroundColor: colors.primary || '#005c4b' }]}>
                  <Text style={[styles.messageText, { color: '#ffffff' }]}>{message.content}</Text>
                  <View style={styles.metaRow}>
                    <Text style={[styles.metaTime, { color: 'rgba(255,255,255,0.7)' }]}>
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </Text>
                    <CheckCheck size={16} color="#53bdeb" style={styles.tickIcon} />
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Info Lists */}
          {loading ? (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView style={[styles.content, { backgroundColor: colors.background }]}>
              {/* Read By Section */}
              {readBy && readBy.length > 0 && (
                <View style={styles.section}>
                  <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                    <CheckCheck size={16} color="#53bdeb" />
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Read By</Text>
                  </View>
                  {readBy.map(m => renderMemberItem(m, 'read'))}
                </View>
              )}

              {/* Delivered To Section */}
              {filteredDelivered && filteredDelivered.length > 0 && (
                <View style={styles.section}>
                  <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                    <CheckCheck size={16} color={colors.textTertiary || '#8696a0'} />
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Delivered To</Text>
                  </View>
                  {filteredDelivered.map(m => renderMemberItem(m, 'delivered'))}
                </View>
              )}

              {(!readBy || readBy.length === 0) && (!filteredDelivered || filteredDelivered.length === 0) && (
                <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No recipients to show</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  fullScreenContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
  },
  backButton: {
    marginRight: scale(16),
    padding: scale(4),
  },
  backButtonText: {
    fontSize: moderateScale(22),
    fontWeight: 'bold',
  },
  title: {
    fontSize: moderateScale(19),
    fontWeight: '500',
  },
  messagePreviewArea: {
    padding: scale(16),
    borderBottomWidth: 1,
    alignItems: 'flex-end',
  },
  bubbleContainer: {
    maxWidth: '85%',
  },
  messageBubble: {
    borderRadius: 8,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
  },
  messageText: {
    fontSize: moderateScale(16),
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: verticalScale(4),
    gap: 4,
  },
  metaTime: {
    fontSize: moderateScale(11),
  },
  tickIcon: {
    marginLeft: 2,
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: verticalScale(16),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(10),
    gap: 8,
  },
  sectionTitle: {
    fontSize: moderateScale(14),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  memberInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberName: {
    fontSize: moderateScale(16),
    fontWeight: '500',
  },
  timeText: {
    fontSize: moderateScale(13),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: verticalScale(40),
  },
  emptyText: {
    fontSize: moderateScale(14),
  },
});

export default MessageInfoModal;