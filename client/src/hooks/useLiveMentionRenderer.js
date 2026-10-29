import { useCallback } from 'react';
import { useUserProfileStore } from '../stores/userProfileStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

const EMPTY = {};
export function renderCurrentMentions(html, profiles = EMPTY) {
  if (!html || typeof html !== 'string') return html;
  if (!html.includes('data-mention-id') && !html.includes('data-id') && !html.includes('data-user-id') && !html.includes('mention')) {
    return html;
  }
  const container = document.createElement('template');
  container.innerHTML = html;
  let changed = false;
  container.content.querySelectorAll('[data-mention-id], [data-id], [data-user-id], [data-type="mention"], .mention[data-user-id], [data-mention-type="user"], .mention-tag').forEach((node) => {
    const id = node.getAttribute('data-id') || node.getAttribute('data-user-id') || node.getAttribute('data-mention-id');
    const dataLabel = node.getAttribute('data-label') || node.getAttribute('data-mention-label');

    if (id === 'channel' || dataLabel === 'channel') {
      node.textContent = '@channel';
      node.setAttribute('data-label', 'channel');
      changed = true;
      return;
    }
    let name = id ? profiles[id]?.name : null;
    if (!name && id) {
      try {
        const wsMembers = useWorkspaceStore?.getState?.()?.members || [];
        const m = wsMembers.find(x => String(x._id || x.userId?._id || x.userId) === String(id));
        name = m?.name || m?.userId?.name;
      } catch {}
    }
    const currentText = node.textContent?.trim() || '';
    if (name) {
      node.textContent = `@${name}`;
      node.setAttribute('data-label', name);
      changed = true;
    } else if (currentText === '@null' || currentText === '@undefined' || currentText === '@' || currentText === '') {
      const dataLabel = node.getAttribute('data-label') || node.getAttribute('data-mention-label');
      if (dataLabel && dataLabel !== 'null' && dataLabel !== 'undefined') {
        node.textContent = `@${dataLabel}`;
        changed = true;
      } else {
        node.textContent = '@User';
        changed = true;
      }
    }
  });
  return changed ? container.innerHTML : html;
}

export function useLiveMentionRenderer() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const profiles = useUserProfileStore((state) => state.profilesByWorkspace[workspaceId] || EMPTY);
  return useCallback((html) => renderCurrentMentions(html, profiles), [profiles]);
}