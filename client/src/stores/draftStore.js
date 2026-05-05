import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isContentEmpty } from '../utils/draftUtils'

const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const getDraftKey = (channelId, workspaceId, threadId) => {
  if (!channelId || !workspaceId) return null
  const threadKey = threadId || 'root'
  return `${workspaceId}:${channelId}:${threadKey}`
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function isDraftExpired(draft, now = Date.now()) {
  return !draft?.timestamp || now - draft.timestamp > DRAFT_MAX_AGE_MS
}

export function getWorkspaceDrafts(drafts, workspaceId) {
  if (!workspaceId) return []

  const prefix = `${workspaceId}:`
  const now = Date.now()

  return Object.entries(drafts)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, draft]) => ({
      ...draft,
      _key: key,
    }))
    .filter(
      (draft) =>
        draft.channelId &&
        !isDraftExpired(draft, now) &&
        !isContentEmpty(draft.html, draft.text),
    )
    .sort((left, right) => right.timestamp - left.timestamp)
}

export function countWorkspaceDrafts(drafts, workspaceId) {
  return getWorkspaceDrafts(drafts, workspaceId).length
}

export const useDraftStore = create(
  persist(
    (set, get) => ({
      drafts: {},

      setDraft: (channelId, html, text, workspaceId, threadId, metadata = {}) => {
        const key = getDraftKey(channelId, workspaceId, threadId)
        if (!key) return

        const trimmed = (text || '').trim()
        const trimmedHtml = (html || '').trim()

        if (isContentEmpty(trimmedHtml, trimmed)) {
          get().clearDraft(channelId, workspaceId, threadId)
          return
        }

        set((state) => ({
          drafts: {
            ...state.drafts,
            [key]: {
              html: trimmedHtml,
              text: trimmed,
              timestamp: Date.now(),
              channelId,
              threadId: threadId || null,
              workspaceId,
              mentions: normalizeArray(metadata.mentions),
              attachments: normalizeArray(metadata.attachments),
              fileReferences: normalizeArray(metadata.fileReferences),
            },
          },
        }))
      },

      getDraft: (channelId, workspaceId, threadId) => {
        const key = getDraftKey(channelId, workspaceId, threadId)
        if (!key) return null

        const draft = get().drafts[key]
        if (!draft) return null

        if (isDraftExpired(draft)) {
          get().clearDraft(channelId, workspaceId, threadId)
          return null
        }

        return draft
      },

      clearDraft: (channelId, workspaceId, threadId) => {
        const key = getDraftKey(channelId, workspaceId, threadId)
        if (!key) return

        set((state) => ({
          drafts: Object.fromEntries(
            Object.entries(state.drafts).filter(([draftKey]) => draftKey !== key),
          ),
        }))
      },

      getLocalDraftCount: (workspaceId) => {
        return countWorkspaceDrafts(get().drafts, workspaceId)
      },

      clearWorkspaceDrafts: (workspaceId) => {
        const wsPrefix = `${workspaceId}:`
        set((state) => ({
          drafts: Object.fromEntries(
            Object.entries(state.drafts).filter(([key]) => !key.startsWith(wsPrefix)),
          ),
        }))
      },

      clearAllDrafts: () => {
        set({ drafts: {} })
      },

      cleanupExpired: () => {
        const now = Date.now()
        set((state) => ({
          drafts: Object.fromEntries(
            Object.entries(state.drafts).filter(([, draft]) => !isDraftExpired(draft, now)),
          ),
        }))
      },
    }),
    {
      name: 'flowtask-chat-drafts',
      version: 3,
      partialize: (state) => ({ drafts: state.drafts }),
      onRehydrateStorage: () => (state) => {
        state?.cleanupExpired()
      },
      migrate: (persisted, version) => {
        const oldDrafts = persisted?.drafts || {}
        const migratedDrafts = {}

        for (const [key, value] of Object.entries(oldDrafts)) {
          const parts = key.split(':')
          const nextKey = parts.length === 2 ? `${key}:root` : key

          migratedDrafts[nextKey] = {
            ...value,
            threadId: value?.threadId || null,
            mentions: normalizeArray(value?.mentions),
            attachments: normalizeArray(value?.attachments),
            fileReferences: normalizeArray(value?.fileReferences),
          }
        }

        if (version < 3) {
          return { drafts: migratedDrafts }
        }

        return { ...persisted, drafts: migratedDrafts }
      },
    },
  ),
)
