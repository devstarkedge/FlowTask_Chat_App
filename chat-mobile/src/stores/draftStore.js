import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const getDraftKey = (channelId, workspaceId, threadId) => {
  if (!channelId || !workspaceId) return null;
  const threadKey = threadId || 'root';
  return `${workspaceId}:${channelId}:${threadKey}`;
};

function isDraftExpired(draft, now = Date.now()) {
  return !draft?.timestamp || now - draft.timestamp > DRAFT_MAX_AGE_MS;
}

function isContentEmpty(html, text) {
  const trimmedText = (text || '').trim();
  const trimmedHtml = (html || '').trim();
  return !trimmedText && !trimmedHtml;
}

export function getWorkspaceDrafts(drafts, workspaceId) {
  if (!workspaceId) return [];

  const prefix = `${workspaceId}:`;
  const now = Date.now();

  return Object.entries(drafts)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, draft]) => ({
      ...draft,
      _key: key,
    }))
    .filter((draft) => {
      return (
        draft.channelId &&
        !isDraftExpired(draft, now) &&
        !isContentEmpty(draft.html, draft.text)
      );
    })
    .sort((left, right) => right.timestamp - left.timestamp);
}

export function countWorkspaceDrafts(drafts, workspaceId) {
  return getWorkspaceDrafts(drafts, workspaceId).length;
}

export const useDraftStore = create(
  persist(
    (set, get) => ({
      drafts: {},
      draftCount: 0,

      setDraft: (channelId, html, text, workspaceId, threadId, metadata = {}) => {
        const key = getDraftKey(channelId, workspaceId, threadId);
        if (!key) return;

        const trimmed = (text || '').trim();
        const trimmedHtml = (html || '').trim();

        if (isContentEmpty(trimmedHtml, trimmed)) {
          get().clearDraft(channelId, workspaceId, threadId);
          return;
        }

        set((state) => {
          const newDrafts = {
            ...state.drafts,
            [key]: {
              html: trimmedHtml,
              text: trimmed,
              timestamp: Date.now(),
              channelId,
              threadId: threadId || null,
              workspaceId,
              mentions: metadata.mentions || [],
              scheduledTime: metadata.scheduledTime || null,
            },
          };
          const count = countWorkspaceDrafts(newDrafts, workspaceId);
          return { drafts: newDrafts, draftCount: count };
        });
      },

      getDraft: (channelId, workspaceId, threadId) => {
        const key = getDraftKey(channelId, workspaceId, threadId);
        if (!key) return null;

        const draft = get().drafts[key];
        if (!draft) return null;

        if (isDraftExpired(draft)) {
          get().clearDraft(channelId, workspaceId, threadId);
          return null;
        }

        return draft;
      },

      clearDraft: (channelId, workspaceId, threadId) => {
        const key = getDraftKey(channelId, workspaceId, threadId);
        if (!key) return;

        set((state) => {
          const newDrafts = Object.fromEntries(
            Object.entries(state.drafts).filter(
              ([draftKey]) => draftKey !== key
            )
          );
          const count = countWorkspaceDrafts(newDrafts, workspaceId);
          return { drafts: newDrafts, draftCount: count };
        });
      },

      fetchDrafts: async (workspaceId) => {
        const count = countWorkspaceDrafts(get().drafts, workspaceId);
        set({ draftCount: count });
      },

      clearWorkspaceDrafts: (workspaceId) => {
        const wsPrefix = `${workspaceId}:`;
        set((state) => ({
          drafts: Object.fromEntries(
            Object.entries(state.drafts).filter(
              ([key]) => !key.startsWith(wsPrefix)
            )
          ),
          draftCount: 0,
        }));
      },

      clearAllDrafts: () => {
        set({ drafts: {}, draftCount: 0 });
      },

      cleanupExpired: () => {
        const now = Date.now();
        set((state) => ({
          drafts: Object.fromEntries(
            Object.entries(state.drafts).filter(
              ([, draft]) => !isDraftExpired(draft, now)
            )
          ),
        }));
      },
    }),
    {
      name: 'flowtask-drafts-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ drafts: state.drafts }),
      onRehydrateStorage: () => (state) => {
        state?.cleanupExpired();
      },
    }
  )
);
