import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { useChannelStore } from './channelStore';
import { reactionAPI } from '../services/api';
import api from '../services/api';
import logger from '../utils/logger';
import { useScheduledStore } from './scheduledStore';

export const useChatStore = create((set, get) => ({
  messagesByChannel: {},
  hasMore: {},
  isLoadingMessages: false,
  connectionStatus: 'disconnected',

  fetchMessages: async (channelId, cursor = null) => {
    set({ isLoadingMessages: true });
    try {
      const params = cursor ? { cursor } : {};
      const { data } = await api.get(`/channels/${channelId}/messages`, { params });
      const messages = data.data.items || [];
      const hasMore = data.data.hasMore || false;

      set((state) => {
        const existing = state.messagesByChannel[channelId] || [];
        // Merge and sort
        const merged = cursor 
          ? [...messages, ...existing] 
          : messages;
        
        // Dedup by _id
        const unique = Array.from(new Map(merged.map(m => [m._id, m])).values())
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [channelId]: unique,
          },
          hasMore: { ...state.hasMore, [channelId]: hasMore },
          isLoadingMessages: false,
        };
      });
    } catch (error) {
      set({ isLoadingMessages: false });
      logger.error('Failed to fetch messages:', error);
      return { error: true, status: error.response?.status };
    }
  },

  sendMessage: async (channelId, content, options = {}) => {
    const user = useAuthStore.getState().user;
    const tempId = `temp-${Date.now()}`;
    const { htmlContent, threadId, fileReferences, mentions, scheduledAt, contentType, gifMeta, audioMeta, videoMeta } = options;
    
    // If scheduledAt is present, delegate to scheduledStore
    if (scheduledAt) {
      try {
        const payload = { content, scheduledAt };
        if (htmlContent) payload.htmlContent = htmlContent;
        if (threadId) payload.threadId = threadId;
        if (fileReferences?.length) payload.fileReferences = fileReferences;
        if (mentions?.length) payload.mentions = mentions;
        if (contentType) payload.contentType = contentType;
        if (audioMeta) payload.audioMeta = audioMeta;
        if (videoMeta) payload.videoMeta = videoMeta;
        
        return await useScheduledStore.getState().createScheduledMessage(channelId, payload);
      } catch (error) {
        logger.error('Failed to schedule message:', error);
        throw error;
      }
    }

    // Optimistic message
    const optimisticMessage = {
      _id: tempId,
      channelId,
      content,
      htmlContent,
      contentType: contentType || 'text',
      gifMeta: gifMeta || undefined,
      gifUrl: gifMeta?.gifUrl || undefined,
      audioMeta,
      videoMeta,
      authorId: user,
      senderSnapshot: {
        name: user?.name || 'You',
        avatar: user?.avatar || null,
      },
      createdAt: new Date().toISOString(),
      pending: true,
      attachments: fileReferences || [],
    };

    // Add locally (don't add to channel list if scheduled)
    get().addMessage(optimisticMessage);
    useChannelStore.getState().handleNewMessage(optimisticMessage);

    try {
      const payload = { content, tempId };
      if (htmlContent) payload.htmlContent = htmlContent;
      if (threadId) payload.threadId = threadId;
      if (fileReferences?.length) payload.fileReferences = fileReferences;
      if (mentions?.length) payload.mentions = mentions;
      if (contentType) payload.contentType = contentType;
      if (gifMeta) payload.gifMeta = gifMeta;
      if (audioMeta) payload.audioMeta = audioMeta;
      if (videoMeta) payload.videoMeta = videoMeta;

      const { data } = await api.post(`/channels/${channelId}/messages`, payload);
      const serverMessage = data.data.message;
      
      // Reconcile
      get().reconcileMessage(tempId, serverMessage);
      
      return serverMessage;
    } catch (error) {
      logger.error('Failed to send message:', error);
      // Mark as failed
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: (state.messagesByChannel[channelId] || []).map(m => 
            m._id === tempId ? { ...m, pending: false, failed: true } : m
          )
        }
      }));
    }
  },

  addMessage: (message) => {
    const channelId = message.channelId;
    if (!channelId) return;

    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      if (existing.some(m => m._id === message._id)) return state;
      
      const updated = [...existing, message].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updated,
        }
      };
    });
  },

  reconcileMessage: (tempId, serverMessage) => {
    const channelId = serverMessage.channelId;
    set((state) => {
      const messages = state.messagesByChannel[channelId] || [];
      const alreadyHasServerMessage = messages.some(m => m._id === serverMessage._id);
      
      let updatedMessages;
      if (alreadyHasServerMessage) {
        // If the real message was already added via socket event, just remove the temp one
        updatedMessages = messages.filter(m => m._id !== tempId);
      } else {
        // Otherwise replace the temp one with the real one
        updatedMessages = messages.map(m => 
          m._id === tempId ? { ...serverMessage, pending: false } : m
        );
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updatedMessages
        }
      };
    });
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // ─── Reactions ─────────────────────────────────────────────────────────────
  addReaction: async (messageId, emoji) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    // Optimistic add
    get().addReactionLocal(messageId, emoji, { _id: user._id, name: user.name });

    try {
      await reactionAPI.add(messageId, emoji);
    } catch (error) {
      // Revert on failure
      get().removeReactionLocal(messageId, emoji, user._id);
      logger.error('Failed to add reaction:', error);
    }
  },

  removeReaction: async (messageId, emoji) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    // Optimistic remove
    get().removeReactionLocal(messageId, emoji, user._id);

    try {
      await reactionAPI.remove(messageId, emoji);
    } catch (error) {
      // Revert on failure
      get().addReactionLocal(messageId, emoji, { _id: user._id, name: user.name });
      logger.error('Failed to remove reaction:', error);
    }
  },

  addReactionLocal: (messageId, emoji, user) => {
    set((state) => {
      // Only update the channel that contains the message (avoid full-scan)
      const targetChannelId = Object.keys(state.messagesByChannel).find(chId =>
        state.messagesByChannel[chId].some(m => m._id === messageId)
      );
      if (!targetChannelId) return state;

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [targetChannelId]: state.messagesByChannel[targetChannelId].map(m => {
            if (m._id !== messageId) return m;
            const reactions = [...(m.reactions || [])];
            const existing = reactions.find(r => r.emoji === emoji);
            if (existing) {
              if (existing.userIds?.includes(user._id)) return m;
              existing.users = [...(existing.users || []), user];
              existing.userIds = [...(existing.userIds || []), user._id];
              existing.count = (existing.count || 0) + 1;
            } else {
              reactions.push({ emoji, users: [user], userIds: [user._id], count: 1 });
            }
            return { ...m, reactions };
          }),
        },
      };
    });
  },

  removeReactionLocal: (messageId, emoji, userId) => {
    set((state) => {
      const targetChannelId = Object.keys(state.messagesByChannel).find(chId =>
        state.messagesByChannel[chId].some(m => m._id === messageId)
      );
      if (!targetChannelId) return state;

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [targetChannelId]: state.messagesByChannel[targetChannelId].map(m => {
            if (m._id !== messageId) return m;
            const reactions = (m.reactions || []).map(r => {
              if (r.emoji !== emoji) return r;
              const users = (r.users || []).filter(u => u._id !== userId);
              const userIds = (r.userIds || []).filter(id => id !== userId);
              return { ...r, users, userIds, count: users.length };
            }).filter(r => r.count > 0);
            return { ...m, reactions };
          }),
        },
      };
    });
  },

  // ─── Edit / Delete Message ──────────────────────────────────────────────────
  editMessage: async (messageId, channelId, content, htmlContent) => {
    try {
      const payload = { content };
      if (htmlContent) payload.htmlContent = htmlContent;

      const { data } = await api.put(`/messages/${messageId}`, payload);
      const updated = data.data?.message || data.data;
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: (state.messagesByChannel[channelId] || []).map(m =>
            m._id === messageId ? { ...m, ...updated, isEdited: true } : m
          ),
        },
      }));
    } catch (error) {
      logger.error('Failed to edit message:', error);
      throw error;
    }
  },

  deleteMessage: async (messageId, channelId) => {
    try {
      await api.delete(`/messages/${messageId}`);
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: (state.messagesByChannel[channelId] || []).filter(m => m._id !== messageId),
        },
      }));
    } catch (error) {
      logger.error('Failed to delete message:', error);
      throw error;
    }
  },

  // ─── Typing Indicators ─────────────────────────────────────────────────────
  typingByChannel: {},
  setTyping: (channelId, userId, name) => {
    set((state) => ({
      typingByChannel: {
        ...state.typingByChannel,
        [channelId]: {
          ...(state.typingByChannel[channelId] || {}),
          [userId]: name
        }
      }
    }));
  },
  clearTyping: (channelId, userId) => {
    set((state) => {
      const typing = { ...(state.typingByChannel[channelId] || {}) };
      delete typing[userId];
      return {
        typingByChannel: {
          ...state.typingByChannel,
          [channelId]: typing
        }
      };
    });
  },

  // ─── Real-time Message Updates (from socket events) ──────────────────────────
  updateMessage: (message) => {
    if (!message?._id) return;
    const channelId = message.channelId;
    if (!channelId) return;
    set((state) => {
      const msgs = state.messagesByChannel[channelId];
      if (!msgs) return state;
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: msgs.map(m =>
            m._id === message._id ? { ...m, ...message } : m
          ),
        },
      };
    });
  },

  removeMessage: (messageId, channelId) => {
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).filter(m => m._id !== messageId),
      },
    }));
  },

  softDeleteMessage: (messageId, channelId) => {
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).map(m =>
          m._id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m
        ),
      },
    }));
  },

  handleMessagePinned: (payload) => {
    const { messageId, channelId, pinnedBy } = payload;
    if (!messageId || !channelId) return;
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).map(m =>
          m._id === messageId ? { ...m, isPinned: true, pinnedBy } : m
        ),
      },
    }));
  },

  handleMessageUnpinned: (payload) => {
    const { messageId, channelId } = payload;
    if (!messageId || !channelId) return;
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).map(m =>
          m._id === messageId ? { ...m, isPinned: false, pinnedBy: null } : m
        ),
      },
    }));
  },

  updateMessageStatus: (channelId, messageId, messageIds, status, timestamps = {}) => {
    if (!channelId) return;
    const ids = messageIds || (messageId ? [messageId] : []);
    if (ids.length === 0) return;
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).map(m =>
          ids.includes(m._id)
            ? { ...m, status, ...timestamps }
            : m
        ),
      },
    }));
  },

  incrementReplyCount: (rootMessageId, channelId) => {
    if (!rootMessageId || !channelId) return;
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).map(m =>
          m._id === rootMessageId
            ? { ...m, replyCount: (m.replyCount || 0) + 1 }
            : m
        ),
      },
    }));
  },
}));
