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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, CheckCircle2, MessageSquare, X } from 'lucide-react-native';
import Avatar from '../../components/Avatar';

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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetContainer}
        >
          <SafeAreaView style={styles.safeArea}>
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
          </SafeAreaView>
        </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  closeBtn: {
    padding: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  commentCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentMeta: {
    flex: 1,
    marginLeft: 10,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
  commentTime: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 1,
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#ecfdf5',
  },
  resolveText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10b981',
    marginLeft: 4,
  },
  commentBody: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 8,
  },
  repliesSection: {
    borderLeftWidth: 2,
    borderLeftColor: '#e5e7eb',
    paddingLeft: 12,
    marginVertical: 8,
  },
  replyRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  replyContent: {
    flex: 1,
    marginLeft: 8,
  },
  replyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  replyAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  replyTime: {
    fontSize: 9,
    color: '#9ca3af',
  },
  replyBody: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
  },
  addReplyBtn: {
    paddingVertical: 4,
  },
  addReplyText: {
    fontSize: 12,
    color: '#4f46e5',
    fontWeight: '500',
  },
  replyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  replyInput: {
    flex: 1,
    height: 32,
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  sendBtnSmall: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  cancelBtnSmall: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cancelTextSmall: {
    fontSize: 12,
    color: '#6b7280',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 80,
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1f2937',
    marginRight: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 12,
    textAlign: 'center',
  },
});
