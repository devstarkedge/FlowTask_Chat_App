import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const useDraftStore = create(
  persist(
    (set, get) => ({
      drafts: {},

      setDraft: (channelId, html, text) => {
        if (!channelId) return
        const trimmed = (text || '').trim()
        const trimmedHtml = (html || '').trim()
        // Don't save empty drafts
        if (!trimmed && !trimmedHtml) {
          get().clearDraft(channelId)
          return
        }
        set((state) => ({
          drafts: {
            ...state.drafts,
            [channelId]: { html: trimmedHtml, text: trimmed, timestamp: Date.now() },
          },
        }))
      },

      getDraft: (channelId) => {
        if (!channelId) return null
        const draft = get().drafts[channelId]
        if (!draft) return null
        // Expire old drafts
        if (Date.now() - draft.timestamp > DRAFT_MAX_AGE_MS) {
          get().clearDraft(channelId)
          return null
        }
        return draft
      },

      clearDraft: (channelId) => {
        set((state) => {
          const newDrafts = { ...state.drafts }
          delete newDrafts[channelId]
          return { drafts: newDrafts }
        })
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
