import { io } from 'socket.io-client';
import { AppState } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useChannelStore } from '../stores/channelStore';
import { useThreadStore } from '../stores/threadStore';
import { useLaterStore } from '../stores/laterStore';
import { useScheduledStore } from '../stores/scheduledStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ENV from '../config/environment';

let socket = null;
let isConnecting = false;
let currentWorkspaceId = null;

// Use ENV (which already resolves app.json extra + .env + production fallback)
const SOCKET_URL = ENV.SOCKET_URL;

console.log('[Socket] Active SOCKET_URL:', SOCKET_URL);

export const connectSocket = async () => {
  const token = useAuthStore.getState().accessToken;
  const workspaceId = await AsyncStorage.getItem('active_workspace_id');


  if (!token || !workspaceId) {
    console.warn('[Socket] Missing token or workspaceId, cannot connect');
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

  console.log('[Socket] Creating new socket connection to:', SOCKET_URL);

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
    console.log('[Socket] ✅ Connected to server');
    isConnecting = false;
    useChatStore.getState().setConnectionStatus('connected');
    
    // Join rooms for all channels
    const channels = useChannelStore.getState().channels;
    channels.forEach(ch => {
      socket.emit('channel:join', ch._id);
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] ❌ Disconnected:', reason);
    isConnecting = false;
    useChatStore.getState().setConnectionStatus('disconnected');
    
    // Only clear socket reference if it was a server-initiated disconnect
    if (reason === 'io server disconnect') {
      socket = null;
      currentWorkspaceId = null;
    }
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
    isConnecting = false;
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
  });

  socket.on('message:delete', ({ messageId, channelId, isDeleted }) => {
    if (isDeleted) {
      useChatStore.getState().softDeleteMessage(messageId, channelId);
    } else {
      useChatStore.getState().removeMessage(messageId, channelId);
    }
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
    useChannelStore.getState().updateChannel(channelId, updates);
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
    console.error('[Socket] Scheduled message failed:', scheduledMessageId, error);
  });

  socket.on('scheduledMessage:deleted', (payload) => {
    useScheduledStore.getState().handleScheduledCancelled(payload);
  });

  // Reaction Events (server sends userId as string, not user object)
  socket.on('reaction:add', ({ messageId, userId, emoji, channelId }) => {
    const user = useAuthStore.getState().user;
    // Build a user-like object from userId for local store
    const reactionUser = userId === user?._id ? { _id: user._id, name: user.name } : { _id: userId };
    useChatStore.getState().addReactionLocal(messageId, emoji, reactionUser);
  });

  socket.on('reaction:remove', ({ messageId, userId, emoji, channelId }) => {
    useChatStore.getState().removeReactionLocal(messageId, emoji, userId);
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
      console.error('[Socket] draft:updated handler error:', err.message);
    }
  });

  socket.on('draft:deleted', ({ channelId, workspaceId: wsId, threadId }) => {
    try {
      if (channelId && wsId) {
        const { useDraftStore } = require('../stores/draftStore');
        useDraftStore.getState().clearDraft(channelId, wsId, threadId || null);
      }
    } catch (err) {
      console.error('[Socket] draft:deleted handler error:', err.message);
    }
  });

  // ─── Reconnect re-sync ──────────────────────────────────────────────────
  socket.on('reconnect', () => {
    console.log('[Socket] Reconnected, re-syncing state...');
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
      console.error('[Socket] Failed to re-sync after reconnect:', err.message);
    }
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    console.log('[Socket] Manually disconnecting socket');
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
