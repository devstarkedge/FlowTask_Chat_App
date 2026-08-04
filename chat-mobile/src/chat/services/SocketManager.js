import { io } from 'socket.io-client';
import ENV from '../../config/environment';
import { useChatStore } from '../store';
import logger from '../../utils/logger';

// Dynamic getters to resolve require cycles if any
const getAuthToken = () => {
  try {
    return require('../../stores/authStore').useAuthStore.getState().accessToken;
  } catch (err) {
    return null;
  }
};

class SocketManager {
  constructor() {
    this.socket = null;
    this.listenersRegistered = false;
  }

  getSocket() {
    return this.socket;
  }

  async connect() {
    const token = getAuthToken();
    if (!token) {
      logger.warn('[SocketManager] No auth token, cannot connect');
      return null;
    }

    if (this.socket?.connected) return this.socket;

    logger.info('[SocketManager] Initializing socket connection');
    this.socket = io(ENV.SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.registerEventDispatcher();
    return this.socket;
  }

  registerEventDispatcher() {
    if (this.listenersRegistered || !this.socket) return;
    this.listenersRegistered = true;

    // Load event modules dynamically
    const ConnectionEvents = require('../socket/ConnectionEvents').default;
    const MessageEvents = require('../socket/MessageEvents').default;
    const ReceiptEvents = require('../socket/ReceiptEvents').default;
    const PresenceEvents = require('../socket/PresenceEvents').default;

    ConnectionEvents(this.socket);
    MessageEvents(this.socket);
    ReceiptEvents(this.socket);
    PresenceEvents(this.socket);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listenersRegistered = false;
    }
  }
}

const instance = new SocketManager();
export default instance;
export const getSocket = () => instance.getSocket();
