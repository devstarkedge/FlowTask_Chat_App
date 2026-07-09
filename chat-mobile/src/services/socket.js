import { io } from 'socket.io-client';
import { AppState } from 'react-native';
import storage from './storage';
import ENV from '../config/environment';
import logger from '../utils/logger';

// Dynamic getters to resolve require cycles
const useAuthStore = {
  get getState() { return require('../stores/authStore').useAuthStore.getState; },
  get setState() { return require('../stores/authStore').useAuthStore.setState; }
};
const useChatStore = {
  get getState() { return require('../stores/chatStore').useChatStore.getState; }
};
const useChannelStore = {
  get getState() { return require('../stores/channelStore').useChannelStore.getState; }
};
const useThreadStore = {
  get getState() { return require('../stores/threadStore').useThreadStore.getState; }
};
const useLaterStore = {
  get getState() { return require('../stores/laterStore').useLaterStore.getState; }
};
const useScheduledStore = {
  get getState() { return require('../stores/scheduledStore').useScheduledStore.getState; }
};

let socket = null;
let isConnecting = false;
let currentWorkspaceId = null;

// Use ENV (which already resolves app.json extra + .env + production fallback)
const SOCKET_URL = ENV.SOCKET_URL;

logger.info('[Socket] Active SOCKET_URL:', SOCKET_URL);

