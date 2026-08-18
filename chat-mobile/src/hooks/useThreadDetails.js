import { useState, useEffect, useRef, useCallback } from 'react';
import { useThreadStore } from '../stores/threadStore';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useLaterStore } from '../stores/laterStore';
import { getMessageAttachments } from '../utils/mediaUtils';
import { useThreadReplies, useSendThreadReply, useEditThreadReply, useDeleteThreadReply } from './queries/useThreadReplies';
import { useMessages, useEditMessage } from './queries/useMessages';
import Toast from 'react-native-toast-message';

export const useThreadDetails = ({ rootMessageId, channelId, highlightedMessageId }) => {
  const { user } = useAuthStore();
  
  const {
    data: threadRepliesData,
    isLoading: isLoadingReplies,
    hasNextPage: threadHasMore,
    fetchNextPage: fetchThreadReplies,
  } = useThreadReplies(rootMessageId);

  const { mutateAsync: sendThreadReply } = useSendThreadReply();
  const { mutateAsync: editThreadReply } = useEditThreadReply();
  const { mutateAsync: deleteThreadReply } = useDeleteThreadReply();
  const { mutateAsync: editMessage } = useEditMessage();

  const replies = threadRepliesData?.pages?.flatMap(page => page.items) || [];
  const { addReaction, removeReaction } = useChatStore();
  
  const { data: messagesData } = useMessages(channelId);
  const rootMessageLive = messagesData?.pages?.flatMap(p => p.items)?.find(m => m._id === rootMessageId);
  
  const toggleSaveMessage = useLaterStore((s) => s.toggleSaveMessage);
  const isMessageSaved = useLaterStore((s) => s.isMessageSaved);

  const [replyText, setReplyText] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState(null);
  const [actionMenuTarget, setActionMenuTarget] = useState(null);
  const [actionAttachmentTarget, setActionAttachmentTarget] = useState(null);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [forwardTarget, setForwardTarget] = useState(null);
  const flatListRef = useRef(null);

  const [replyingTo, setReplyingTo] = useState(null);

  useEffect(() => {
    // React query fetches automatically via enabled: !!rootMessageId
  }, [rootMessageId]);

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

  const showMessageActions = useCallback((item, attachment = null) => {
    setActionMenuTarget(item);
    setActionAttachmentTarget(attachment);
  }, []);

  const getAttachments = useCallback((msg) => {
    return getMessageAttachments(msg);
  }, []);

  const handleSendReply = async (content, options) => {
    try {
      if (editingMessage) {
        if (editingMessage._id === rootMessageId) {
          await editMessage({ messageId: rootMessageId, channelId, content, htmlContent: options?.htmlContent, fileReferences: options?.fileReferences });
        } else {
          await editThreadReply({
            rootMessageId, 
            replyId: editingMessage._id, 
            content, 
            htmlContent: options?.htmlContent, 
            fileReferences: options?.fileReferences
          });
        }
        setEditingMessage(null);
      } else {
        await sendThreadReply({
          rootMessageId, 
          channelId, 
          content, 
          htmlContent: options?.htmlContent,
          fileReferences: options?.fileReferences,
          mentions: options?.mentions,
          parentMessageId: options?.parentMessageId,
          replyTo: options?.replyTo,
          tempId: `temp-reply-${Date.now()}`
        });
      }
      setReplyingTo(null);
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
    replyingTo,
    setReplyingTo,
    emojiPickerTarget,
    setEmojiPickerTarget,
    actionMenuTarget,
    setActionMenuTarget,
    actionAttachmentTarget,
    setActionAttachmentTarget,
    reminderTarget,
    setReminderTarget,
    forwardTarget,
    setForwardTarget,
    flatListRef,
    showMessageActions,
    getAttachments,
    handleSendReply,
    deleteThreadReply,
    editThreadReply,
    getAuthorId,
    resolveAuthor
  };
};

