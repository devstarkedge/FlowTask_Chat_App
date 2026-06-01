import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useChannelStore } from '../stores/channelStore';
import { useThreadStore } from '../stores/threadStore';
import { useLaterStore } from '../stores/laterStore';
import { useScheduledStore } from '../stores/scheduledStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

let socket = null;
let isConnecting = false;
let currentWorkspaceId = null;

const SOCKET_URL = Constants.expoConfig?.extra?.socketUrl || 'http://172.16.16.33:3200';

console.log('[Socket] Module initialized with URL:', SOCKET_URL);

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

  console.log('[Socket] Creating new socket connection');

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

    useChatStore.getState().addMessage(message);
    useChannelStore.getState().handleNewMessage(message);
  });

  socket.on('message:ack', ({ tempId, message }) => {
    useChatStore.getState().reconcileMessage(tempId, message);
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

  // Thread Events
  socket.on('thread:created', ({ thread }) => {
    useThreadStore.getState().addThread(thread);
  });

  socket.on('thread:reply', ({ reply }) => {
    useThreadStore.getState().handleNewThreadReply(reply);
  });

  socket.on('thread:resolved', ({ threadId }) => {
    useThreadStore.getState().updateThread(threadId, { isResolved: true });
  });

  socket.on('thread:unresolved', ({ threadId }) => {
    useThreadStore.getState().updateThread(threadId, { isResolved: false });
  });

  // Saved Message Events
  socket.on('saved:added', ({ savedMessage }) => {
    useLaterStore.getState().addSavedMessage(savedMessage);
  });

  socket.on('saved:removed', ({ messageId }) => {
    useLaterStore.getState().removeSavedMessage(messageId);
  });

  socket.on('saved:status_updated', ({ messageId, status }) => {
    useLaterStore.getState().updateSavedMessageStatus(messageId, status);
  });

  // Scheduled Message Events
  socket.on('scheduled:created', ({ scheduledMessage }) => {
    useScheduledStore.getState().addScheduledMessage(scheduledMessage);
  });

  socket.on('scheduled:sent', ({ scheduledMessageId }) => {
    useScheduledStore.getState().handleScheduledSent({ scheduledMessageId });
  });

  socket.on('scheduled:cancelled', ({ scheduledMessageId }) => {
    useScheduledStore.getState().handleScheduledCancelled({ scheduledMessageId });
  });

  socket.on('scheduled:failed', ({ scheduledMessageId, error }) => {
    useScheduledStore.getState().handleScheduledFailed({ scheduledMessageId, error });
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
