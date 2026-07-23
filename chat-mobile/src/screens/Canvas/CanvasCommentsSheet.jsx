import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import ScreenContainer from '../../components/common/ScreenContainer';
import { Send, CheckCircle2, MessageSquare, X } from 'lucide-react-native';
import Avatar from '../../components/Avatar';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


export default function CanvasCommentsSheet({
  visible,
  onClose,
  comments = [],
  onCreateComment,
  onReplyToComment,
  onResolveComment,
}) {
  const [newCommentText, setNewCommentText] = useState('');
  const [replyTargetId, setReplyTargetId] = useState(null);
  const [replyText, setReplyText] = useState('');

  const handleSendComment = () => {
    if (!newCommentText.trim()) return;
    onCreateComment(newCommentText.trim());
    setNewCommentText('');
  };

  const handleSendReply = (commentId) => {
    if (!replyText.trim()) return;
    onReplyToComment(commentId, replyText.trim());
    setReplyText('');
    setReplyTargetId(null);
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <ScreenContainer style={styles.sheetContainer}>
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <MessageSquare size={18} color="#4f46e5" style={styles.headerIcon} />
                <Text style={styles.headerTitle}>Comments</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {comments.length === 0 ? (
              <View style={styles.empty}>
                <MessageSquare size={48} color="#d1d5db" />
                <Text style={styles.emptyText}>No comments yet. Start a discussion!</Text>
              </View>
            ) : (
              <FlatList
                data={comments.filter(c => !c.resolved)}
                keyExtractor={(item) => item._id}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.commentCard}>
                    <View style={styles.commentHeader}>
                      <Avatar userId={item.authorId} size={28} />
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentAuthor}>{item.authorName || 'Member'}</Text>
                        <Text style={styles.commentTime}>{formatTime(item.createdAt)}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.resolveBtn}
                        onPress={() => onResolveComment(item._id)}
                      >
                        <CheckCircle2 size={18} color="#10b981" />
                        <Text style={styles.resolveText}>Resolve</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.commentBody}>{item.content}</Text>

                    {/* Replies */}
                    {item.replies && item.replies.length > 0 && (
                      <View style={styles.repliesSection}>
                        {item.replies.map((reply, index) => (
                          <View key={index} style={styles.replyRow}>
                            <Avatar userId={reply.authorId} size={22} />
                            <View style={styles.replyContent}>
                              <View style={styles.replyMeta}>
                                <Text style={styles.replyAuthor}>{reply.authorName || 'Member'}</Text>
                                <Text style={styles.replyTime}>{formatTime(reply.createdAt)}</Text>
                              </View>
                              <Text style={styles.replyBody}>{reply.content}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Reply triggers */}
                    {replyTargetId === item._id ? (
                      <View style={styles.replyInputRow}>
                        <TextInput
                          style={styles.replyInput}
                          placeholder="Write a reply..."
                          value={replyText}
                          onChangeText={setReplyText}
                          autoFocus
                        />
                        <TouchableOpacity
                          style={styles.sendBtnSmall}
                          onPress={() => handleSendReply(item._id)}
                        >
                          <Send size={14} color="#ffffff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cancelBtnSmall}
                          onPress={() => setReplyTargetId(null)}
                        >
                          <Text style={styles.cancelTextSmall}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addReplyBtn}
                        onPress={() => setReplyTargetId(item._id)}
                      >
                        <Text style={styles.addReplyText}>Reply...</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              />
            )}

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Add a new comment..."
                value={newCommentText}
                onChangeText={setNewCommentText}
                multiline
                maxHeight={100}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !newCommentText.trim() && styles.sendBtnDisabled]}
                onPress={handleSendComment}
                disabled={!newCommentText.trim()}
              >
                <Send size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
        </ScreenContainer>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheetContainer: {
    height: '75%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: scale(6),
  },
  headerTitle: {
    fontSize: moderateScale(16),
    fontWeight: '600',
    color: '#1f2937',
  },
  closeBtn: {
    padding: moderateScale(4),
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: moderateScale(16),
  },
  commentCard: {
    backgroundColor: '#f9fafb',
    borderRadius: moderateScale(10),
    padding: moderateScale(12),
    marginBottom: verticalScale(16),
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  commentMeta: {
    flex: 1,
    marginLeft: scale(10),
  },
  commentAuthor: {
    fontSize: moderateScale(13),
    fontWeight: '600',
    color: '#1f2937',
  },
  commentTime: {
    fontSize: moderateScale(10),
    color: '#9ca3af',
    marginTop: verticalScale(1),
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(4),
    paddingHorizontal: scale(8),
    borderRadius: moderateScale(4),
    backgroundColor: '#ecfdf5',
  },
  resolveText: {
    fontSize: moderateScale(11),
    fontWeight: '600',
    color: '#10b981',
    marginLeft: scale(4),
  },
  commentBody: {
    fontSize: moderateScale(14),
    color: '#374151',
    lineHeight: 20,
    marginBottom: verticalScale(8),
  },
  repliesSection: {
    borderLeftWidth: 2,
    borderLeftColor: '#e5e7eb',
    paddingLeft: scale(12),
    marginVertical: verticalScale(8),
  },
  replyRow: {
    flexDirection: 'row',
    marginBottom: verticalScale(10),
  },
  replyContent: {
    flex: 1,
    marginLeft: scale(8),
  },
  replyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(2),
  },
  replyAuthor: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    color: '#1f2937',
  },
  replyTime: {
    fontSize: moderateScale(9),
    color: '#9ca3af',
  },
  replyBody: {
    fontSize: moderateScale(13),
    color: '#4b5563',
    lineHeight: 18,
  },
  addReplyBtn: {
    paddingVertical: verticalScale(4),
  },
  addReplyText: {
    fontSize: moderateScale(12),
    color: '#4f46e5',
    fontWeight: '500',
  },
  replyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(8),
  },
  replyInput: {
    flex: 1,
    height: verticalScale(32),
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: moderateScale(6),
    paddingHorizontal: scale(8),
    fontSize: moderateScale(13),
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  sendBtnSmall: {
    width: scale(32),
    height: verticalScale(32),
    borderRadius: moderateScale(6),
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: scale(6),
  },
  cancelBtnSmall: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(6),
  },
  cancelTextSmall: {
    fontSize: moderateScale(12),
    color: '#6b7280',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(12),
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  input: {
    flex: 1,
    minHeight: verticalScale(40),
    maxHeight: verticalScale(80),
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    fontSize: moderateScale(14),
    color: '#1f2937',
    marginRight: scale(8),
  },
  sendBtn: {
    width: scale(40),
    height: verticalScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#c7d2fe',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: moderateScale(32),
  },
  emptyText: {
    fontSize: moderateScale(14),
    color: '#6b7280',
    marginTop: verticalScale(12),
    textAlign: 'center',
  },
});
