import { useState, useEffect, useRef, useCallback } from 'react';
import { useThreadStore } from '../stores/threadStore';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useLaterStore } from '../stores/laterStore';
import Toast from 'react-native-toast-message';

export const useThreadDetails = ({ rootMessageId, channelId, highlightedMessageId }) => {
  const { user } = useAuthStore();
  const {
    threadRepliesByRoot,
    fetchThreadReplies,
    sendThreadReply,
    isLoadingReplies,
    threadHasMore,
  } = useThreadStore();
  const { addReaction, removeReaction } = useChatStore();
  
  const rootMessageLive = useChatStore((s) =>
    (s.messagesByChannel[channelId] || []).find(m => m._id === rootMessageId)
  );
  
  const toggleSaveMessage = useLaterStore((s) => s.toggleSaveMessage);
  const isMessageSaved = useLaterStore((s) => s.isMessageSaved);

  const [replyText, setReplyText] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState(null);
  const [actionMenuTarget, setActionMenuTarget] = useState(null);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [forwardTarget, setForwardTarget] = useState(null);
  const flatListRef = useRef(null);

  const rawReplies = threadRepliesByRoot[rootMessageId];
  const replies = rawReplies || [];

  useEffect(() => {
    fetchThreadReplies(rootMessageId);
  }, [rootMessageId, fetchThreadReplies]);

  useEffect(() => {
    if (highlightedMessageId && replies.length > 0) {
      const index = replies.findIndex((r) => r._id === highlightedMessageId);
      if (index !== -1 && flatListRef.current) {
        setTimeout(() => {
          try {
            flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
          } catch (e) {
            console.log("Could not scroll to reply:", e);
          }
        }, 500);
      }
    }
  }, [highlightedMessageId, replies.length > 0]);

  const showMessageActions = useCallback((item) => {
    setActionMenuTarget(item);
  }, []);

  const getAttachments = useCallback((msg) => {
    if (!msg) return [];
    const refs = msg.fileReferences || [];
    if (refs.length > 0) {
      return refs
        .map((ref) => {
          if (!ref.fileId) return null;
          const file = ref.fileId;
          return {
            _id: file._id,
            name: file.originalName || file.fileName || file.name || 'File',
            fileName: file.originalName || file.fileName || file.name || 'File',
            url: file.url || file.secureUrl,
            thumbnailUrl: file.thumbnailUrl,
            mimeType: file.mimeType,
            fileSize: file.fileSize || file.size || file.fileSizeBytes || 0,
          };
        })
        .filter(Boolean);
    }
    return msg.attachments || msg.files || [];
  }, []);

  const handleSendReply = async (content, options) => {
    try {
      if (editingMessage) {
        if (editingMessage._id === rootMessageId) {
          const { editMessage } = useChatStore.getState();
          await editMessage(rootMessageId, channelId, content, options?.htmlContent);
        } else {
          await useThreadStore.getState().editThreadReply(rootMessageId, editingMessage._id, content, options?.htmlContent);
        }
        setEditingMessage(null);
      } else {
        await sendThreadReply(rootMessageId, channelId, content, options);
      }
    } catch (err) {
      console.error('Failed to send reply:', err);
      Toast.show({ type: 'error', text1: 'Failed to send reply' });
    }
  };

  const getAuthorId = (msg) => {
    if (!msg) return null;
    if (typeof msg.authorId === "string") return msg.authorId;
    return msg.authorId?._id || msg.senderSnapshot?._id || null;
  };

  const resolveAuthor = useCallback((msg) => {
    if (!msg) return { _id: null };
    const a = msg.authorId;
    if (a && typeof a === 'object' && (a.name || a.email || a.avatar)) return a;
    if (msg.senderSnapshot?.name) return msg.senderSnapshot;
    return { _id: typeof a === 'string' ? a : a?._id };
  }, []);

  return {
    user,
    replies,
    rootMessageLive,
    isLoadingReplies,
    threadHasMore,
    fetchThreadReplies,
    addReaction,
    removeReaction,
    toggleSaveMessage,
    isMessageSaved,
    replyText,
    setReplyText,
    editingMessage,
    setEditingMessage,
    emojiPickerTarget,
    setEmojiPickerTarget,
    actionMenuTarget,
    setActionMenuTarget,
    reminderTarget,
    setReminderTarget,
    forwardTarget,
    setForwardTarget,
    flatListRef,
    showMessageActions,
    getAttachments,
    handleSendReply,
    getAuthorId,
    resolveAuthor
  };
};
