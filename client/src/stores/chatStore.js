import { create } from "zustand";
import { createElement } from "react";
import { messageAPI, threadAPI, botAPI } from "../services/api";
import { useAuthStore } from "./authStore";
import { useChannelStore } from "./channelStore";
import { useWorkspaceStore } from "./workspaceStore";
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

// Auto-clear timers for typing indicators (keyed by `${channelId}-${userId}`)
const typingTimeouts = {};
const TYPING_AUTO_CLEAR_MS = 5000;

function normalizeChannelId(channelId) {
  if (channelId == null) return null;
  if (typeof channelId === "string") {
    return channelId !== "[object Object]" ? channelId : null;
  }
  if (typeof channelId === "object") {
    if (channelId._id != null) return normalizeChannelId(channelId._id);
    if (typeof channelId.toString === "function") {
      const serialized = channelId.toString();
      if (serialized !== "[object Object]") return serialized;
    }
  }
  return String(channelId);
}

function normalizeMessage(message) {
  if (!message) return message;
  const channelId = normalizeChannelId(message.channelId);
  return channelId ? { ...message, channelId } : message;
}

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

/** Build id list + byId map for thread reply normalized indexes. */
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

// ─── Reaction mutators (pure helpers) ───────────────────────────────────
// Reused by addReactionLocal / removeReactionLocal so a single source of
// truth updates the legacy messagesByChannel store, the normalized
// messagesById store, and the threadRepliesById store together.
// Add `userId` to the reaction matching `emoji` (or create it). Idempotent:
// a user already present is never added twice, so an optimistic local update
// followed by the server echo cannot double-count.
function addReactionToUser(reactions, userId, emoji) {
  const next = (reactions || []).map((r) => ({ ...r }));
  const existing = next.find((r) => r.emoji === emoji);
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
    next.push({ emoji, users: [userId], userIds: [userId], count: 1 });
  }
  return next;
}

// Remove `userId` from the reaction matching `emoji`. Drops the entry when
// no users remain.
function removeReactionFromUser(reactions, userId, emoji) {
  return (reactions || [])
    .map((r) => {
      if (r.emoji !== emoji) return { ...r };
      return {
        ...r,
        users: (r.users || []).filter((u) => u !== userId),
        userIds: (r.userIds || []).filter((u) => u?.toString() !== userId),
        count: Math.max(0, (r.count || 1) - 1),
      };
    })
    .filter((r) => r.users?.length > 0 || r.count > 0);
}

