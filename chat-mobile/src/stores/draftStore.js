import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';

const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const getDraftKey = (channelId, workspaceId, threadId, userId) => {
  if (!channelId || !workspaceId || !userId) return null;
  const threadKey = threadId || 'root';
  return `${userId}:${workspaceId}:${channelId}:${threadKey}`;
};

function isDraftExpired(draft, now = Date.now()) {
  return !draft?.timestamp || now - draft.timestamp > DRAFT_MAX_AGE_MS;
}

function isContentEmpty(html, text, files) {
  const trimmedText = (text || '').trim();
  const trimmedHtml = (html || '').trim();
  const hasFiles = Array.isArray(files) && files.length > 0;
  return !trimmedText && !trimmedHtml && !hasFiles;
}

export function getWorkspaceDrafts(drafts, workspaceId, userId) {
  if (!workspaceId || !userId) return [];

  const prefix = `${userId}:${workspaceId}:`;
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
        !isContentEmpty(draft.html, draft.text, draft.pendingFiles)
      );
    })
    .sort((left, right) => right.timestamp - left.timestamp);
}

export function countWorkspaceDrafts(drafts, workspaceId, userId) {
  return getWorkspaceDrafts(drafts, workspaceId, userId).length;
}

export const useDraftStore = create(
  persist(
    (set, get) => ({
      drafts: {},
      draftCount: 0,

      setDraft: (channelId, html, text, workspaceId, threadId, metadata = {}) => {
        const userId = require('./authStore').useAuthStore.getState().user?._id;
        const key = getDraftKey(channelId, workspaceId, threadId, userId);
        if (!key) return;

        const trimmed = (text || '').trim();
        const trimmedHtml = (html || '').trim();
        const pendingFiles = metadata.pendingFiles || [];

        if (isContentEmpty(trimmedHtml, trimmed, pendingFiles)) {
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
              userId,
              mentions: metadata.mentions || [],
              scheduledTime: metadata.scheduledTime || null,
              pendingFiles,
            },
          };
          const count = countWorkspaceDrafts(newDrafts, workspaceId, userId);
          return { drafts: newDrafts, draftCount: count };
        });
      },

      getDraft: (channelId, workspaceId, threadId) => {
        const userId = require('./authStore').useAuthStore.getState().user?._id;
        const key = getDraftKey(channelId, workspaceId, threadId, userId);
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
        const userId = require('./authStore').useAuthStore.getState().user?._id;
        const key = getDraftKey(channelId, workspaceId, threadId, userId);
        if (!key) return;

        set((state) => {
          const newDrafts = Object.fromEntries(
            Object.entries(state.drafts).filter(
              ([draftKey]) => draftKey !== key
            )
          );
          const count = countWorkspaceDrafts(newDrafts, workspaceId, userId);
          return { drafts: newDrafts, draftCount: count };
        });
      },

      fetchDrafts: async (workspaceId) => {
        const userId = require('./authStore').useAuthStore.getState().user?._id;
        const count = countWorkspaceDrafts(get().drafts, workspaceId, userId);
        set({ draftCount: count });
      },

      clearWorkspaceDrafts: (workspaceId) => {
        const userId = require('./authStore').useAuthStore.getState().user?._id;
        const wsPrefix = `${userId}:${workspaceId}:`;
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
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ drafts: state.drafts }),
      onRehydrateStorage: () => (state) => {
        state?.cleanupExpired();
      },
    }
  )
);
