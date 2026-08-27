import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import { useAuthStore } from './authStore';
import { useChannelStore } from './channelStore';
import { reactionAPI, messageAPI } from '../services/api';
import {
  addReactionToMessageCache,
  removeReactionFromMessageCache,
  addReactionToThreadReplyCache,
  removeReactionFromThreadReplyCache,
} from '../queries/cacheUtils';
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
  connectionStatus: 'disconnected',
  // Track which temp IDs are queued offline (for UI state)
  offlineQueueStatus: {}, // { [tempId]: 'pending' | 'sent' | 'failed' }

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
        enqueueMessage({ tempId }, channelId, payload).catch((err) => {
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

      logger.error('Failed to send message (server error):', error);
      throw error;
    }
  },

  reconcileMessage: (tempId, serverMessage) => {
    const channelId = serverMessage.channelId?.toString ? serverMessage.channelId.toString() : String(serverMessage.channelId);
    set((state) => {
      // Reconcile Logic
      return {
        offlineQueueStatus: {
          ...state.offlineQueueStatus,
          [tempId]: 'sent',
        },
      };
    });
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setOfflineQueueStatus: (tempId, status) => set((state) => ({
    offlineQueueStatus: {
      ...state.offlineQueueStatus,
      [tempId]: status,
    },
  })),

  // ─── Reactions ─────────────────────────────────────────────────────────────
  addReaction: async (messageId, emoji, channelId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const reactionUser = { _id: user._id, name: user.name, avatar: user.avatar };
    // Optimistic: apply locally for instant feedback. The socket listener
    // reuses the same cache helpers and is idempotent (it skips a user that is
    // already present), so the database stays the single source of truth with
    // no double count.
    addReactionToMessageCache(channelId, messageId, emoji, reactionUser);
    addReactionToThreadReplyCache(messageId, emoji, reactionUser);
    try {
      await reactionAPI.add(messageId, emoji);
    } catch (error) {
      // Roll back the optimistic update if the server rejected it.
      removeReactionFromMessageCache(channelId, messageId, emoji, user._id);
      removeReactionFromThreadReplyCache(messageId, emoji, user._id);
      logger.error('Failed to add reaction:', error);
    }
  },

  removeReaction: async (messageId, emoji, channelId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    // Optimistic: remove locally for instant feedback.
    removeReactionFromMessageCache(channelId, messageId, emoji, user._id);
    removeReactionFromThreadReplyCache(messageId, emoji, user._id);
    try {
      await reactionAPI.remove(messageId, emoji);
    } catch (error) {
      // Roll back the optimistic removal if the server rejected it.
      const reactionUser = { _id: user._id, name: user.name, avatar: user.avatar };
      addReactionToMessageCache(channelId, messageId, emoji, reactionUser);
      addReactionToThreadReplyCache(messageId, emoji, reactionUser);
      logger.error('Failed to remove reaction:', error);
    }
  },

  // ─── Edit / Delete Message ──────────────────────────────────────────────────
  editMessage: async (messageId, channelId, content, htmlContent, fileReferences) => {
    try {
      const payload = { content };
      if (htmlContent) payload.htmlContent = htmlContent;
      if (fileReferences) {
        payload.fileReferences = fileReferences
          .map((id) => {
            if (id && typeof id === 'object') return String(id._id || id.id || '');
            return String(id || '');
          })
          .filter((id) => /^[0-9a-fA-F]{24}$/.test(id));
      }

      await api.put(`/messages/${messageId}`, payload);
    } catch (error) {
      logger.error('Failed to edit message:', error);
      throw error;
    }
  },

  deleteMessage: async (messageId, channelId) => {
    try {
      await api.delete(`/messages/${messageId}`);
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

    }),
    {
      name: 'flowtask-chat-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        offlineQueueStatus: state.offlineQueueStatus,
      }),
    }
  )
);
