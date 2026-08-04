import { useChatStore } from '../store';
import MessageStatusService from '../services/MessageStatusService';

export const useMessageStatus = (messageId) => {
  const status = useChatStore((state) => state.messageStatus[messageId] || 'sent');

  const markAsRead = async (channelId) => {
    await MessageStatusService.markAsRead(channelId, messageId);
  };

  return {
    status,
    markAsRead,
  };
};
export default useMessageStatus;
