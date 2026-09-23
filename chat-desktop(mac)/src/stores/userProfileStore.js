import { create } from 'zustand';

export const useUserProfileStore = create((set) => ({
  profilesByWorkspace: {},
  ingestProfiles: (workspaceId, data) => {
    if (!workspaceId) return;
    const users = [];
    const visit = (value) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (value.name && (value._id || value.id) && ['email', 'flowTaskUserId', 'onlineStatus', 'authProvider', 'flowTaskProfileUpdatedAt'].some((key) => key in value)) users.push(value);
      Object.values(value).forEach(visit);
    };
    visit(data);
    if (!users.length) return;
    set((state) => {
      const profiles = { ...(state.profilesByWorkspace[workspaceId] || {}) };
      for (const user of users) {
        const id = String(user._id || user.id);
        const version = user.flowTaskProfileUpdatedAt || null;
        const current = profiles[id];
        if (current?.profileUpdatedAt && (!version || new Date(version) < new Date(current.profileUpdatedAt))) continue;
        const profile = { ...user, profileUpdatedAt: version };
        profiles[id] = profile;
        if (user.chatUserId) profiles[String(user.chatUserId)] = profile;
        if (user.flowTaskUserId) profiles[String(user.flowTaskUserId)] = profile;
      }
      return { profilesByWorkspace: { ...state.profilesByWorkspace, [workspaceId]: profiles } };
    });
  },
  applyProfile: ({ workspaceId, userId, flowTaskUserId, updates, profileUpdatedAt }) => {
    if (!workspaceId || !userId || !updates?.name) return false;
    let applied = false;
    set((state) => {
      const profiles = state.profilesByWorkspace[workspaceId] || {};
      const current = profiles[userId];
      if (current?.profileUpdatedAt && (!profileUpdatedAt || new Date(profileUpdatedAt) < new Date(current.profileUpdatedAt))) return state;
      const profile = { ...updates, _id: userId, flowTaskUserId, profileUpdatedAt };
      applied = true;
      return { profilesByWorkspace: { ...state.profilesByWorkspace, [workspaceId]: {
        ...profiles, [userId]: profile, ...(flowTaskUserId ? { [flowTaskUserId]: profile } : {}),
      } } };
    });
    return applied;
  },
  clearProfiles: () => set({ profilesByWorkspace: {} }),
}));
