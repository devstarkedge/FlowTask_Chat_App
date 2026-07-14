import { useMemo } from 'react';
import { useChannelStore } from '../stores/channelStore';
import { useAuthStore } from '../stores/authStore';
import { Hash, Lock } from 'lucide-react-native';

export const useConversationDetails = (channelId) => {
  const { channels } = useChannelStore();
  const currentUser = useAuthStore(state => state.user);

  return useMemo(() => {
    // If channelId is an object (populated), extract _id, otherwise treat as string
    const id = typeof channelId === 'object' && channelId !== null ? channelId._id : channelId;
    const channel = channels.find(c => c._id === id);

    if (!channel) {
      return {
        isDM: false,
        isPrivate: false,
        displayName: typeof channelId === 'object' && channelId?.name ? channelId.name : 'Unknown',
        icon: Hash,
        dmUser: null,
      };
    }

    const isDM = channel.type === 'dm';
    const isPrivate = channel.visibility === 'private';
    let displayName = channel.name || 'Conversation';
    let dmUser = null;

    if (isDM) {
      const isSelf = channel.dmRecipientId === currentUser?._id;
      
      if (isSelf) {
        displayName = "You";
      } else if (channel.dmRecipientName) {
        displayName = channel.dmRecipientName;
      } else if (channel.name) {
        const parts = channel.name.split(',').map(p => p.trim());
        if (parts.length === 2) {
          const other = parts.find(p => p.toLowerCase() !== currentUser?.name?.toLowerCase());
          if (other) displayName = other;
        }
      }

      dmUser = {
        ...channel,
        _id: channel.dmRecipientId,
        name: displayName,
        avatar: channel.avatar,
        onlineStatus: channel.onlineStatus || "offline",
      };
    }

    const icon = isDM ? null : (isPrivate ? Lock : Hash);

    return {
      isDM,
      isPrivate,
      displayName,
      icon,
      dmUser,
      channel,
    };
  }, [channelId, channels, currentUser]);
};
