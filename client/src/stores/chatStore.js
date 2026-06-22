import { create } from "zustand";
import { createElement } from "react";
import { messageAPI, threadAPI, botAPI } from "../services/api";
import { useAuthStore } from "./authStore";
import { useChannelStore } from "./channelStore";
import toast from "react-hot-toast";
import logger from "../utils/logger";
import { CHAT_FEATURE_FLAGS } from "../config/featureFlags";
import MentionToast from "../components/notifications/MentionToast";
import NotificationToast from "../components/notifications/NotificationToast";
import { normalizeNotification } from "../utils/notificationFormat";
import {
  loadChannelMessagesFromCache,
  saveChannelMessagesToCache,
  clearMessageCache,
} from "../services/messageCache";

// ─── LRU Message Cache ─────────────────────────────────────────────────────
// Prevent unbounded memory growth by evicting least-recently-used channels.
const MAX_CACHED_CHANNELS = 10;
const channelAccessOrder = []; // Most-recently-accessed at end
const hydratedChannels = new Set();
const hydrationInFlight = new Set();
const pendingPersistByChannel = new Map();
let persistTimer = null;

function touchChannel(channelId) {
  const idx = channelAccessOrder.indexOf(channelId);
  if (idx !== -1) channelAccessOrder.splice(idx, 1);
  channelAccessOrder.push(channelId);
}

function getChannelsToEvict() {
  if (channelAccessOrder.length <= MAX_CACHED_CHANNELS) return [];
  return channelAccessOrder.splice(
    0,
    channelAccessOrder.length - MAX_CACHED_CHANNELS,
  );
}

function buildNormalizedChannel(messages = []) {
  const ids = [];
  const byId = {};

  for (const message of messages) {
    if (!message?._id) continue;
    ids.push(message._id);
    byId[message._id] = message;
  }

  return { ids, byId };
}

function mergeChronologicalMessages(existing = [], incoming = []) {
  const map = new Map();

  for (const message of existing) {
    if (message?._id) map.set(message._id, message);
  }

  for (const message of incoming) {
    if (message?._id) map.set(message._id, message);
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  );
}

function flushChannelPersists() {
  const entries = Array.from(pendingPersistByChannel.entries());
  pendingPersistByChannel.clear();
  persistTimer = null;

  for (const [channelId, messages] of entries) {
    void saveChannelMessagesToCache(channelId, messages);
  }
}

function scheduleChannelPersist(channelId, messages) {
  if (!CHAT_FEATURE_FLAGS.indexedDbCache) return;
  if (!channelId) return;

  pendingPersistByChannel.set(
    channelId,
    Array.isArray(messages) ? messages : [],
  );

  if (persistTimer) return;
  persistTimer = setTimeout(flushChannelPersists, 450);
}

function buildThreadReplyIndex(replies = []) {
  const ids = [];
  const byId = {};

  for (const reply of replies) {
    if (!reply?._id) continue;
    ids.push(reply._id);
    byId[reply._id] = reply;
  }

  return { ids, byId };
}

function nowMs() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

function logSlowMutation(metricName, startedAt, meta = {}) {
  if (!CHAT_FEATURE_FLAGS.perfDebug) return;
  const duration = nowMs() - startedAt;
  if (duration < 6) return;
  logger.debug("[ChatPerf]", metricName, {
    durationMs: Number(duration.toFixed(2)),
    ...meta,
  });
}

