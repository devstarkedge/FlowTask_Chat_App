import { useCallback } from 'react';
import { useUserProfileStore } from '../stores/userProfileStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

const EMPTY = {};
export function renderCurrentMentions(html, profiles) {
  if (!html || !html.includes('data-') || !Object.keys(profiles).length) return html;
  const container = document.createElement('template');
  container.innerHTML = html;
  let changed = false;
  container.content.querySelectorAll('[data-type="mention"][data-id], .mention[data-user-id], [data-mention-type="user"][data-mention-id]').forEach((node) => {
    const id = node.getAttribute('data-id') || node.getAttribute('data-user-id') || node.getAttribute('data-mention-id');
    const profile = profiles[id];
    if (!profile?.name) return;
    node.textContent = `@${profile.name}`;
    node.setAttribute('data-label', profile.name);
    changed = true;
  });
  return changed ? container.innerHTML : html;
}

export function useLiveMentionRenderer() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const profiles = useUserProfileStore((state) => state.profilesByWorkspace[workspaceId] || EMPTY);
  return useCallback((html) => renderCurrentMentions(html, profiles), [profiles]);
}