export const useChatStore = create((set, get) => ({
  // Messages keyed by channelId
  messagesByChannel: {},
  // Normalized message entities (feature-flagged, maintained via subscription)
  hasMore: {},
  isLoadingMessages: false,

  // Receipts state
  deliveryReceipts: {},
  readReceipts: {},
  pendingReceipts: {},
  setMessageReceipts: (messageId, { deliveredTo, readBy, pending }) =>
    set((state) => ({
      deliveryReceipts: {
        ...state.deliveryReceipts,
        [messageId]: deliveredTo || [],
      },
      readReceipts: {
        ...state.readReceipts,
        [messageId]: readBy || [],
      },
      pendingReceipts: {
        ...state.pendingReceipts,
        [messageId]: pending || [],
      },
    })),


  highlightMessageId: null,
  setHighlightMessageId: (id) => set({ highlightMessageId: id }),
  scrollToMessageId: null,
  setScrollToMessageId: (id) => set({ scrollToMessageId: id }),

  // Global edit state — single source of truth for which message is being edited
  editingMessageId: null,
  setEditingMessageId: (id) => set({ editingMessageId: id }),
  clearEditingMessageId: () => set({ editingMessageId: null }),

  // Delete confirmation highlight — persists until modal closes
  messageIdToDelete: null,
  setMessageIdToDelete: (id) => set({ messageIdToDelete: id }),
  clearMessageIdToDelete: () => set({ messageIdToDelete: null }),

  // Single source of truth for the active "More actions" menu
  activeMessageMenuId: null,
  setActiveMessageMenuId: (id) => set({ activeMessageMenuId: id }),
  clearActiveMessageMenuId: () => set({ activeMessageMenuId: null }),

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
  threadReplyIdsByRoot: {},
  threadRepliesById: {},
  threadRootByReplyId: {},
  threadParentMessages: {}, // rootMessageId -> parent message object
  threadHasMore: {},
  isLoadingThread: false,

  // Normalized channel message entities (feature-flagged)
  messagesById: {},
  channelMessageIds: {},
  messageChannelById: {},

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

    

    return state.messagesByChannel[channelId] || [];
  },

  selectThreadReplies: (rootMessageId) => {
    if (!rootMessageId) return [];
    const state = get();

    

    return state.threadRepliesByRoot[rootMessageId] || [];
  },

  selectThreadHasMore: (rootMessageId) => {
    if (!rootMessageId) return false;
    return get().threadHasMore[rootMessageId] ?? false;
  },

  selectMessageByIdOrChannel: (messageId, channelId) => {
    if (!messageId) return null;
    const state = get();

    

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
        contentType: options.contentType || "text",
        gifMeta: options.gifMeta || null,
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
    const normalized = normalizeMessage(message);
    const channelId = normalizeChannelId(normalized.channelId);
    if (!channelId) return;

    set((state) => {
      // Never add thread replies to main chat timeline
      if (normalized.threadId) return state;
      const existing = state.messagesByChannel[channelId] || [];
      // Avoid duplicates by _id
      if (existing.some((m) => m._id === normalized._id)) return state;
      // Semantic dedup for activity messages: skip if an identical activity
      // (same eventType + taskId) already arrived within the last 60 seconds.
      // This guards against duplicate socket events caused by any future
      // regression in dual-dispatch on the FlowTask side.
      if (normalized.activityMeta?.eventType && normalized.activityMeta?.taskId) {
        const sixtySecsAgo = Date.now() - 60000;
        const isDupe = existing.some(
          (m) =>
            m.activityMeta?.eventType === normalized.activityMeta.eventType &&
            String(m.activityMeta?.taskId) === String(normalized.activityMeta.taskId) &&
            new Date(m.createdAt).getTime() >= sixtySecsAgo,
        );
        if (isDupe) return state;
      }
      const merged = [...existing, normalized].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );

      const nextState = {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: merged,
        },
      };

      if (CHAT_FEATURE_FLAGS.normalizedMessageStore && normalized._id) {
        const channelIds = state.channelMessageIds[channelId] || [];
        if (!channelIds.includes(normalized._id)) {
          nextState.messagesById = {
            ...state.messagesById,
            [normalized._id]: normalized,
          };
          nextState.channelMessageIds = {
            ...state.channelMessageIds,
            [channelId]: [...channelIds, normalized._id],
          };
        }
      }

      return nextState;
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

    const normalized = normalizeMessage(serverMessage);
    const channelId =
      normalizeChannelId(normalized.channelId) ||
      normalizeChannelId(get().messageChannelById[tempId]);
    if (!channelId) return;

    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];

      // Check if already reconciled (edge case: both HTTP response and socket ACK arrive)
      if (existing.some((m) => m._id === normalized._id)) {
        // Just remove the temp message
        const nextChannelMessages = existing.filter((m) => m._id !== tempId);

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
          ? { ...normalized, pending: false, failed: false }
          : m,
      );

      const nextState = {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: nextChannelMessages,
        },
      };

      if (CHAT_FEATURE_FLAGS.normalizedMessageStore && normalized._id) {
        nextState.messagesById = {
          ...state.messagesById,
          [normalized._id]: { ...normalized, pending: false, failed: false },
        };
        if (state.messagesById[tempId]) {
          const { [tempId]: _removed, ...rest } = nextState.messagesById;
          nextState.messagesById = rest;
        }
        const channelIds = (state.channelMessageIds[channelId] || []).map((id) =>
          id === tempId ? normalized._id : id,
        );
        nextState.channelMessageIds = {
          ...state.channelMessageIds,
          [channelId]: [...new Set(channelIds)],
        };
      }

      return nextState;
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
    const normalized = normalizeMessage(message);
    if (!normalized?._id) return;

    const channelId =
      normalizeChannelId(normalized.channelId) ||
      normalizeChannelId(get().messageChannelById[normalized._id]);
    if (!channelId) return;

    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      const index = existing.findIndex((m) => m._id === normalized._id);

      let nextChannelMessages;
      if (index === -1) {
        nextChannelMessages = [...existing, normalized].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
        );
      } else {
        nextChannelMessages = existing.map((m) =>
          m._id === normalized._id ? { ...m, ...normalized } : m,
        );
      }

      const nextState = {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: nextChannelMessages,
        },
      };

      if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
        const current = state.messagesById[normalized._id];
        nextState.messagesById = {
          ...state.messagesById,
          [normalized._id]: current ? { ...current, ...normalized } : normalized,
        };
        const channelIds = state.channelMessageIds[channelId] || [];
        if (!channelIds.includes(normalized._id)) {
          nextState.channelMessageIds = {
            ...state.channelMessageIds,
            [channelId]: [...channelIds, normalized._id],
          };
        }
      }

      return nextState;
    });
  },

  removeMessage: (messageId, channelId) => {
    set((state) => {
      const resolvedChannelId =
        channelId || state.messageChannelById[messageId];
      if (!resolvedChannelId) return state;
      const existing = state.messagesByChannel[resolvedChannelId] || [];
      const nextChannelMessages = existing.filter((m) => m._id !== messageId);

      

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

      

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [resolvedChannelId]: updatedChannelMessages,
        },
      };
    });
  },

  /**
   * Real-time handler for task deletion: soft-deletes linked task messages in local store timeline.
   */
  handleTaskDeleted: (taskId, channelId) => {
    if (!taskId) return;
    set((state) => {
      const targetChannelIds = channelId && state.messagesByChannel[channelId]
        ? [channelId]
        : Object.keys(state.messagesByChannel);

      const nextMessagesByChannel = { ...state.messagesByChannel };
      const nextMessagesById = { ...state.messagesById };
      let updatedAny = false;

      for (const chId of targetChannelIds) {
        const msgs = nextMessagesByChannel[chId] || [];
        let channelChanged = false;
        const updatedMsgs = msgs.map((m) => {
          const isLinked =
            m.flowTaskRef?.entityId === String(taskId) ||
            String(m.activityMeta?.taskId) === String(taskId);

          if (isLinked && m.activityMeta?.eventType !== 'TASK_DELETED' && !m.isDeleted) {
            channelChanged = true;
            updatedAny = true;
            const updated = {
              ...m,
              isDeleted: true,
              content: "[Message deleted]",
              htmlContent: "<p>[Message deleted]</p>",
              deletedAt: new Date().toISOString(),
            };
            if (m._id && nextMessagesById[m._id]) {
              nextMessagesById[m._id] = updated;
            }
            return updated;
          }
          return m;
        });

        if (channelChanged) {
          nextMessagesByChannel[chId] = updatedMsgs;
        }
      }

      if (!updatedAny) return state;

      return {
        messagesByChannel: nextMessagesByChannel,
        messagesById: nextMessagesById,
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

        const previousIds = state.threadReplyIdsByRoot?.[rootMessageId] || [];
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

      const nextIds = [...(state.threadReplyIdsByRoot?.[rootMessageId] || [])];
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
      const resolvedRootId = rootMessageId || state.threadRootByReplyId?.[tempId];
      if (!resolvedRootId) return state;

      const existing = state.threadRepliesByRoot?.[resolvedRootId] || [];
      if (existing.some((m) => m._id === serverReply._id)) {
        const nextReplies = existing.filter((m) => m._id !== tempId);
        const nextIds = (
          state.threadReplyIdsByRoot?.[resolvedRootId] || []
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

      const nextIds = (state.threadReplyIdsByRoot?.[resolvedRootId] || []).map(
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

      

      return {
        messagesByChannel: { ...state.messagesByChannel, [resolvedChannelId]: nextChannelMessages },
        
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
    // Optimistic: mirror the reacting viewer's own reaction into the local
  // store immediately so the pill count + user bump is instantly reflected on
  // the reacting client (no socket round-trip, no need to open the
  // reaction-details popup). The server REACTION_ADD / REACTION_REMOVE echo
  // (addReactionLocal / removeReactionLocal in socket.js) is idempotent — the
  // helpers ignore an already-present user — so the database remains the
  // single source of truth with no double count.
  addReaction: async (messageId, emoji, channelId) => {
    const user = useAuthStore.getState().user;
    if (!user?._id) return;
    const userId = String(user._id);
    // Optimistically apply locally for instant feedback.
    get().addReactionLocal(messageId, userId, emoji, channelId);
    try {
      await messageAPI.addReaction(messageId, emoji);
    } catch {
      // Roll back the optimistic update if the server rejected it.
      get().removeReactionLocal(messageId, userId, emoji, channelId);
      toast.error("Failed to add reaction");
    }
  },

  removeReaction: async (messageId, emoji, channelId) => {
    const user = useAuthStore.getState().user;
    if (!user?._id) return;
    const userId = String(user._id);
    // Optimistically remove locally for instant feedback.
    get().removeReactionLocal(messageId, userId, emoji, channelId);
    try {
      await messageAPI.removeReaction(messageId, emoji);
    } catch {
      // Roll back the optimistic removal if the server rejected it.
      get().addReactionLocal(messageId, userId, emoji, channelId);
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
        (null);
      const channelsToScan =
        hintedChannelId && newState[hintedChannelId]
          ? [hintedChannelId]
          : Object.keys(newState);
      let updatedReactions = null;
      for (const cid of channelsToScan) {
        newState[cid] = newState[cid].map((m) => {
          if (m._id !== messageId) return m;
          updatedReactions = addReactionToUser(m.reactions, userId, emoji);
          return { ...m, reactions: updatedReactions };
        });
      }
      const nextState = { messagesByChannel: newState };

      // Normalized channel/root message entity (feature-flagged) — keep its
      // reaction count in sync so counts update live in that viewer too.
      if (
        CHAT_FEATURE_FLAGS.normalizedMessageStore &&
        updatedReactions !== null &&
        state.messagesById[messageId]
      ) {
        nextState.messagesById = {
          ...state.messagesById,
          [messageId]: {
            ...state.messagesById[messageId],
            reactions: updatedReactions,
          },
        };
      }

      // Thread replies live in a separate map; keep their pills live too.
      const existingReply = state.threadRepliesById?.[messageId];
      if (existingReply) {
        const replyReactions = addReactionToUser(
          existingReply.reactions,
          userId,
          emoji,
        );
        nextState.threadRepliesById = {
          ...state.threadRepliesById,
          [messageId]: { ...existingReply, reactions: replyReactions },
        };
      }

      logSlowMutation("addReactionLocal", startedAt, {
        channelsScanned: channelsToScan.length,
        usedHint: Boolean(hintedChannelId),
      });
      return nextState;
    });
  },

    removeReactionLocal: (messageId, userId, emoji, channelId) => {
    set((state) => {
      const startedAt = nowMs();
      const newState = { ...state.messagesByChannel };
      const hintedChannelId =
        channelId ||
        (null);
      const channelsToScan =
        hintedChannelId && newState[hintedChannelId]
          ? [hintedChannelId]
          : Object.keys(newState);
      let updatedReactions = null;
      for (const cid of channelsToScan) {
        newState[cid] = newState[cid].map((m) => {
          if (m._id !== messageId) return m;
          updatedReactions = removeReactionFromUser(m.reactions, userId, emoji);
          return { ...m, reactions: updatedReactions };
        });
      }
      const nextState = { messagesByChannel: newState };

      if (
        CHAT_FEATURE_FLAGS.normalizedMessageStore &&
        updatedReactions !== null &&
        state.messagesById[messageId]
      ) {
        nextState.messagesById = {
          ...state.messagesById,
          [messageId]: {
            ...state.messagesById[messageId],
            reactions: updatedReactions,
          },
        };
      }

      // Thread replies live in a separate map; keep their pills live too.
      const existingReply = state.threadRepliesById?.[messageId];
      if (existingReply) {
        const replyReactions = removeReactionFromUser(
          existingReply.reactions,
          userId,
          emoji,
        );
        nextState.threadRepliesById = {
          ...state.threadRepliesById,
          [messageId]: { ...existingReply, reactions: replyReactions },
        };
      }

      logSlowMutation("removeReactionLocal", startedAt, {
        channelsScanned: channelsToScan.length,
        usedHint: Boolean(hintedChannelId),
      });
      return nextState;
    });
  },

  // ─── Typing ─────────────────────────────────────────────────────────
  setTyping: (channelId, userId, name) => {
    const cid = channelId != null ? String(channelId) : null;
    const uid = userId != null ? String(userId) : null;
    if (!cid || !uid) return;

    set((state) => ({
      typingByChannel: {
        ...state.typingByChannel,
        [cid]: { ...(state.typingByChannel[cid] || {}), [uid]: name },
      },
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
        typingByChannel: { ...state.typingByChannel, [cid]: typing },
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
        const targetChannelId = null;

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
          state.messagesById?.[messageId]
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
        const targetChannelId = null;

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
          state.messagesById?.[messageId]
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
        state.messagesById?.[messageId]
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
    if (!useWorkspaceStore.getState().activeWorkspaceId) return;
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

    for (const key of Object.keys(typingTimeouts)) {
      clearTimeout(typingTimeouts[key]);
      delete typingTimeouts[key];
    }

    set({
      messagesByChannel: {},
      messagesById: {},
      channelMessageIds: {},
      hasMore: {},
      pinnedMessagesByChannel: {},
      isPinnedPanelOpen: false,
      allThreads: [],
      threadRepliesByRoot: {},
      threadReplyIdsByRoot: {},
      threadRepliesById: {},
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
