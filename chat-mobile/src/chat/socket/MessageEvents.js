import { useChatStore } from '../store';
import { useAuthStore } from '../../stores/authStore';
import logger from '../../utils/logger';

export default (socket) => {
  socket.on('message:create', ({ message }) => {
    logger.info('[SocketMessage] message:create received', message._id);
    useChatStore.getState().addMessage(message);

    // Emit delivery receipt if the message was not sent by the current user
    const currentUser = useAuthStore.getState().user;
    const authorId = typeof message.authorId === 'object' ? message.authorId?._id : message.authorId;
    if (currentUser && authorId !== currentUser._id) {
      socket.emit('message:delivered', { messageId: message._id, channelId: message.channelId });
    }
  });

  socket.on('message:ack', ({ tempId, message }) => {
    logger.info('[SocketMessage] message:ack received', tempId);
    useChatStore.getState().reconcileMessage(tempId, message);
  });

  socket.on('message:update', ({ message }) => {
    logger.info('[SocketMessage] message:update received', message._id);
    useChatStore.getState().updateMessage(message);
  });

  socket.on('message:delete', ({ messageId, channelId, isDeleted }) => {
    logger.info('[SocketMessage] message:delete received', messageId);
    if (isDeleted) {
      useChatStore.getState().softDeleteMessage(messageId, channelId);
    } else {
      useChatStore.getState().removeMessage(messageId, channelId);
    }
  });
};
