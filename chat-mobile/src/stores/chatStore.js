import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import { useAuthStore } from './authStore';
import { useChannelStore } from './channelStore';
import { reactionAPI, messageAPI } from '../services/api';
import api from '../services/api';
import logger from '../utils/logger';
import { useScheduledStore } from './scheduledStore';
import { enqueueMessage, dequeueMessage } from '../services/offlineQueue';
import { hasValidReplyTo } from '../utils/replyUtils';

function sanitizeMessageReplyFields(message) {
  if (!message) return message;
  if (!hasValidReplyTo(message.replyTo, message.parentMessageId)) {
    return { ...message, replyTo: null, parentMessageId: message.parentMessageId || null };
  }
  return message;
}

function collectMissingParentIds(messages) {
  const present = new Set(messages.map((m) => String(m._id)));
  const missing = [];
  for (const m of messages) {
    const parentId = m.parentMessageId || m.replyTo?.messageId;
    if (!parentId) continue;
    const id = String(parentId);
    if (!present.has(id)) {
      missing.push(id);
      present.add(id);
    }
  }
  return missing;
}

function keepParentsWithMessages(messages, maxCount) {
  if (messages.length <= maxCount) return messages;
  const newest = messages.slice(messages.length - maxCount);
  const keepIds = new Set(newest.map((m) => String(m._id)));
  const extras = [];
  for (const m of newest) {
    const pid = m.parentMessageId || m.replyTo?.messageId;
    if (!pid) continue;
    const id = String(pid);
    if (keepIds.has(id)) continue;
    const parent = messages.find((x) => String(x._id) === id);
    if (parent) {
      extras.push(parent);
      keepIds.add(id);
    }
  }
  return [...extras, ...newest].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
}

const typingTimeouts = {};
const TYPING_AUTO_CLEAR_MS = 5000;