export const connectSocket = async () => {
  const token = useAuthStore.getState().accessToken;
  const workspaceId = await storage.getItem('active_workspace_id');


  if (!token || !workspaceId) {
    logger.warn('[Socket] Missing token or workspaceId, cannot connect');
    return null;
  }

  // If already connected to the same workspace, return existing socket
  if (socket?.connected && currentWorkspaceId === workspaceId) {
    return socket;
  }

  // If connecting to a different workspace, disconnect first
  if (socket && currentWorkspaceId !== workspaceId) {
    disconnectSocket();
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    return socket;
  }

  isConnecting = true;
  currentWorkspaceId = workspaceId;

  logger.info('[Socket] Creating new socket connection to:', SOCKET_URL);

  socket = io(SOCKET_URL, {
    auth: {
      token,
      workspaceId,
    },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    logger.info('[Socket] ✅ Connected to server');
    isConnecting = false;
    useChatStore.getState().setConnectionStatus('connected');
    
    // Join rooms for all channels
    const channels = useChannelStore.getState().channels;
    channels.forEach(ch => {
      socket.emit('channel:join', ch._id);
    });
  });

  socket.on('disconnect', (reason) => {
    logger.info('[Socket] ❌ Disconnected:', reason);
    isConnecting = false;
    useChatStore.getState().setConnectionStatus('disconnected');
    
    // Only clear socket reference if it was a server-initiated disconnect
    if (reason === 'io server disconnect') {
      socket = null;
      currentWorkspaceId = null;
    }
  });

  socket.on('connect_error', (error) => {
    logger.error('[Socket] Connection error:', error.message);
    isConnecting = false;
    if (error.message && (error.message.toLowerCase().includes('token') || error.message.toLowerCase().includes('auth') || error.message.toLowerCase().includes('unauthorized'))) {
      try {
        const { useAuthStore } = require('../stores/authStore');
        useAuthStore.getState().logout();
      } catch (storeError) {
        logger.error('[Socket] Failed to trigger store logout:', storeError);
      }
    }
  });

  // Message Events
  socket.on('message:create', ({ message }) => {
    const currentUserId = useAuthStore.getState().user?._id;
    if (message.authorId === currentUserId && message.tempId) return;
    // Safety: don't add thread replies to main chat
    if (message.threadId) return;

    useChatStore.getState().addMessage(message);
    useChannelStore.getState().handleNewMessage(message);
  });

  socket.on('message:ack', ({ tempId, message, rootMessageId }) => {
    if (message.threadId) {
      // Reconcile thread reply via ACK
      const resolvedRootId = rootMessageId || message.threadId;
      useChatStore.getState().reconcileMessage(tempId, message);
    } else {
      useChatStore.getState().reconcileMessage(tempId, message);
    }
  });

  socket.on('message:update', ({ message }) => {
    useChatStore.getState().updateMessage(message);
    // Also update if it's a thread reply
    if (message?.threadId) {
      useThreadStore.getState().updateThreadReply(message._id, message);
    }
  });

  socket.on('message:delete', ({ messageId, channelId, isDeleted }) => {
    if (isDeleted) {
      useChatStore.getState().softDeleteMessage(messageId, channelId);
    } else {
      useChatStore.getState().removeMessage(messageId, channelId);
    }
    // Also remove from thread replies
    useThreadStore.getState().removeThreadReply(messageId, channelId);
  });

  socket.on('message:pinned', (payload) => {
    useChatStore.getState().handleMessagePinned?.(payload);
  });

  socket.on('message:unpinned', (payload) => {
    useChatStore.getState().handleMessageUnpinned?.(payload);
  });

  socket.on('message:status', ({ messageId, messageIds, channelId, status, deliveredAt, seenAt }) => {
    useChatStore.getState().updateMessageStatus?.(channelId, messageId, messageIds, status, { deliveredAt, seenAt });
  });

  // Typing Events
  socket.on('typing:start', ({ channelId, userId, name }) => {
    useChatStore.getState().setTyping(channelId, userId, name);
  });

  socket.on('typing:stop', ({ channelId, userId }) => {
    useChatStore.getState().clearTyping(channelId, userId);
  });

  // Channel Events
  socket.on('channel:added', ({ channel }) => {
    useChannelStore.getState().addChannel(channel);
    socket.emit('channel:join', channel._id);
  });

  socket.on('channel:removed', ({ channelId }) => {
    useChannelStore.getState().removeChannel(channelId);
  });

  socket.on('channel:updated', ({ channelId, updates }) => {
    const store = useChannelStore.getState();
    const exists = store.channels.some((c) => c._id === channelId);
    if (exists) {
      store.updateChannel(channelId, updates);
    } else if (updates?.visibility !== undefined) {
      store.fetchChannels();
    }
  });

  socket.on('channel:created', ({ channel }) => {
    if (channel) {
      useChannelStore.getState().addChannel(channel);
      if (socket && channel._id) {
        socket.emit('channel:join', channel._id);
      }
    }
  });

  // Thread Events
  socket.on('thread:created', ({ thread }) => {
    useThreadStore.getState().addThread(thread);
  });

  socket.on('thread:reply', ({ message, reply, rootMessageId }) => {
    // Server may emit as `message` or `reply` — handle both
    const threadReply = message || reply;
    if (!threadReply) return;
    useThreadStore.getState().handleNewThreadReply(threadReply);
    // Also add to thread replies list if we're viewing that thread
    const resolvedRootId = rootMessageId || threadReply.threadId;
    if (resolvedRootId) {
      useThreadStore.getState().addThreadReply(resolvedRootId, threadReply);
    }
  });

  socket.on('thread:resolved', ({ threadId }) => {
    useThreadStore.getState().updateThread(threadId, { isResolved: true });
  });

  socket.on('thread:unresolved', ({ threadId }) => {
    useThreadStore.getState().updateThread(threadId, { isResolved: false });
  });

  socket.on('thread:stats_updated', ({ rootMessageId, channelId, replyCount, lastReplyAt, participants, stats }) => {
    // Server may send flat fields or a stats object — handle both
    const statsObj = stats || { replyCount, lastReplyAt, participants };
    if (rootMessageId) {
      useThreadStore.getState().updateThreadStats(rootMessageId, statsObj);
    }
  });

  // Saved Message Events (server emits savedMessage:* — NOT saved:*)
  socket.on('savedMessage:added', ({ savedMessage }) => {
    if (savedMessage) {
      useLaterStore.getState().addSavedMessage(savedMessage);
    }
  });

  socket.on('savedMessage:removed', ({ messageId }) => {
    if (messageId) {
      useLaterStore.getState().removeSavedMessage(messageId);
    }
  });

  socket.on('savedMessage:statusUpdated', ({ messageId, status }) => {
    if (messageId && status) {
      // Use local-only update to avoid API feedback loop
      useLaterStore.getState().updateSavedMessageStatus(messageId, status);
    }
  });

  // Scheduled Message Events (server emits scheduledMessage:* — NOT scheduled:*)
  socket.on('scheduledMessage:sent', (payload) => {
    const { scheduledMessageId, message } = payload;
    useScheduledStore.getState().handleScheduledSent(payload);
    // Add the sent message to chat if provided
    if (message) {
      useChatStore.getState().addMessage(message);
    }
  });

  socket.on('scheduledMessage:cancelled', (payload) => {
    useScheduledStore.getState().handleScheduledCancelled(payload);
  });

  socket.on('scheduledMessage:failed', (payload) => {
    const { scheduledMessageId, error } = payload;
    useScheduledStore.getState().handleScheduledFailed(payload);
    logger.error('[Socket] Scheduled message failed:', scheduledMessageId, error);
  });

  socket.on('scheduledMessage:deleted', (payload) => {
    useScheduledStore.getState().handleScheduledCancelled(payload);
  });

  // Reaction Events (server sends userId as string, not user object)
  socket.on('reaction:add', ({ messageId, userId, emoji, channelId }) => {
    const user = useAuthStore.getState().user;
    const reactionUser = userId === user?._id ? { _id: user._id, name: user.name } : { _id: userId };
    useChatStore.getState().addReactionLocal(messageId, emoji, reactionUser);
    useThreadStore.getState().addReactionToReply(messageId, emoji, reactionUser);
  });

  socket.on('reaction:remove', ({ messageId, userId, emoji, channelId }) => {
    useChatStore.getState().removeReactionLocal(messageId, emoji, userId);
    useThreadStore.getState().removeReactionFromReply(messageId, emoji, userId);
  });

  // Notification Events
  socket.on('notification', ({ notification }) => {
    if (!notification) return;
    const { useNotificationStore } = require('../stores/notificationStore');
    useNotificationStore.getState().addNotification(notification);

    // Show a local push notification when app is in the foreground.
    // (Background notifications are handled by the server's Expo Push service.)
    if (AppState.currentState === 'active') {
      const { showLocalNotification } = require('./pushNotificationService');
      showLocalNotification({
        title: notification.title || 'New notification',
        body: notification.body || notification.messagePreview || '',
        data: {
          channelId: notification.channelId,
          messageId: notification.sourceId || notification.messageId,
          threadId: notification.threadId,
          type: notification.conversationType || notification.type,
          notificationId: notification._id,
        },
      });
    }
  });

  socket.on('unread:updated', ({ channelId, unreadCount }) => {
    // Server sends per-channel unread count
    if (channelId != null) {
      useChannelStore.getState().updateUnread(channelId, unreadCount);
    }
    // Also refresh global unread count
    const { useNotificationStore } = require('../stores/notificationStore');
    useNotificationStore.getState().fetchUnreadCount();
  });

  // ─── Notification Sync Events (cross-device) ─────────────────────────
  socket.on('notification:read:sync', ({ notificationId, channelId, workspaceId }) => {
    try {
      const { useNotificationStore } = require('../stores/notificationStore');
      if (notificationId) {
        // Mark single notification as read locally
        useNotificationStore.getState().markAsReadLocal(notificationId);
      } else {
        // notificationId === null means "mark all as read"
        useNotificationStore.getState().markAllAsReadLocal();
      }
    } catch (err) {
      logger.error('[Socket] notification:read:sync handler error:', err.message);
    }
  });

  // Sync global unread count updates
  socket.on('notification:unread:updated', ({ unreadCount, workspaceId }) => {
    try {
      const { useNotificationStore } = require('../stores/notificationStore');
      if (unreadCount !== undefined) {
        useNotificationStore.getState().setUnreadCount(unreadCount);
      }
    } catch (err) {
      logger.error('[Socket] notification:unread:updated handler error:', err.message);
    }
  });

  // ─── Presence Events ──────────────────────────────────────────────────────
  socket.on('presence:online', ({ userId, name }) => {
    // Lightweight: could be extended with a presenceStore
  });

  socket.on('presence:offline', ({ userId }) => {
    // Lightweight: could be extended with a presenceStore
  });

  socket.on('presence:away', ({ userId }) => {
    // Lightweight: could be extended with a presenceStore
  });

  // ─── Draft Sync Events (cross-device) ──────────────────────────────────
  socket.on('draft:updated', (draftPayload) => {
    try {
      const { channelId, html, text, workspaceId: wsId, threadId } = draftPayload;
      if (channelId && wsId) {
        const { useDraftStore } = require('../stores/draftStore');
        useDraftStore.getState().setDraft(channelId, html || '', text || '', wsId, threadId || null);
      }
    } catch (err) {
      logger.error('[Socket] draft:updated handler error:', err.message);
    }
  });

  socket.on('draft:deleted', ({ channelId, workspaceId: wsId, threadId }) => {
    try {
      if (channelId && wsId) {
        const { useDraftStore } = require('../stores/draftStore');
        useDraftStore.getState().clearDraft(channelId, wsId, threadId || null);
      }
    } catch (err) {
      logger.error('[Socket] draft:deleted handler error:', err.message);
    }
  });

  // ─── Role & Profile Update Events ──────────────────────────────────────
  socket.on('user:role_updated', ({ userId, oldRole, newRole, workspaceId }) => {
    const currentUserId = useAuthStore.getState().user?._id;
    if (userId === currentUserId) {
      useAuthStore.getState().updateUserRole(newRole, workspaceId);
      const { useWorkspaceStore } = require('../stores/workspaceStore');
      useWorkspaceStore.getState().fetchWorkspaces();
      logger.info('[Socket] User role updated', { userId, oldRole, newRole, workspaceId });
    }
  });

  socket.on('workspace:member_updated', ({ userId, newRole, workspaceId }) => {
    const { useWorkspaceStore } = require('../stores/workspaceStore');
    const store = useWorkspaceStore.getState();
    if (store.activeWorkspaceId === workspaceId) {
      store.updateMemberRoleInStore(userId, newRole);
    }
    logger.info('[Socket] Workspace member role updated', { userId, newRole, workspaceId });
  });

  socket.on('user:profile_updated', ({ userId, updates, workspaceId }) => {
    const currentUserId = useAuthStore.getState().user?._id;
    if (userId === currentUserId) {
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useAuthStore.setState({
          user: { ...currentUser, ...updates }
        });
      }
    }
    const { useWorkspaceStore } = require('../stores/workspaceStore');
    useWorkspaceStore.getState().updateMemberProfile(userId, updates);
    logger.info('[Socket] User profile updated', { userId, fields: Object.keys(updates || {}) });
  });

  // ─── Canvas Events ──────────────────────────────────────────────────────────
  socket.on('canvas:title-updated', ({ canvasId, title }) => {
    try {
      const { useCanvasStore } = require('../stores/canvasStore');
      useCanvasStore.getState().handleSocketTitleUpdated({ canvasId, title });
    } catch (err) {
      logger.error('[Socket] canvas:title-updated error:', err.message);
    }
  });

  socket.on('canvas:deleted', ({ canvasId }) => {
    try {
      const { useCanvasStore } = require('../stores/canvasStore');
      useCanvasStore.getState().handleSocketDeleted({ canvasId });
    } catch (err) {
      logger.error('[Socket] canvas:deleted error:', err.message);
    }
  });

  socket.on('canvas:comment-created', (comment) => {
    try {
      const { useCanvasStore } = require('../stores/canvasStore');
      useCanvasStore.getState().handleSocketCommentCreated(comment);
    } catch (err) {
      logger.error('[Socket] canvas:comment-created error:', err.message);
    }
  });

  socket.on('canvas:comment-replied', (comment) => {
    try {
      const { useCanvasStore } = require('../stores/canvasStore');
      useCanvasStore.getState().handleSocketCommentReplied(comment);
    } catch (err) {
      logger.error('[Socket] canvas:comment-replied error:', err.message);
    }
  });

  socket.on('canvas:comment-resolved', ({ commentId }) => {
    try {
      const { useCanvasStore } = require('../stores/canvasStore');
      useCanvasStore.getState().handleSocketCommentResolved({ commentId });
    } catch (err) {
      logger.error('[Socket] canvas:comment-resolved error:', err.message);
    }
  });

  socket.on('canvas:saved-later', ({ canvasId }) => {
    try {
      const { useCanvasStore } = require('../stores/canvasStore');
      useCanvasStore.getState().handleSocketSavedLater({ canvasId });
    } catch (err) {
      logger.error('[Socket] canvas:saved-later error:', err.message);
    }
  });

  socket.on('canvas:unsaved-later', ({ canvasId }) => {
    try {
      const { useCanvasStore } = require('../stores/canvasStore');
      useCanvasStore.getState().handleSocketUnsavedLater({ canvasId });
    } catch (err) {
      logger.error('[Socket] canvas:unsaved-later error:', err.message);
    }
  });

  socket.on('canvas:presence', ({ users }) => {
    try {
      const { useCanvasStore } = require('../stores/canvasStore');
      useCanvasStore.getState().setPresence(users);
    } catch (err) {
      logger.error('[Socket] canvas:presence error:', err.message);
    }
  });

  socket.on('canvas:user-joined', ({ user }) => {
    try {
      const { useCanvasStore } = require('../stores/canvasStore');
      useCanvasStore.getState().addPresenceUser(user);
    } catch (err) {
      logger.error('[Socket] canvas:user-joined error:', err.message);
    }
  });

  socket.on('canvas:user-left', ({ userId }) => {
    try {
      const { useCanvasStore } = require('../stores/canvasStore');
      useCanvasStore.getState().removePresenceUser(userId);
    } catch (err) {
      logger.error('[Socket] canvas:user-left error:', err.message);
    }
  });

  // ─── Reconnect re-sync ──────────────────────────────────────────────────
  socket.on('reconnect', () => {
    logger.info('[Socket] Reconnected, re-syncing state...');
    useChatStore.getState().setConnectionStatus('connected');
    try {
      const channelStore = useChannelStore.getState();
      channelStore.fetchChannels().then(() => {
        const channels = useChannelStore.getState().channels;
        channels.forEach(ch => {
          socket.emit('channel:join', ch._id);
        });
        const activeChannelId = channelStore.activeChannelId;
        if (activeChannelId) {
          socket.emit('channel:join', activeChannelId);
          useChatStore.getState().fetchMessages(activeChannelId);
        }
      });
    } catch (err) {
      logger.error('[Socket] Failed to re-sync after reconnect:', err.message);
    }
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    logger.info('[Socket] Manually disconnecting socket');
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    currentWorkspaceId = null;
    isConnecting = false;
  }
};

export const emitTyping = (channelId, isTyping) => {
  if (socket?.connected) {
    socket.emit(isTyping ? 'typing:start' : 'typing:stop', { channelId });
  }
};

export const getSocket = () => socket;

export const isSocketConnected = () => socket?.connected || false;
