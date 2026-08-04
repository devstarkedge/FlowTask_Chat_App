import { useChatStore } from '../store';

export const useConnectivity = () => {
  const isOnline = useChatStore((state) => state.isOnline);
  const connectionStatus = useChatStore((state) => state.connectionStatus);

  return {
    isOnline,
    connectionStatus,
  };
};
export default useConnectivity;