export const useChatStore = create(
  persist(
    (set, get) => ({
  messagesByChannel: {},
  hasMore: {},
  isLoadingMessages: false,
  connectionStatus: 'disconnected',
  // Track which temp IDs are queued offline (for UI state)
  offlineQueueStatus: {}, // { [tempId]: 'pending' | 'sent' | 'failed' }

  fetchMessages: async (channelId, cursor = null) => {
    set({ isLoadingMessages: true });
    try {
      const params = cursor ? { cursor } : {};
      const { data } = await api.get(`/channels/${channelId}/messages`, { params });
      let messages = (data.data.items || []).map(sanitizeMessageReplyFields);
      const hasMore = data.data.hasMore || false;

      // If quote-replies reference parents outside this page, fetch and inject them
      // so the original message remains visible after refresh.
      const missingParentIds = collectMissingParentIds(messages);
      if (missingParentIds.length > 0) {
        const fetchedParents = await Promise.all(
          missingParentIds.map(async (id) => {
            try {
              const res = await messageAPI.get(id);
              return sanitizeMessageReplyFields(res?.data?.data?.message || res?.data?.message || res?.data);
            } catch (err) {
              logger.warn('[ChatStore] Failed to fetch reply parent message:', id, err?.message);
              return null;
            }
          })
        );
        const parents = fetchedParents.filter(
          (p) => p && p._id && String(p.channelId) === String(channelId) && !p.threadId
        );
        if (parents.length > 0) {
          messages = [...messages, ...parents];
        }
      }

      logger.info(`[API Response] Channel ${channelId} fetched ${messages.length} messages`, {
        mediaMessagesCount: messages.filter(m => (m.attachments?.length || m.fileReferences?.length || m.imageUrl || m.mediaUrl)).length,
      });

      set((state) => {
        const existing = state.messagesByChannel[channelId] || [];
        // Merge and sort
        const merged = cursor 
          ? [...messages, ...existing] 
          : messages;
        
        // Dedup by _id
        const MAX_MESSAGES_IN_MEMORY = 200;
        let unique = Array.from(new Map(merged.map(m => [m._id, m])).values())
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          
        unique = keepParentsWithMessages(unique, MAX_MESSAGES_IN_MEMORY);

        logger.info(`[ChatStore State] Stored ${unique.length} unique messages for channel ${channelId}`);

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
    const { htmlContent, threadId, parentMessageId, replyTo, fileReferences, attachments, mentions, scheduledAt, contentType, gifMeta, audioMeta, videoMeta } = options;
    
    // If scheduledAt is present, delegate to scheduledStore
    if (scheduledAt) {
      try {
        const payload = { content, scheduledAt };
        if (htmlContent) payload.htmlContent = htmlContent;
        if (threadId) payload.threadId = threadId;
        if (parentMessageId) payload.parentMessageId = parentMessageId;
        if (fileReferences?.length) payload.fileReferences = fileReferences;
        if (attachments?.length) payload.attachments = attachments;
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
      attachments: attachments?.length ? attachments : (fileReferences || []),
      ...(parentMessageId && replyTo
        ? { parentMessageId, replyTo }
        : {}),
    };

    // Add locally (don't add to channel list if scheduled)
    get().addMessage(optimisticMessage);
    useChannelStore.getState().handleNewMessage(optimisticMessage);

    try {
      const payload = { content, tempId };
      if (htmlContent) payload.htmlContent = htmlContent;
      if (threadId) payload.threadId = threadId;
      if (parentMessageId) payload.parentMessageId = parentMessageId;
      if (fileReferences?.length) payload.fileReferences = fileReferences;
      if (attachments?.length) payload.attachments = attachments;
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
      const isNetworkError =
        !error.response ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ERR_NETWORK' ||
        error.message?.includes('Network') ||
        error.message?.includes('timeout') ||
        error.message?.includes('socket') ||
        error.message?.includes('connect');

      if (isNetworkError) {
        // Network error — enqueue to offline queue instead of marking as failed
        logger.info('[ChatStore] Network unavailable, enqueuing message to offline queue:', tempId);
        
        const payload = { content, tempId };
        if (htmlContent) payload.htmlContent = htmlContent;
        if (threadId) payload.threadId = threadId;
        if (parentMessageId) payload.parentMessageId = parentMessageId;
        if (fileReferences?.length) payload.fileReferences = fileReferences;
        if (attachments?.length) payload.attachments = attachments;
        if (mentions?.length) payload.mentions = mentions;
        if (contentType) payload.contentType = contentType;
        if (gifMeta) payload.gifMeta = gifMeta;
        if (audioMeta) payload.audioMeta = audioMeta;
        if (videoMeta) payload.videoMeta = videoMeta;

        // Enqueue to offline queue (fire and forget)
        enqueueMessage(optimisticMessage, channelId, payload).catch((err) => {
          logger.error('[ChatStore] Failed to enqueue message:', err);
        });

        // Update offline queue status in store
        set((state) => ({
          offlineQueueStatus: {
            ...state.offlineQueueStatus,
            [tempId]: 'pending',
          },
        }));

        // Keep the message in pending state (don't mark as failed)
        return null;
      }

      // Server-side error (non-network) — mark as failed
      logger.error('Failed to send message (server error):', error);
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
    const channelId = message.channelId?.toString ? message.channelId.toString() : String(message.channelId);
    if (!channelId || channelId === 'undefined' || channelId === 'null') return;

    // Thread replies belong in the thread view, not the main channel timeline
    if (message.threadId) return;

    const sanitized = sanitizeMessageReplyFields(message);

    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      if (existing.some(m => m._id === sanitized._id)) return state;
      
      const MAX_MESSAGES_IN_MEMORY = 200;
      
      const newDate = new Date(sanitized.createdAt).getTime();
      const lastMsg = existing[existing.length - 1];
      const lastDate = lastMsg ? new Date(lastMsg.createdAt).getTime() : 0;
      
      let updated;
      if (newDate >= lastDate) {
        updated = [...existing, sanitized];
      } else {
        updated = [...existing, sanitized].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
      }
      
      if (updated.length > MAX_MESSAGES_IN_MEMORY) {
        updated = keepParentsWithMessages(updated, MAX_MESSAGES_IN_MEMORY);
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updated,
        }
      };
    });
  },

  reconcileMessage: (tempId, serverMessage) => {
    const channelId = serverMessage.channelId?.toString ? serverMessage.channelId.toString() : String(serverMessage.channelId);
    set((state) => {
      const messages = state.messagesByChannel[channelId] || [];
      const alreadyHasServerMessage = messages.some(m => m._id === serverMessage._id);
      const tempMsg = messages.find(m => m._id === tempId);
      
      // Prefer a real client-resolved sender name/content over empty/generic server data
      const serverReplyName = String(serverMessage?.replyTo?.senderName || '').trim().toLowerCase();
      const isGenericServerName =
        !serverReplyName ||
        serverReplyName === 'user' ||
        serverReplyName === 'someone' ||
        serverReplyName === 'unknown' ||
        serverReplyName === 'unknown user';
      const serverReplyContent = String(serverMessage?.replyTo?.content || '').trim();
      const clientReplyContent = String(tempMsg?.replyTo?.content || '').trim();
      const shouldKeepClientContent =
        (!serverReplyContent || serverReplyContent === '...' || serverReplyContent.toLowerCase() === 'message') &&
        !!clientReplyContent &&
        clientReplyContent.toLowerCase() !== 'message';

      const rawMerged = {
        ...serverMessage,
        replyTo:
          serverMessage.replyTo || tempMsg?.replyTo
            ? {
                ...(tempMsg?.replyTo || {}),
                ...(serverMessage.replyTo || {}),
                ...(isGenericServerName && tempMsg?.replyTo?.senderName
                  ? { senderName: tempMsg.replyTo.senderName }
                  : {}),
                ...(shouldKeepClientContent
                  ? { content: tempMsg.replyTo.content }
                  : {}),
                authorId:
                  serverMessage.replyTo?.authorId ||
                  tempMsg?.replyTo?.authorId ||
                  null,
                messageId:
                  serverMessage.replyTo?.messageId ||
                  tempMsg?.replyTo?.messageId ||
                  serverMessage.parentMessageId ||
                  null,
              }
            : serverMessage.replyTo,
      };
      const mergedServerMessage = sanitizeMessageReplyFields(rawMerged);
      
      let updatedMessages;
      if (alreadyHasServerMessage) {
        // If the real message was already added via socket event, just remove the temp one
        updatedMessages = messages.filter(m => m._id !== tempId);
      } else {
        // Otherwise replace the temp one with the real one
        updatedMessages = messages.map(m => 
          m._id === tempId ? { ...mergedServerMessage, pending: false } : m
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
  editMessage: async (messageId, channelId, content, htmlContent, fileReferences) => {
    try {
      const payload = { content };
      if (htmlContent) payload.htmlContent = htmlContent;
      if (fileReferences) payload.fileReferences = fileReferences;

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
    const cid = channelId != null ? String(channelId) : null;
    const uid = userId != null ? String(userId) : null;
    if (!cid || !uid) return;

    set((state) => ({
      typingByChannel: {
        ...state.typingByChannel,
        [cid]: {
          ...(state.typingByChannel[cid] || {}),
          [uid]: name
        }
      }
    }));

    const timeoutKey = `${cid}-${uid}`;
    if (typingTimeouts[timeoutKey]) {
      clearTimeout(typingTimeouts[timeoutKey]);
    }

    typingTimeouts[timeoutKey] = setTimeout(() => {
      get().clearTyping(cid, uid);
      delete typingTimeouts[timeoutKey];
    }, TYPING_AUTO_CLEAR_MS);
  },
  clearTyping: (channelId, userId) => {
    const cid = channelId != null ? String(channelId) : null;
    const uid = userId != null ? String(userId) : null;
    if (!cid || !uid) return;

    const timeoutKey = `${cid}-${uid}`;
    if (typingTimeouts[timeoutKey]) {
      clearTimeout(typingTimeouts[timeoutKey]);
      delete typingTimeouts[timeoutKey];
    }

    set((state) => {
      const typing = { ...(state.typingByChannel[cid] || {}) };
      delete typing[uid];
      return {
        typingByChannel: {
          ...state.typingByChannel,
          [cid]: typing
        }
      };
    });
  },
  clearAllTyping: () => {
    for (const key of Object.keys(typingTimeouts)) {
      clearTimeout(typingTimeouts[key]);
      delete typingTimeouts[key];
    }
    set({ typingByChannel: {} });
  },

  // ─── Real-time Message Updates (from socket events) ──────────────────────────
  updateMessage: (message) => {
    if (!message?._id) return;
    const channelId = message.channelId?.toString
      ? message.channelId.toString()
      : String(message.channelId);
    if (!channelId || channelId === 'undefined' || channelId === 'null') return;

    set((state) => {
      const msgs = state.messagesByChannel[channelId] || [];
      const exists = msgs.some((m) => m._id === message._id);
      let updated;
      if (exists) {
        updated = msgs.map((m) => (m._id === message._id ? { ...m, ...message } : m));
      } else {
        const newDate = new Date(message.createdAt).getTime();
        const lastMsg = msgs[msgs.length - 1];
        const lastDate = lastMsg ? new Date(lastMsg.createdAt).getTime() : 0;
        
        if (newDate >= lastDate) {
          updated = [...msgs, message];
        } else {
          updated = [...msgs, message].sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
          );
        }
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updated,
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

  /**
   * Update a specific message's status by its temp ID (used by offline queue flush).
   */
  updateMessageStatusLocal: (tempId, status) => {
    set((state) => {
      const { offlineQueueStatus } = state;
      // Find which channel contains this temp message
      for (const channelId of Object.keys(state.messagesByChannel)) {
        const msgs = state.messagesByChannel[channelId];
        const idx = msgs.findIndex((m) => m._id === tempId);
        if (idx !== -1) {
          const updatedMessages = [...msgs];
          updatedMessages[idx] = { ...updatedMessages[idx], pending: false, status };
          return {
            messagesByChannel: {
              ...state.messagesByChannel,
              [channelId]: updatedMessages,
            },
            offlineQueueStatus: {
              ...offlineQueueStatus,
              [tempId]: status,
            },
          };
        }
      }
      // If message not found in any channel, still update the queue status
      return {
        offlineQueueStatus: {
          ...offlineQueueStatus,
          [tempId]: status,
        },
      };
    });
  },

  /**
   * Mark a message as permanently failed (after max retries exceeded).
   */
  markMessageFailed: (tempId, error) => {
    set((state) => {
      const { offlineQueueStatus } = state;
      let updatedMessagesByChannel = { ...state.messagesByChannel };
      for (const channelId of Object.keys(updatedMessagesByChannel)) {
        const msgs = updatedMessagesByChannel[channelId];
        const idx = msgs.findIndex((m) => m._id === tempId);
        if (idx !== -1) {
          const updatedMessages = [...msgs];
          updatedMessages[idx] = {
            ...updatedMessages[idx],
            pending: false,
            failed: false,
            permanentlyFailed: true,
            lastError: error?.response?.data?.error?.message || error?.message || 'Failed after retries',
          };
          updatedMessagesByChannel[channelId] = updatedMessages;
          break;
        }
      }
      return {
        messagesByChannel: updatedMessagesByChannel,
        offlineQueueStatus: {
          ...offlineQueueStatus,
          [tempId]: 'failed',
        },
      };
    });
  },

  /**
   * Retry sending a permanently failed message.
   * Removes it from the sent IDs set and re-enqueues it.
   */
  retryFailedMessage: async (tempId) => {
    const { removeSentId, enqueueMessage } = require('../services/offlineQueue');
    const state = get();
    
    // Find the message
    for (const channelId of Object.keys(state.messagesByChannel)) {
      const msgs = state.messagesByChannel[channelId];
      const msg = msgs.find((m) => m._id === tempId);
      if (msg) {
        // Clear the permanent failure state
        set((s) => ({
          messagesByChannel: {
            ...s.messagesByChannel,
            [channelId]: (s.messagesByChannel[channelId] || []).map((m) =>
              m._id === tempId
                ? { ...m, permanentlyFailed: false, pending: true, lastError: undefined }
                : m
            ),
          },
          offlineQueueStatus: {
            ...s.offlineQueueStatus,
            [tempId]: 'pending',
          },
        }));

        // Remove from sent IDs so it can be retried
        await removeSentId(tempId);
        
        // Re-send immediately if connected
        if (state.connectionStatus === 'connected') {
          try {
            const { data } = await api.post(`/channels/${channelId}/messages`, { content: msg.content, tempId });
            const serverMessage = data.data?.message || data.data;
            get().reconcileMessage(tempId, serverMessage);
            get().updateMessageStatusLocal(tempId, 'sent');
          } catch (sendError) {
            // If it fails again, re-enqueue
            logger.warn('[ChatStore] Retry failed, re-enqueuing:', tempId);
            const payload = { content: msg.content, tempId };
            const channelId = msg.channelId;
            enqueueMessage(msg, channelId, payload).catch((err) => {
              logger.error('[ChatStore] Failed to re-enqueue on retry:', err);
            });
          }
        } else {
          // Offline — just re-enqueue
          const payload = { content: msg.content, tempId };
          enqueueMessage(msg, channelId, payload).catch((err) => {
            logger.error('[ChatStore] Failed to re-enqueue on retry:', err);
          });
        }
        break;
      }
    }
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
    }),
    {
      name: 'flowtask-chat-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        messagesByChannel: state.messagesByChannel,
      }),
    }
  )
);