export const useChatStore = create((set, get) => ({
  // Messages keyed by channelId
  messagesByChannel: {},
  // Normalized message entities (feature-flagged, maintained via subscription)
  messagesById: {},
  channelMessageIds: {},
  messageChannelById: {},
  hasMore: {},
  isLoadingMessages: false,

  highlightMessageId: null,
  setHighlightMessageId: (id) => set({ highlightMessageId: id }),
  scrollToMessageId: null,
  setScrollToMessageId: (id) => set({ scrollToMessageId: id }),

  // Delete confirmation highlight — persists until modal closes
  messageIdToDelete: null,
  setMessageIdToDelete: (id) => set({ messageIdToDelete: id }),
  clearMessageIdToDelete: () => set({ messageIdToDelete: null }),

  // Pinned messages keyed by channelId
  pinnedMessagesByChannel: {},
  isLoadingPins: false,

  // Pinned panel visibility — persisted in localStorage so it survives page reload
  isPinnedPanelOpen: (() => {
    try { return localStorage.getItem('chat:pinnedPanelOpen') === 'true'; } catch { return false; }
  })(),

  // All threads for the current user
  allThreads: [],
  allThreadsLoading: false,

  // Thread replies keyed by rootMessageId
  threadRepliesByRoot: {},
  threadRepliesById: {},
  threadReplyIdsByRoot: {},
  threadRootByReplyId: {},
  threadParentMessages: {}, // rootMessageId -> parent message object
  threadHasMore: {},
  isLoadingThread: false,

  // Debounce guard for pagination fetches
  _fetchingChannels: new Set(),

  // Typing indicators keyed by channelId → { userId: name }
  typingByChannel: {},


  // Notifications
  notifications: [],

  // Connection status for reconnect indicator
  connectionStatus: "disconnected", // 'connected' | 'connecting' | 'disconnected'

  // Active thread (persisted to sessionStorage for refresh survival)
  activeThread: JSON.parse(
    sessionStorage.getItem("chat_activeThread") || "null",
  ),

  openThread: (thread) => {
    set({ activeThread: thread });
    try {
      sessionStorage.setItem("chat_activeThread", JSON.stringify(thread));
    } catch {
      // Ignore session storage failures in private browsing or restricted environments.
    }
  },

  closeThread: () => {
    set({ activeThread: null });
    sessionStorage.removeItem("chat_activeThread");
  },

  /**
   * Set both scrollToMessageId (for scrolling Virtuoso) and highlightMessageId
   * (for yellow pulse effect). Clears highlight after 3 seconds.
   */
  setScrollAndHighlightMessage: (messageId) => {
    set({ scrollToMessageId: messageId, highlightMessageId: messageId });
    setTimeout(() => {
      const current = get().highlightMessageId;
      if (current === messageId) {
        set({ highlightMessageId: null });
      }
    }, 3000);
  },

  selectMessagesForChannel: (channelId) => {
    if (!channelId) return [];
    const state = get();

    if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
      const ids = state.channelMessageIds[channelId] || [];
      if (ids.length === 0) return [];
      return ids.map((id) => state.messagesById[id]).filter(Boolean);
    }

    return state.messagesByChannel[channelId] || [];
  },

  selectThreadReplies: (rootMessageId) => {
    if (!rootMessageId) return [];
    const state = get();

    if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
      const ids = state.threadReplyIdsByRoot[rootMessageId] || [];
      if (ids.length === 0) return [];
      return ids.map((id) => state.threadRepliesById[id]).filter(Boolean);
    }

    return state.threadRepliesByRoot[rootMessageId] || [];
  },

  selectThreadHasMore: (rootMessageId) => {
    if (!rootMessageId) return false;
    return get().threadHasMore[rootMessageId] ?? false;
  },

  selectMessageByIdOrChannel: (messageId, channelId) => {
    if (!messageId) return null;
    const state = get();

    if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
      return state.messagesById[messageId] || null;
    }

    return (
      state.messagesByChannel[channelId]?.find((m) => m._id === messageId) ||
      null
    );
  },

  // ─── Messages ────────────────────────────────────────────────────────
  fetchMessages: async (channelId, options = {}) => {
    // Guard: reject invalid channelIds before hitting the API or IndexedDB.
    if (!channelId || typeof channelId !== 'string' || channelId === '[object Object]') {
      logger.warn('[chatStore] fetchMessages called with invalid channelId:', channelId)
      return
    }
    // Debounce guard: prevent duplicate fetches for the same channel
    const fetchKey = `${channelId}-${options.cursor || "initial"}`;
    const fetching = get()._fetchingChannels;
    if (fetching.has(fetchKey)) return;
    fetching.add(fetchKey);

    // LRU tracking
    touchChannel(channelId);

    set({ isLoadingMessages: true });

    // Stale-while-revalidate: hydrate from IndexedDB first for instant rendering.
    if (
      CHAT_FEATURE_FLAGS.indexedDbCache &&
      !options.cursor &&
      !hydratedChannels.has(channelId) &&
      !hydrationInFlight.has(channelId)
    ) {
      hydrationInFlight.add(channelId);
      try {
        const cachedMessages = await loadChannelMessagesFromCache(channelId);
        if (cachedMessages.length > 0) {
          set((state) => {
            const existingMessages = state.messagesByChannel[channelId] || [];
            const merged = mergeChronologicalMessages(
              existingMessages,
              cachedMessages,
            );
            return {
              messagesByChannel: {
                ...state.messagesByChannel,
                [channelId]: merged,
              },
            };
          });
        }
      } finally {
        hydratedChannels.add(channelId);
        hydrationInFlight.delete(channelId);
      }
    }

    try {
      const { data } = await messageAPI.list(channelId, options);
      const messages = data.data.items || [];
      const hasMore = data.data.hasMore ?? false;

      set((state) => {
        const existingMessages = state.messagesByChannel[channelId] || [];

        // Defensive fix: Ensure incoming messages are always Oldest -> Newest
        const sortedIncoming = [...messages].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
        );

        let merged;
        if (options.cursor) {
          // Loading older messages: prepend new ones, but filter out duplicates
          const existingIds = new Set(existingMessages.map((m) => m._id));
          const uniqueNew = sortedIncoming.filter(
            (m) => !existingIds.has(m._id),
          );
          merged = [...uniqueNew, ...existingMessages];
        } else {
          // Initial load: prefer fresh messages, keep only RECENT pending local messages (< 30s old)
          const freshIds = new Set(sortedIncoming.map((m) => m._id));
          const thirtySecsAgo = Date.now() - 30000;
          const uniqueExisting = existingMessages.filter(
            (m) =>
              !freshIds.has(m._id) &&
              m.pending &&
              m.channelId === channelId &&
              new Date(m.createdAt).getTime() > thirtySecsAgo,
          );
          merged = [...sortedIncoming, ...uniqueExisting];
        }

        // Final safety check: enforce strict chronological order
        merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        const newMessagesByChannel = {
          ...state.messagesByChannel,
          [channelId]: merged,
        };

        // Evict LRU channels to keep memory bounded
        const toEvict = getChannelsToEvict();
        for (const evictId of toEvict) {
          delete newMessagesByChannel[evictId];
        }

        return {
          messagesByChannel: newMessagesByChannel,
          hasMore: { ...state.hasMore, [channelId]: hasMore },
          isLoadingMessages: false,
        };
      });
    } catch (error) {
      set({ isLoadingMessages: false });
      logger.error("Failed to fetch messages:", error);
    } finally {
      fetching.delete(fetchKey);
    }
  },

  /**
   * Send a message with optimistic UI.
   * Flow: generate tempId → show instantly → send to server → reconcile on ACK
   */
  sendMessage: async (channelId, content, options = {}) => {
    let tempId = null;
    try {
      // Check if it's a slash command (not optimistic)
      if (content.trim().startsWith("/flowtask")) {
        const command = content.trim().replace(/^\/flowtask\s*/i, "");
        const { data } = await botAPI.command(command, channelId);
        return data.data;
      }

      const user = useAuthStore.getState().user;
      tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const isThreadReply = !!options.threadId;

      // Create optimistic message to show immediately
      const optimisticMessage = {
        _id: tempId,
        channelId,
        content,
        htmlContent: options.htmlContent || content,
        contentType: "text",
        authorId: user,
        senderSnapshot: {
          name: user?.name || "You",
          avatar: user?.avatar || null,
        },
        attachments: options.attachments || [],
        fileReferences: options.fileReferences || [],
        mentions: [],
        reactions: [],
        replyCount: 0,
        isEdited: false,
        isPinned: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pending: true,
        failed: false,
        threadId: options.threadId || null,
      };

      // Show optimistic message immediately — thread replies go to thread store
      if (isThreadReply) {
        get().addThreadReply(options.threadId, optimisticMessage);
      } else {
        get().addMessage(optimisticMessage);
        // Update sidebar ordering + preview for the sender's own message immediately
        // (Recipients get this via the message:create socket event handler in socket.js)
        useChannelStore.getState().handleNewMessage(optimisticMessage);
      }

      // Send to server with tempId for ACK reconciliation
      const { data } = await messageAPI.send(channelId, {
        content,
        htmlContent: options.htmlContent || undefined,
        tempId,
        ...options,
      });

      // Server ACK will arrive via socket and reconcile via reconcileMessage()
      // But if ACK hasn't arrived yet, reconcile from HTTP response
      const serverMessage = data.data.message;
      if (isThreadReply) {
        get().reconcileThreadReply(options.threadId, tempId, serverMessage);
        // Increment reply count on root message in main chat
        get().incrementReplyCount(options.threadId, channelId);
      } else {
        get().reconcileMessage(tempId, serverMessage);
      }

      return serverMessage;
    } catch (error) {
      // Mark the optimistic message as failed
      if (tempId && options.threadId) {
        get().markThreadReplyFailed(tempId, options.threadId);
      } else if (tempId) {
        get().markMessageFailed(tempId, channelId);
      }
      toast.error("Failed to send message");
      throw error;
    }
  },

  editMessage: async (messageId, content) => {
    try {
      const { data } = await messageAPI.edit(messageId, content);
      const message = data.data.message;
      set((state) => {
        const channelMsgs = state.messagesByChannel[message.channelId] || [];
        const updatedChannelMessages = channelMsgs.map((m) =>
          m._id === messageId ? message : m,
        );

        if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
          return {
            messagesByChannel: {
              ...state.messagesByChannel,
              [message.channelId]: updatedChannelMessages,
            },
            messagesById: {
              ...state.messagesById,
              [message._id]: {
                ...(state.messagesById[message._id] || {}),
                ...message,
              },
            },
            messageChannelById: {
              ...state.messageChannelById,
              [message._id]: message.channelId,
            },
          };
        }

        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [message.channelId]: updatedChannelMessages,
          },
        };
      });
    } catch {
      toast.error("Failed to edit message");
    }
  },

  deleteMessage: async (messageId, channelId) => {
    try {
      await messageAPI.delete(messageId);
      // Use soft delete locally to show tombstone
      get().softDeleteMessage(messageId, channelId);
    } catch {
      toast.error("Failed to delete message");
    }
  },

  // ─── Real-time message handlers ─────────────────────────────────────
  addMessage: (message) => {
    set((state) => {
      // Never add thread replies to main chat timeline
      if (message.threadId) return state;
      const channelId = message.channelId;
      const existing = state.messagesByChannel[channelId] || [];
      // Avoid duplicates by _id
      if (existing.some((m) => m._id === message._id)) return state;
      // Semantic dedup for activity messages: skip if an identical activity
      // (same eventType + taskId) already arrived within the last 60 seconds.
      // This guards against duplicate socket events caused by any future
      // regression in dual-dispatch on the FlowTask side.
      if (message.activityMeta?.eventType && message.activityMeta?.taskId) {
        const sixtySecsAgo = Date.now() - 60000;
        const isDupe = existing.some(
          (m) =>
            m.activityMeta?.eventType === message.activityMeta.eventType &&
            String(m.activityMeta?.taskId) === String(message.activityMeta.taskId) &&
            new Date(m.createdAt).getTime() >= sixtySecsAgo,
        );
        if (isDupe) return state;
      }
      const merged = [...existing, message].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: merged,
        },
      };
    });
  },

  /**
   * Merge a message window into a channel cache (used by deep-link context loading).
   */
  upsertChannelMessages: (channelId, messages = []) => {
    if (!channelId || !Array.isArray(messages) || messages.length === 0) return;

    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      const map = new Map(existing.map((m) => [m._id, m]));

      for (const message of messages) {
        if (!message?._id) continue;
        map.set(message._id, {
          ...map.get(message._id),
          ...message,
        });
      }

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: merged,
        },
      };
    });
  },

  /**
   * Reconcile an optimistic (temp) message with the server-confirmed message.
   * Replaces tempId with real _id and clears pending state.
   */
  reconcileMessage: (tempId, serverMessage) => {
    if (!tempId || !serverMessage) return;

    set((state) => {
      const channelId =
        serverMessage.channelId || state.messageChannelById[tempId];
      if (!channelId) return state;
      const existing = state.messagesByChannel[channelId] || [];

      // Check if already reconciled (edge case: both HTTP response and socket ACK arrive)
      if (existing.some((m) => m._id === serverMessage._id)) {
        // Just remove the temp message
        const nextChannelMessages = existing.filter((m) => m._id !== tempId);

        if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
          const nextMessagesById = { ...state.messagesById };
          const nextMessageChannelById = { ...state.messageChannelById };
          delete nextMessagesById[tempId];
          delete nextMessageChannelById[tempId];
          nextMessagesById[serverMessage._id] = {
            ...(nextMessagesById[serverMessage._id] || {}),
            ...serverMessage,
          };
          nextMessageChannelById[serverMessage._id] = channelId;

          return {
            messagesByChannel: {
              ...state.messagesByChannel,
              [channelId]: nextChannelMessages,
            },
            messagesById: nextMessagesById,
            messageChannelById: nextMessageChannelById,
          };
        }

        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [channelId]: nextChannelMessages,
          },
        };
      }

      // Replace temp message with server message
      const nextChannelMessages = existing.map((m) =>
        m._id === tempId
          ? { ...serverMessage, pending: false, failed: false }
          : m,
      );

      if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
        const nextMessagesById = { ...state.messagesById };
        const nextMessageChannelById = { ...state.messageChannelById };
        delete nextMessagesById[tempId];
        delete nextMessageChannelById[tempId];
        nextMessagesById[serverMessage._id] = {
          ...(nextMessagesById[serverMessage._id] || {}),
          ...serverMessage,
          pending: false,
          failed: false,
        };
        nextMessageChannelById[serverMessage._id] = channelId;

        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [channelId]: nextChannelMessages,
          },
          messagesById: nextMessagesById,
          messageChannelById: nextMessageChannelById,
        };
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: nextChannelMessages,
        },
      };
    });
  },

  /**
   * Mark a pending message as failed. User can retry later.
   */
  markMessageFailed: (tempId, channelId) => {
    set((state) => {
      const resolvedChannelId = channelId || state.messageChannelById[tempId];
      if (!resolvedChannelId) return state;
      const existing = state.messagesByChannel[resolvedChannelId] || [];

      const nextChannelMessages = existing.map((m) =>
        m._id === tempId ? { ...m, pending: false, failed: true } : m,
      );

      if (
        CHAT_FEATURE_FLAGS.normalizedMessageStore &&
        state.messagesById[tempId]
      ) {
        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [resolvedChannelId]: nextChannelMessages,
          },
          messagesById: {
            ...state.messagesById,
            [tempId]: {
              ...state.messagesById[tempId],
              pending: false,
              failed: true,
            },
          },
          messageChannelById: {
            ...state.messageChannelById,
            [tempId]: resolvedChannelId,
          },
        };
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [resolvedChannelId]: nextChannelMessages,
        },
      };
    });
  },

  /**
   * Retry sending a failed message.
   */
  retryMessage: async (tempId, channelId) => {
    const messages = get().messagesByChannel[channelId] || [];
    const failedMsg = messages.find((m) => m._id === tempId && m.failed);
    if (!failedMsg) return;

    // Remove the failed message
    get().removeMessage(tempId, channelId);

    // Resend
    try {
      await get().sendMessage(channelId, failedMsg.content, {
        threadId: failedMsg.threadId,
        htmlContent: failedMsg.htmlContent,
        fileReferences: failedMsg.fileReferences,
        attachments: failedMsg.attachments,
      });
    } catch {
      // Error already handled in sendMessage
    }
  },

  updateMessage: (message) => {
    set((state) => {
      const channelId =
        message.channelId || state.messageChannelById[message._id];
      if (!channelId) return state;
      const existing = state.messagesByChannel[channelId] || [];

      let replaced = false;
      const updatedChannelMessages = existing.map((m) => {
        if (m._id !== message._id) return m;
        replaced = true;
        return message;
      });

      if (!replaced) return state;

      if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [channelId]: updatedChannelMessages,
          },
          messagesById: {
            ...state.messagesById,
            [message._id]: {
              ...(state.messagesById[message._id] || {}),
              ...message,
            },
          },
          messageChannelById: {
            ...state.messageChannelById,
            [message._id]: channelId,
          },
        };
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updatedChannelMessages,
        },
      };
    });
  },

  removeMessage: (messageId, channelId) => {
    set((state) => {
      const resolvedChannelId =
        channelId || state.messageChannelById[messageId];
      if (!resolvedChannelId) return state;
      const existing = state.messagesByChannel[resolvedChannelId] || [];
      const nextChannelMessages = existing.filter((m) => m._id !== messageId);

      if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
        const nextMessagesById = { ...state.messagesById };
        const nextMessageChannelById = { ...state.messageChannelById };
        const nextChannelMessageIds = { ...state.channelMessageIds };

        delete nextMessagesById[messageId];
        delete nextMessageChannelById[messageId];

        const nextIds = (nextChannelMessageIds[resolvedChannelId] || []).filter(
          (id) => id !== messageId,
        );
        if (nextIds.length > 0) {
          nextChannelMessageIds[resolvedChannelId] = nextIds;
        } else {
          delete nextChannelMessageIds[resolvedChannelId];
        }

        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [resolvedChannelId]: nextChannelMessages,
          },
          messagesById: nextMessagesById,
          messageChannelById: nextMessageChannelById,
          channelMessageIds: nextChannelMessageIds,
        };
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [resolvedChannelId]: nextChannelMessages,
        },
      };
    });
  },

  /**
   * Soft-delete a message: mark as deleted but keep in timeline (tombstone UI).
   */
  softDeleteMessage: (messageId, channelId) => {
    set((state) => {
      const resolvedChannelId =
        channelId || state.messageChannelById[messageId];
      if (!resolvedChannelId) return state;
      const existing = state.messagesByChannel[resolvedChannelId] || [];

      let deletedMessage = null;
      const updatedChannelMessages = existing.map((m) => {
        if (m._id !== messageId) return m;
        deletedMessage = {
          ...m,
          isDeleted: true,
          content: "",
          htmlContent: "",
          deletedAt: new Date().toISOString(),
        };
        return deletedMessage;
      });

      if (!deletedMessage) return state;

      if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [resolvedChannelId]: updatedChannelMessages,
          },
          messagesById: {
            ...state.messagesById,
            [messageId]: {
              ...(state.messagesById[messageId] || {}),
              ...deletedMessage,
            },
          },
          messageChannelById: {
            ...state.messageChannelById,
            [messageId]: resolvedChannelId,
          },
        };
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [resolvedChannelId]: updatedChannelMessages,
        },
      };
    });
  },

  /**
   * Update message delivery status (DM-only: sent → delivered → seen).
   */
  updateMessageStatus: (
    channelId,
    messageId,
    messageIds,
    status,
    timestamps = {},
  ) => {
    set((state) => {
      const startedAt = nowMs();
      if (!channelId) return state;
      const existing = state.messagesByChannel[channelId] || [];
      const idsToUpdate = messageIds || (messageId ? [messageId] : []);
      if (idsToUpdate.length === 0) return state;

      const idSet = new Set(idsToUpdate);

      const updatedChannelMessages = existing.map((m) =>
        idSet.has(m._id) ? { ...m, status, ...timestamps } : m,
      );

      if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
        const nextMessagesById = { ...state.messagesById };
        let hasNormalizedChange = false;

        for (const id of idsToUpdate) {
          const existingEntity = nextMessagesById[id];
          if (!existingEntity) continue;
          hasNormalizedChange = true;
          nextMessagesById[id] = {
            ...existingEntity,
            status,
            ...timestamps,
          };
        }

        logSlowMutation("updateMessageStatus", startedAt, {
          channelId,
          updatedCount: idsToUpdate.length,
          normalized: true,
        });

        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [channelId]: updatedChannelMessages,
          },
          ...(hasNormalizedChange ? { messagesById: nextMessagesById } : {}),
        };
      }

      logSlowMutation("updateMessageStatus", startedAt, {
        channelId,
        updatedCount: idsToUpdate.length,
        normalized: false,
      });

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updatedChannelMessages,
        },
      };
    });
  },

  // ─── Thread Replies ─────────────────────────────────────────────────
  fetchThreadReplies: async (rootMessageId, options = {}) => {
    // Normalize: if an object is passed instead of a plain ID string, extract ._id
    const resolvedId = (rootMessageId?._id ?? rootMessageId)?.toString?.();
    if (!resolvedId) return;
    rootMessageId = resolvedId;
    set({ isLoadingThread: true });
    try {
      const { data } = await threadAPI.replies(rootMessageId, options);
      const items = data.data.items || data.data.messages || [];
      const hasMore = data.data.hasMore ?? false;
      const parentMessage = data.data.parentMessage || null;

      set((state) => {
        const startedAt = nowMs();
        const existing = state.threadRepliesByRoot[rootMessageId] || [];
        let merged;
        if (options.cursor) {
          const existingIds = new Set(existing.map((m) => m._id));
          const unique = items.filter((m) => !existingIds.has(m._id));
          merged = [...existing, ...unique];
        } else {
          const freshIds = new Set(items.map((m) => m._id));
          const thirtySecsAgo = Date.now() - 30000;
          const pendingOnly = existing.filter(
            (m) =>
              !freshIds.has(m._id) &&
              m.pending &&
              new Date(m.createdAt).getTime() > thirtySecsAgo,
          );
          merged = [...items, ...pendingOnly];
        }
        merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        const { ids, byId } = buildThreadReplyIndex(merged);
        const nextRepliesById = { ...state.threadRepliesById };
        const nextRootByReplyId = { ...state.threadRootByReplyId };

        const previousIds = state.threadReplyIdsByRoot[rootMessageId] || [];
        for (const id of previousIds) {
          delete nextRepliesById[id];
          delete nextRootByReplyId[id];
        }

        for (const id of ids) {
          nextRepliesById[id] = byId[id];
          nextRootByReplyId[id] = rootMessageId;
        }

        logSlowMutation("fetchThreadReplies.merge", startedAt, {
          rootMessageId,
          mergedCount: merged.length,
          cursorMode: Boolean(options.cursor),
        });

        // Update parent message in store if received from API
        const nextParentMessages = { ...state.threadParentMessages };
        if (parentMessage) {
          nextParentMessages[rootMessageId] = parentMessage;
        }

        return {
          threadRepliesByRoot: {
            ...state.threadRepliesByRoot,
            [rootMessageId]: merged,
          },
          threadRepliesById: nextRepliesById,
          threadReplyIdsByRoot: {
            ...state.threadReplyIdsByRoot,
            [rootMessageId]: ids,
          },
          threadRootByReplyId: nextRootByReplyId,
          threadParentMessages: nextParentMessages,
          threadHasMore: { ...state.threadHasMore, [rootMessageId]: hasMore },
          isLoadingThread: false,
        };
      });
    } catch (error) {
      set({ isLoadingThread: false });
      logger.error("Failed to fetch thread replies:", error);
    }
  },

  addThreadReply: (rootMessageId, reply) => {
    set((state) => {
      const existing = state.threadRepliesByRoot[rootMessageId] || [];
      if (existing.some((m) => m._id === reply._id)) return state;
      const nextReplies = [...existing, reply];

      const nextIds = [...(state.threadReplyIdsByRoot[rootMessageId] || [])];
      if (!nextIds.includes(reply._id)) nextIds.push(reply._id);

      return {
        threadRepliesByRoot: {
          ...state.threadRepliesByRoot,
          [rootMessageId]: nextReplies,
        },
        threadRepliesById: {
          ...state.threadRepliesById,
          [reply._id]: reply,
        },
        threadReplyIdsByRoot: {
          ...state.threadReplyIdsByRoot,
          [rootMessageId]: nextIds,
        },
        threadRootByReplyId: {
          ...state.threadRootByReplyId,
          [reply._id]: rootMessageId,
        },
      };
    });
  },

  reconcileThreadReply: (rootMessageId, tempId, serverReply) => {
    if (!tempId || !serverReply) return;
    set((state) => {
      const resolvedRootId = rootMessageId || state.threadRootByReplyId[tempId];
      if (!resolvedRootId) return state;

      const existing = state.threadRepliesByRoot[resolvedRootId] || [];
      if (existing.some((m) => m._id === serverReply._id)) {
        const nextReplies = existing.filter((m) => m._id !== tempId);
        const nextIds = (
          state.threadReplyIdsByRoot[resolvedRootId] || []
        ).filter((id) => id !== tempId);
        const nextRepliesById = { ...state.threadRepliesById };
        const nextRootByReplyId = { ...state.threadRootByReplyId };
        delete nextRepliesById[tempId];
        delete nextRootByReplyId[tempId];
        nextRepliesById[serverReply._id] = {
          ...(nextRepliesById[serverReply._id] || {}),
          ...serverReply,
        };
        nextRootByReplyId[serverReply._id] = resolvedRootId;

        return {
          threadRepliesByRoot: {
            ...state.threadRepliesByRoot,
            [resolvedRootId]: nextReplies,
          },
          threadRepliesById: nextRepliesById,
          threadReplyIdsByRoot: {
            ...state.threadReplyIdsByRoot,
            [resolvedRootId]: nextIds,
          },
          threadRootByReplyId: nextRootByReplyId,
        };
      }

      const nextReplies = existing.map((m) =>
        m._id === tempId
          ? { ...serverReply, pending: false, failed: false }
          : m,
      );

      const nextIds = (state.threadReplyIdsByRoot[resolvedRootId] || []).map(
        (id) => (id === tempId ? serverReply._id : id),
      );

      const dedupedIds = Array.from(new Set(nextIds));

      const nextRepliesById = { ...state.threadRepliesById };
      const nextRootByReplyId = { ...state.threadRootByReplyId };
      delete nextRepliesById[tempId];
      delete nextRootByReplyId[tempId];
      nextRepliesById[serverReply._id] = {
        ...(nextRepliesById[serverReply._id] || {}),
        ...serverReply,
        pending: false,
        failed: false,
      };
      nextRootByReplyId[serverReply._id] = resolvedRootId;

      return {
        threadRepliesByRoot: {
          ...state.threadRepliesByRoot,
          [resolvedRootId]: nextReplies,
        },
        threadRepliesById: nextRepliesById,
        threadReplyIdsByRoot: {
          ...state.threadReplyIdsByRoot,
          [resolvedRootId]: dedupedIds,
        },
        threadRootByReplyId: nextRootByReplyId,
      };
    });
  },

  editThreadReply: async (messageId, content) => {
    try {
      const { data } = await messageAPI.edit(messageId, content);
      const updated = data.data.message;
      set((state) => {
        // Find which root this reply belongs to
        const rootId = state.threadRootByReplyId[messageId];
        if (!rootId) return state;

        const existing = state.threadRepliesByRoot[rootId] || [];
        const nextReplies = existing.map((m) =>
          m._id === messageId ? { ...m, ...updated, isEdited: true } : m,
        );

        return {
          threadRepliesByRoot: {
            ...state.threadRepliesByRoot,
            [rootId]: nextReplies,
          },
          threadRepliesById: {
            ...state.threadRepliesById,
            [messageId]: {
              ...(state.threadRepliesById[messageId] || {}),
              ...updated,
              isEdited: true,
            },
          },
        };
      });
    } catch {
      toast.error('Failed to edit message');
    }
  },

  softDeleteThreadReply: (messageId) => {
    set((state) => {
      const rootId = state.threadRootByReplyId[messageId];
      if (!rootId) return state;

      const existing = state.threadRepliesByRoot[rootId] || [];
      const deleted = {
        isDeleted: true,
        content: '',
        htmlContent: '',
        deletedAt: new Date().toISOString(),
      };

      const nextReplies = existing.map((m) =>
        m._id === messageId ? { ...m, ...deleted } : m,
      );

      return {
        threadRepliesByRoot: {
          ...state.threadRepliesByRoot,
          [rootId]: nextReplies,
        },
        threadRepliesById: {
          ...state.threadRepliesById,
          [messageId]: {
            ...(state.threadRepliesById[messageId] || {}),
            ...deleted,
          },
        },
      };
    });
  },

  deleteThreadReply: async (messageId) => {
    try {
      await messageAPI.delete(messageId);
      get().softDeleteThreadReply(messageId);
    } catch {
      toast.error('Failed to delete message');
    }
  },

  markThreadReplyFailed: (tempId, rootMessageId) => {
    set((state) => {
      const resolvedRootId = rootMessageId || state.threadRootByReplyId[tempId];
      if (!resolvedRootId) return state;

      const existing = state.threadRepliesByRoot[resolvedRootId] || [];
      const nextReplies = existing.map((m) =>
        m._id === tempId ? { ...m, pending: false, failed: true } : m,
      );

      return {
        threadRepliesByRoot: {
          ...state.threadRepliesByRoot,
          [resolvedRootId]: nextReplies,
        },
        ...(state.threadRepliesById[tempId]
          ? {
              threadRepliesById: {
                ...state.threadRepliesById,
                [tempId]: {
                  ...state.threadRepliesById[tempId],
                  pending: false,
                  failed: true,
                },
              },
            }
          : {}),
      };
    });
  },

  incrementReplyCount: (rootMessageId, channelId) => {
    set((state) => {
      const resolvedChannelId =
        channelId || state.messageChannelById[rootMessageId];
      if (!resolvedChannelId) return state;
      const existing = state.messagesByChannel[resolvedChannelId] || [];

      let updatedReplyCount = null;
      const nextChannelMessages = existing.map((m) => {
        if (m._id !== rootMessageId) return m;
        const updated = { ...m, replyCount: (m.replyCount || 0) + 1 };
        updatedReplyCount = updated.replyCount;
        return updated;
      });

      if (updatedReplyCount === null) return state;

      if (
        CHAT_FEATURE_FLAGS.normalizedMessageStore &&
        state.messagesById[rootMessageId]
      ) {
        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [resolvedChannelId]: nextChannelMessages,
          },
          messagesById: {
            ...state.messagesById,
            [rootMessageId]: {
              ...state.messagesById[rootMessageId],
              replyCount: updatedReplyCount,
            },
          },
          messageChannelById: {
            ...state.messageChannelById,
            [rootMessageId]: resolvedChannelId,
          },
        };
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [resolvedChannelId]: nextChannelMessages,
        },
      };
    });
  },

  // Updates replyCount, lastReplyAt, and threadParticipants on a root message.
  // Called when THREAD_STATS_UPDATED socket event arrives with populated participant data.
  updateThreadStats: (rootMessageId, channelId, updates) => {
    set((state) => {
      const resolvedChannelId = channelId || state.messageChannelById[rootMessageId];
      if (!resolvedChannelId) return state;
      const existing = state.messagesByChannel[resolvedChannelId] || [];

      let found = false;
      const nextChannelMessages = existing.map((m) => {
        if (m._id !== rootMessageId) return m;
        found = true;
        return { ...m, ...updates };
      });

      if (!found) return state;

      const nextById = CHAT_FEATURE_FLAGS.normalizedMessageStore && state.messagesById[rootMessageId]
        ? { ...state.messagesById, [rootMessageId]: { ...state.messagesById[rootMessageId], ...updates } }
        : state.messagesById;

      return {
        messagesByChannel: { ...state.messagesByChannel, [resolvedChannelId]: nextChannelMessages },
        messagesById: nextById,
        messageChannelById: { ...state.messageChannelById, [rootMessageId]: resolvedChannelId },
      };
    });
  },

  clearThreadReplies: (rootMessageId) => {
    set((state) => {
      const newThreadReplies = { ...state.threadRepliesByRoot };
      const newThreadReplyIds = { ...state.threadReplyIdsByRoot };
      const newThreadRepliesById = { ...state.threadRepliesById };
      const newThreadRootByReplyId = { ...state.threadRootByReplyId };

      const idsForRoot = newThreadReplyIds[rootMessageId] || [];
      for (const replyId of idsForRoot) {
        delete newThreadRepliesById[replyId];
        delete newThreadRootByReplyId[replyId];
      }

      delete newThreadReplies[rootMessageId];
      delete newThreadReplyIds[rootMessageId];

      return {
        threadRepliesByRoot: newThreadReplies,
        threadReplyIdsByRoot: newThreadReplyIds,
        threadRepliesById: newThreadRepliesById,
        threadRootByReplyId: newThreadRootByReplyId,
      };
    });
  },

  // ─── Reactions ──────────────────────────────────────────────────────
  addReaction: async (messageId, emoji) => {
    try {
      await messageAPI.addReaction(messageId, emoji);
    } catch {
      toast.error("Failed to add reaction");
    }
  },

  removeReaction: async (messageId, emoji) => {
    try {
      await messageAPI.removeReaction(messageId, emoji);
    } catch {
      toast.error("Failed to remove reaction");
    }
  },

  addReactionLocal: (messageId, userId, emoji, channelId) => {
    set((state) => {
      const startedAt = nowMs();
      const newState = { ...state.messagesByChannel };
      // Prefer indexed channel lookup when normalization is enabled.
      const hintedChannelId =
        channelId ||
        (CHAT_FEATURE_FLAGS.normalizedMessageStore
          ? state.messageChannelById[messageId]
          : null);
      const channelsToScan =
        hintedChannelId && newState[hintedChannelId]
          ? [hintedChannelId]
          : Object.keys(newState);
      for (const cid of channelsToScan) {
        newState[cid] = newState[cid].map((m) => {
          if (m._id !== messageId) return m;
          const reactions = [...(m.reactions || [])];
          const existing = reactions.find((r) => r.emoji === emoji);
          if (existing) {
            if (
              !existing.users?.includes(userId) &&
              !existing.userIds?.some((id) => id?.toString() === userId)
            ) {
              existing.users = [...(existing.users || []), userId];
              existing.userIds = [...(existing.userIds || []), userId];
              existing.count = (existing.count || 0) + 1;
            }
          } else {
            reactions.push({
              emoji,
              users: [userId],
              userIds: [userId],
              count: 1,
            });
          }
          return { ...m, reactions };
        });
      }
      logSlowMutation("addReactionLocal", startedAt, {
        channelsScanned: channelsToScan.length,
        usedHint: Boolean(hintedChannelId),
      });
      return { messagesByChannel: newState };
    });
  },

  removeReactionLocal: (messageId, userId, emoji, channelId) => {
    set((state) => {
      const startedAt = nowMs();
      const newState = { ...state.messagesByChannel };
      const hintedChannelId =
        channelId ||
        (CHAT_FEATURE_FLAGS.normalizedMessageStore
          ? state.messageChannelById[messageId]
          : null);
      const channelsToScan =
        hintedChannelId && newState[hintedChannelId]
          ? [hintedChannelId]
          : Object.keys(newState);
      for (const cid of channelsToScan) {
        newState[cid] = newState[cid].map((m) => {
          if (m._id !== messageId) return m;
          const reactions = (m.reactions || [])
            .map((r) => {
              if (r.emoji !== emoji) return r;
              return {
                ...r,
                users: (r.users || []).filter((u) => u !== userId),
                userIds: (r.userIds || []).filter(
                  (u) => u?.toString() !== userId,
                ),
                count: Math.max(0, (r.count || 1) - 1),
              };
            })
            .filter((r) => r.users?.length > 0 || r.count > 0);
          return { ...m, reactions };
        });
      }
      logSlowMutation("removeReactionLocal", startedAt, {
        channelsScanned: channelsToScan.length,
        usedHint: Boolean(hintedChannelId),
      });
      return { messagesByChannel: newState };
    });
  },

  // ─── Typing ─────────────────────────────────────────────────────────
  setTyping: (channelId, userId, name) => {
    set((state) => ({
      typingByChannel: {
        ...state.typingByChannel,
        [channelId]: { ...state.typingByChannel[channelId], [userId]: name },
      },
    }));
    // Auto-clear after 5s
    setTimeout(() => {
      get().clearTyping(channelId, userId);
    }, 5000);
  },

  clearTyping: (channelId, userId) => {
    set((state) => {
      const typing = { ...state.typingByChannel[channelId] };
      delete typing[userId];
      return {
        typingByChannel: { ...state.typingByChannel, [channelId]: typing },
      };
    });
  },


  // ─── Notifications ─────────────────────────────────────────────────
  addNotification: (notification) => {
    const normalized = normalizeNotification(notification);
    if (!normalized) return;
    // Prevent duplicate notifications in the same client session
    const current = get();
    if (current.notifications.some((n) => n._id === normalized._id)) return;

    set((state) => ({
      notifications: [normalized, ...state.notifications].slice(0, 50),
    }));
    if (normalized.type === "mention") {
      toast.custom(
        () => createElement(MentionToast, { notification: normalized }),
        {
          duration: 4200,
        },
      );
    } else if (normalized.type === 'reminder_overdue') {
      toast.custom(
        (t) => createElement(NotificationToast, {
          notification: {
            ...normalized,
            senderName: 'Reminder',
            senderAvatar: null,
          },
          onClick: () => {
            const workspaceId = normalized.deepLink?.workspaceId;
            const channelId = normalized.deepLink?.channelId;
            const messageId = normalized.deepLink?.messageId;
            
            if (workspaceId && channelId && messageId) {
              window.location.href = `/workspace/${workspaceId}/channel/${channelId}?message=${messageId}`;
            } else if (workspaceId) {
              window.location.href = `/workspace/${workspaceId}/later`;
            }
            toast.dismiss(t.id);
          },
          onDismiss: () => toast.dismiss(t.id),
          playSound: true,
        }),
        { duration: 6000 },
      );
    } else if (normalized.type === 'system' || normalized.type === 'bot_alert') {
      toast.success(normalized.title || 'Notification received', { 
        duration: 3000,
        icon: '🔔'
      });
    }
  },

  clearNotifications: () => set({ notifications: [] }),

  // ─── Pinned Messages ───────────────────────────────────────────────
  setIsPinnedPanelOpen: (value) => {
    set({ isPinnedPanelOpen: value });
    try { localStorage.setItem('chat:pinnedPanelOpen', String(value)); } catch { /* noop */ }
  },
  togglePinnedPanel: () => {
    const next = !useChatStore.getState().isPinnedPanelOpen;
    set({ isPinnedPanelOpen: next });
    try { localStorage.setItem('chat:pinnedPanelOpen', String(next)); } catch { /* noop */ }
  },

  fetchPinnedMessages: async (channelId) => {
    // Stale-while-revalidate: seed from sessionStorage for instant display on reload
    if (!useChatStore.getState().pinnedMessagesByChannel[channelId]) {
      try {
        const cached = sessionStorage.getItem(`chat:pins:${channelId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            set((state) => ({
              pinnedMessagesByChannel: {
                ...state.pinnedMessagesByChannel,
                [channelId]: parsed,
              },
            }));
          }
        }
      } catch {
        try { sessionStorage.removeItem(`chat:pins:${channelId}`); } catch { /* noop */ }
      }
    }
    set({ isLoadingPins: true });
    try {
      const { data } = await messageAPI.getPinned(channelId);
      const pins = data.data?.items || data.data?.messages || data.data || [];
      const pinArray = Array.isArray(pins) ? pins : [];
      set((state) => ({
        pinnedMessagesByChannel: {
          ...state.pinnedMessagesByChannel,
          [channelId]: pinArray,
        },
        isLoadingPins: false,
      }));
      // Persist to sessionStorage for reload rehydration
      try { sessionStorage.setItem(`chat:pins:${channelId}`, JSON.stringify(pinArray)); } catch { /* noop */ }
    } catch (error) {
      set({ isLoadingPins: false });
      logger.error("Failed to fetch pinned messages:", error);
    }
  },

  pinMessage: async (messageId) => {
    try {
      await messageAPI.pin(messageId);
      // Optimistic: update isPinned in message list
      set((state) => {
        const targetChannelId = CHAT_FEATURE_FLAGS.normalizedMessageStore
          ? state.messageChannelById[messageId]
          : null;

        const channelsToScan = targetChannelId
          ? [targetChannelId]
          : Object.keys(state.messagesByChannel);

        const newState = { ...state.messagesByChannel };
        for (const cid of channelsToScan) {
          if (!newState[cid]) continue;
          newState[cid] = newState[cid].map((m) =>
            m._id === messageId ? { ...m, isPinned: true } : m,
          );
        }

        if (
          CHAT_FEATURE_FLAGS.normalizedMessageStore &&
          state.messagesById[messageId]
        ) {
          return {
            messagesByChannel: newState,
            messagesById: {
              ...state.messagesById,
              [messageId]: {
                ...state.messagesById[messageId],
                isPinned: true,
              },
            },
          };
        }

        return { messagesByChannel: newState };
      });
      toast.success("Message pinned");
    } catch {
      toast.error("Failed to pin message");
    }
  },

  unpinMessage: async (messageId) => {
    try {
      await messageAPI.unpin(messageId);
      set((state) => {
        const targetChannelId = CHAT_FEATURE_FLAGS.normalizedMessageStore
          ? state.messageChannelById[messageId]
          : null;

        const channelsToScan = targetChannelId
          ? [targetChannelId]
          : Object.keys(state.messagesByChannel);

        const newState = { ...state.messagesByChannel };
        for (const cid of channelsToScan) {
          if (!newState[cid]) continue;
          newState[cid] = newState[cid].map((m) =>
            m._id === messageId ? { ...m, isPinned: false } : m,
          );
        }

        // Remove from pinned cache
        const newPins = { ...state.pinnedMessagesByChannel };
        const pinChannelsToScan = targetChannelId
          ? [targetChannelId]
          : Object.keys(newPins);
        for (const cid of pinChannelsToScan) {
          if (!newPins[cid]) continue;
          newPins[cid] = (newPins[cid] || []).filter(
            (m) => m._id !== messageId,
          );
        }

        if (
          CHAT_FEATURE_FLAGS.normalizedMessageStore &&
          state.messagesById[messageId]
        ) {
          return {
            messagesByChannel: newState,
            pinnedMessagesByChannel: newPins,
            messagesById: {
              ...state.messagesById,
              [messageId]: {
                ...state.messagesById[messageId],
                isPinned: false,
              },
            },
          };
        }

        return {
          messagesByChannel: newState,
          pinnedMessagesByChannel: newPins,
        };
      });
      toast.success("Message unpinned");
    } catch {
      toast.error("Failed to unpin message");
    }
  },

  // Handle pin socket events
  handleMessagePinned: (payload) => {
    set((state) => {
      // Backend now emits a full message object in payload.message
      const message = payload?.message || payload;
      const messageId = message?._id || payload?.messageId;
      const cid = message?.channelId?.toString?.() || payload?.channelId?.toString?.();
      if (!messageId || !cid) return state;

      const newMsgs = { ...state.messagesByChannel };
      if (newMsgs[cid]) {
        newMsgs[cid] = newMsgs[cid].map((m) =>
          m._id === messageId ? { ...m, isPinned: true } : m,
        );
      }
      // Add to pinned cache if loaded — prefer the rich socket payload over stale cache
      const newPins = { ...state.pinnedMessagesByChannel };
      if (newPins[cid]) {
        if (!newPins[cid].some((m) => m._id === messageId)) {
          // Use the full message from socket (has attachments), fall back to cached message
          const cachedMessage = newMsgs[cid]?.find((m) => m._id === messageId);
          const pinEntry = (message?._id ? message : null) || cachedMessage;
          if (pinEntry) {
            const updated = [{ ...pinEntry, isPinned: true }, ...newPins[cid]];
            newPins[cid] = updated;
            // Update sessionStorage
            try { sessionStorage.setItem(`chat:pins:${cid}`, JSON.stringify(updated)); } catch { /* noop */ }
          }
        }
      }
      if (CHAT_FEATURE_FLAGS.normalizedMessageStore && messageId) {
        return {
          messagesByChannel: newMsgs,
          pinnedMessagesByChannel: newPins,
          messagesById: {
            ...state.messagesById,
            [messageId]: {
              ...(state.messagesById[messageId] || message || {}),
              ...(message || {}),
              isPinned: true,
            },
          },
          messageChannelById: {
            ...state.messageChannelById,
            ...(cid ? { [messageId]: cid } : {}),
          },
        };
      }

      return { messagesByChannel: newMsgs, pinnedMessagesByChannel: newPins };
    });
  },

  handleMessageUnpinned: (payload) => {
    set((state) => {
      const message = payload?.message || payload;
      const messageId = message?._id || payload?.messageId;
      const cid = message?.channelId || payload?.channelId;
      if (!messageId || !cid) return state;

      const newMsgs = { ...state.messagesByChannel };
      if (newMsgs[cid]) {
        newMsgs[cid] = newMsgs[cid].map((m) =>
          m._id === messageId ? { ...m, isPinned: false } : m,
        );
      }
      const newPins = { ...state.pinnedMessagesByChannel };
      if (newPins[cid]) {
        const updated = newPins[cid].filter((m) => m._id !== messageId);
        newPins[cid] = updated;
        // Sync sessionStorage
        try { sessionStorage.setItem(`chat:pins:${cid}`, JSON.stringify(updated)); } catch { /* noop */ }
      }
      if (
        CHAT_FEATURE_FLAGS.normalizedMessageStore &&
        messageId &&
        state.messagesById[messageId]
      ) {
        return {
          messagesByChannel: newMsgs,
          pinnedMessagesByChannel: newPins,
          messagesById: {
            ...state.messagesById,
            [messageId]: {
              ...state.messagesById[messageId],
              ...(message || {}),
              isPinned: false,
            },
          },
        };
      }

      return { messagesByChannel: newMsgs, pinnedMessagesByChannel: newPins };
    });
  },

  // ─── All Threads ────────────────────────────────────────────────────
  fetchAllThreads: async () => {
    set({ allThreadsLoading: true });
    try {
      const { data } = await threadAPI.myThreads();
      const threads = data.data?.items || data.data?.threads || data.data || [];
      set({
        allThreads: Array.isArray(threads) ? threads : [],
        allThreadsLoading: false,
      });
    } catch (error) {
      set({ allThreadsLoading: false });
      logger.error("Failed to fetch threads:", error);
    }
  },

  // ─── Connection Status ──────────────────────────────────────────────
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // ─── Workspace Switch — Clear all cached data ──────────────────────
  clearCache: () => {
    // Clear per-channel pin caches from sessionStorage
    try {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('chat:pins:')) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch { /* noop */ }

    set({
      messagesByChannel: {},
      messagesById: {},
      channelMessageIds: {},
      messageChannelById: {},
      hasMore: {},
      pinnedMessagesByChannel: {},
      isPinnedPanelOpen: false,
      allThreads: [],
      threadRepliesByRoot: {},
      threadRepliesById: {},
      threadReplyIdsByRoot: {},
      threadRootByReplyId: {},
      threadParentMessages: {},
      threadHasMore: {},
      typingByChannel: {},

      notifications: [],
      activeThread: null,
    });
    try { localStorage.removeItem('chat:pinnedPanelOpen'); } catch { /* noop */ }
  },
}));

useChatStore.subscribe((state, prevState) => {
  if (!CHAT_FEATURE_FLAGS.indexedDbCache) return;

  const nextMessagesByChannel = state.messagesByChannel;
  const prevMessagesByChannel = prevState.messagesByChannel;
  if (nextMessagesByChannel === prevMessagesByChannel) return;

  for (const [channelId, messages] of Object.entries(nextMessagesByChannel)) {
    if (prevMessagesByChannel[channelId] !== messages) {
      scheduleChannelPersist(channelId, messages);
    }
  }
});

useChatStore.subscribe((state, prevState) => {
  if (!CHAT_FEATURE_FLAGS.normalizedMessageStore) return;

  const nextMessagesByChannel = state.messagesByChannel;
  const prevMessagesByChannel = prevState.messagesByChannel;
  if (nextMessagesByChannel === prevMessagesByChannel) return;

  const nextMessagesById = { ...state.messagesById };
  const nextChannelMessageIds = { ...state.channelMessageIds };
  const nextMessageChannelById = { ...state.messageChannelById };

  const channelIds = new Set([
    ...Object.keys(prevMessagesByChannel),
    ...Object.keys(nextMessagesByChannel),
  ]);

  let hasChanges = false;

  for (const channelId of channelIds) {
    if (prevMessagesByChannel[channelId] === nextMessagesByChannel[channelId])
      continue;

    hasChanges = true;
    const prevIds = prevState.channelMessageIds[channelId] || [];

    for (const messageId of prevIds) {
      if (nextMessageChannelById[messageId] === channelId) {
        delete nextMessageChannelById[messageId];
      }
      delete nextMessagesById[messageId];
    }

    const channelMessages = nextMessagesByChannel[channelId] || [];
    const { ids, byId } = buildNormalizedChannel(channelMessages);

    if (channelMessages.length > 0) {
      nextChannelMessageIds[channelId] = ids;
    } else {
      delete nextChannelMessageIds[channelId];
    }

    for (const messageId of ids) {
      nextMessagesById[messageId] = byId[messageId];
      nextMessageChannelById[messageId] = channelId;
    }
  }

  if (hasChanges) {
    useChatStore.setState({
      messagesById: nextMessagesById,
      channelMessageIds: nextChannelMessageIds,
      messageChannelById: nextMessageChannelById,
    });
  }
});

if (CHAT_FEATURE_FLAGS.indexedDbCache) {
  const originalClearCache = useChatStore.getState().clearCache;
  useChatStore.setState({
    clearCache: () => {
      hydratedChannels.clear();
      hydrationInFlight.clear();
      channelAccessOrder.splice(0, channelAccessOrder.length);
      pendingPersistByChannel.clear();
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      void clearMessageCache();
      originalClearCache();
    },
  });
}
