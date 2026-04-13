import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isContentEmpty } from '../utils/draftUtils'

const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const getDraftKey = (channelId, workspaceId, threadId) => {
  if (!channelId || !workspaceId) return null
  const threadKey = threadId || 'root'
  return `${workspaceId}:${channelId}:${threadKey}`
}

export const useDraftStore = create(
  persist(
    (set, get) => ({
      drafts: {},
      serverDrafts: {}, // Server-synced drafts: keyed same as drafts
      draftCounts: {}, // { [workspaceId]: number }
      allDraftsForSidebar: [], // Full draft objects for sidebar display
      draftListStale: false, // Flag to trigger refetch in DraftsSidebar

      setDraft: (channelId, html, text, workspaceId, threadId) => {
        const key = getDraftKey(channelId, workspaceId, threadId)
        if (!key) return
        const trimmed = (text || '').trim()
        const trimmedHtml = (html || '').trim()
        // Don't save empty drafts — detect TipTap empty HTML like <p></p>
        if (isContentEmpty(trimmedHtml, trimmed)) {
          get().clearDraft(channelId, workspaceId, threadId)
          return
        }
        set((state) => ({
          drafts: {
            ...state.drafts,
            [key]: { html: trimmedHtml, text: trimmed, timestamp: Date.now(), channelId, threadId, workspaceId },
          },
        }))
      },

      getDraft: (channelId, workspaceId, threadId) => {
        const key = getDraftKey(channelId, workspaceId, threadId)
        if (!key) return null
        const draft = get().drafts[key]
        if (!draft) return null
        // Expire old drafts
        if (Date.now() - draft.timestamp > DRAFT_MAX_AGE_MS) {
          get().clearDraft(channelId, workspaceId, threadId)
          return null
        }
        return draft
      },

      clearDraft: (channelId, workspaceId, threadId) => {
      const thread = threadId || 'root'

      set((state) => {
        const newDrafts = { ...state.drafts }

        //  remove workspace draft
        const workspaceKey = `${workspaceId}:${channelId}:${thread}`
        delete newDrafts[workspaceKey]

        //  remove global draft (MANUAL — no helper)
        const globalKey = `global:${channelId}:${thread}`
        delete newDrafts[globalKey]

        return { drafts: newDrafts }
      })
    },
      // Set server-synced draft data (from API response)
      setServerDraft: (draft) => {
        if (!draft) return
        const key = getDraftKey(draft.channelId, draft.workspaceId, draft.threadId)
        if (!key) return
        // Skip phantom drafts with empty content (e.g. <p></p> from TipTap)
        if (isContentEmpty(draft.htmlContent, draft.content)) {
          get().removeServerDraft(draft.channelId, draft.threadId, draft.workspaceId)
          return
        }
        set((state) => ({
          serverDrafts: {
            ...state.serverDrafts,
            [key]: draft,
          },
          // Also update local draft for immediate availability
          drafts: {
            ...state.drafts,
            [key]: {
              html: draft.htmlContent || '',
              text: draft.content || '',
              timestamp: new Date(draft.updatedAt).getTime(),
              channelId: draft.channelId,
              threadId: draft.threadId,
              workspaceId: draft.workspaceId,
              serverId: draft._id,
              attachments: draft.attachments,
              mentions: draft.mentions,
            },
          },
          draftListStale: true,
        }))
      },

      // Remove server draft (on send or delete via socket)
      removeServerDraft: (channelId, threadId, workspaceId) => {
        const key = getDraftKey(channelId, workspaceId, threadId)
        if (!key) return
        set((state) => {
          const newServerDrafts = { ...state.serverDrafts }
          const newDrafts = { ...state.drafts }
          delete newServerDrafts[key]
          delete newDrafts[key]
          return { serverDrafts: newServerDrafts, drafts: newDrafts }
        })
      },

      // Set sidebar drafts list from API
      setSidebarDrafts: (drafts, count) => {
        set({ allDraftsForSidebar: drafts || [], draftCounts: { ...get().draftCounts, _current: count }, draftListStale: false })
      },

      // Mark draft list as stale (triggers refetch in DraftsSidebar)
      markDraftListStale: () => set({ draftListStale: true }),
      clearDraftListStale: () => set({ draftListStale: false }),

      // Update draft count for a workspace
      setDraftCount: (workspaceId, count) => {
        set((state) => ({
          draftCounts: { ...state.draftCounts, [workspaceId]: count },
        }))
      },

      // Get count of local drafts as fallback
      getLocalDraftCount: (workspaceId) => {
        const prefix = `${workspaceId}:`
        return Object.keys(get().drafts).filter((k) => k.startsWith(prefix)).length
      },

      clearWorkspaceDrafts: (workspaceId) => {
        const wsPrefix = `${workspaceId}:`
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
        set({ drafts: {}, serverDrafts: {}, allDraftsForSidebar: [] })
      },

      // Reset only sidebar/server state — preserves local drafts across workspace switches
      resetSidebarState: () => set({
        serverDrafts: {},
        allDraftsForSidebar: [],
        draftListStale: true,
      }),

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
      version: 2,
      partialize: (state) => ({ drafts: state.drafts }),
      onRehydrateStorage: () => (state) => {
        state?.cleanupExpired()
      },
      migrate: (persisted, version) => {
        if (version < 2) {
          // v1 → v2: drafts keyed by ws:channel now ws:channel:root
          const oldDrafts = persisted?.drafts || {}
          const newDrafts = {}
          for (const [key, val] of Object.entries(oldDrafts)) {
            const parts = key.split(':')
            if (parts.length === 2) {
              newDrafts[`${key}:root`] = val
            } else {
              newDrafts[key] = val
            }
          }
          return { ...persisted, drafts: newDrafts }
        }
        return persisted
      },
    }
  )
)
