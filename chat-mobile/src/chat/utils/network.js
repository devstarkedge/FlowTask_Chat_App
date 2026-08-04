import { useChatStore } from '../store/syncSlice';

export const isConnected = () => {
  return useChatStore.getState().isOnline;
};
