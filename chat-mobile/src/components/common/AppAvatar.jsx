import React from 'react';
import BaseAvatar from '../Avatar';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAuthStore } from '../../stores/authStore';

/**
 * AppAvatar
 * Thin wrapper around the legacy `Avatar` component to provide a
 * centralized import path going forward (src/components/common).
 * It dynamically subscribes to live onlineStatus from workspaceStore.
 */
const AppAvatar = (props) => {
  const { user, member } = props;
  const rawTargetId = user?._id || member?._id || user?.userId || member?.userId;
  const targetId = typeof rawTargetId === 'object' ? rawTargetId?._id || rawTargetId?.id : rawTargetId;
  const targetIdStr = targetId?.toString ? targetId.toString() : targetId;
  const currentProfile = useAuthStore(s => s.user?._id === targetIdStr ? s.user : null);
  
  // Only re-render if THIS specific user's status changes
  const liveOnlineStatus = useWorkspaceStore((s) => s.presenceMap?.[targetIdStr]);
  
  // Single source of truth is now liveOnlineStatus (populated by sockets & API interceptor).
  // Fall back to prop only if completely unknown.
  const finalStatus = liveOnlineStatus || user?.onlineStatus || member?.onlineStatus || 'offline';
  
  const injectedProps = { ...props };
  if (user) injectedProps.user = { ...user, ...(currentProfile || {}), onlineStatus: finalStatus };
  else if (member) injectedProps.member = { ...member, ...(currentProfile || {}), onlineStatus: finalStatus };
  else injectedProps.user = { onlineStatus: finalStatus };

  return <BaseAvatar {...injectedProps} />;
};

export default AppAvatar;
