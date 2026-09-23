import { useMemo } from 'react';
import { useUserProfileStore } from '../stores/userProfileStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { projectUserProfiles } from '../utils/userProfiles';

const EMPTY_PROFILES = {};
export function useLiveProfileData(value) {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const profiles = useUserProfileStore((state) => state.profilesByWorkspace[workspaceId] || EMPTY_PROFILES);
  return useMemo(() => projectUserProfiles(value, profiles), [value, profiles]);
}
