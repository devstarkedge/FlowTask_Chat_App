import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const getDraftKey = (channelId, workspaceId) => {
  if (!channelId) return null
  const wsKey = workspaceId || 'global'
  return `${wsKey}:${channelId}`
}

export const useDraftStore = create(
  persist(
    (set, get) => ({
      drafts: {},

      setDraft: (channelId, html, text, workspaceId) => {
        const key = getDraftKey(channelId, workspaceId)
        if (!key) return
        const trimmed = (text || '').trim()
        const trimmedHtml = (html || '').trim()
        // Don't save empty drafts
        if (!trimmed && !trimmedHtml) {
          get().clearDraft(channelId, workspaceId)
          return
        }
        set((state) => ({
          drafts: {
            ...state.drafts,
            [key]: { html: trimmedHtml, text: trimmed, timestamp: Date.now() },
          },
        }))
      },

      getDraft: (channelId, workspaceId) => {
        const key = getDraftKey(channelId, workspaceId)
        if (!key) return null
        const draft = get().drafts[key]
        if (!draft) return null
        // Expire old drafts
        if (Date.now() - draft.timestamp > DRAFT_MAX_AGE_MS) {
          get().clearDraft(channelId, workspaceId)
          return null
        }
        return draft
      },

      clearDraft: (channelId, workspaceId) => {
        const key = getDraftKey(channelId, workspaceId)
        if (!key) return
        set((state) => {
          const newDrafts = { ...state.drafts }
          delete newDrafts[key]
          return { drafts: newDrafts }
        })
      },

      clearWorkspaceDrafts: (workspaceId) => {
        const wsPrefix = `${workspaceId || 'global'}:`
        set((state) => {
          const newDrafts = {}
          for (const [key, draft] of Object.entries(state.drafts)) {
            if (!key.startsWith(wsPrefix)) {
              newDrafts[key] = draft
            }
          }
          return { drafts: newDrafts }
        })
      },

      clearAllDrafts: () => {
        set({ drafts: {} })
      },

      // Cleanup old drafts on store init
      cleanupExpired: () => {
        const now = Date.now()
        set((state) => {
          const newDrafts = {}
          for (const [id, draft] of Object.entries(state.drafts)) {
            if (now - draft.timestamp < DRAFT_MAX_AGE_MS) {
              newDrafts[id] = draft
            }
          }
          return { drafts: newDrafts }
        })
      },
    }),
    {
      name: 'flowtask-chat-drafts',
      version: 1,
      onRehydrateStorage: () => (state) => {
        state?.cleanupExpired()
      },
    }
  )
)
