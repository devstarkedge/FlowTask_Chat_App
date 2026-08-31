import { create } from 'zustand'
import { directoriesAPI } from '../services/directoriesAPI'

/**
 * Resolve presence for a user across multiple possible ID keys.
 * Socket events store presence under both chatUserId and flowTaskUserId,
 * so we must check all known ID variants when looking up status.
 */
function resolvePresence(presenceMap, ...ids) {
  for (const id of ids) {
    if (id && presenceMap[id]) return presenceMap[id]
  }
  return 'offline'
}

export const usePresenceStore = create((set, get) => ({
  presence: {},

  setUserPresence: (userId, status) => {
    if (!userId) return
    set((state) => ({
      presence: { ...state.presence, [userId]: status },
    }))
    directoriesAPI.invalidateCache('users')
  },

  setBatchPresence: (updates) => {
    if (!updates || Object.keys(updates).length === 0) return
    set((state) => ({
      presence: { ...state.presence, ...updates },
    }))
    directoriesAPI.invalidateCache('users')
  },

  updateFromUsers: (users) => {
    if (!Array.isArray(users)) return

    set((state) => {
      const nextPresence = { ...state.presence }
      let changed = false

      for (const user of users) {
        // Collect all possible ID keys for this user
        const ids = [
          user._id,
          user.userId,
          user.flowTaskUserId,
          user.chatUserId,
        ].filter(Boolean)

        if (ids.length === 0) continue

        const status =
          user.isOnline || user.status === 'online'
            ? 'online'
            : user.status || null

        if (!status) continue

        for (const id of ids) {
          // Only set if we don't already have socket-driven presence (socket takes precedence)
          if (nextPresence[id] === undefined) {
            nextPresence[id] = status
            changed = true
          }
        }
      }

      if (changed) {
        directoriesAPI.invalidateCache('users')
        return { presence: nextPresence }
      }
      return state
    })
  },

  /**
   * Get presence for a user, checking all known ID variants.
   * Pass additional IDs as extra arguments for robust lookup.
   */
  getPresence: (...ids) => {
    return resolvePresence(get().presence, ...ids)
  },

  isOnline: (...ids) => resolvePresence(get().presence, ...ids) === 'online',
  isAway: (...ids) => resolvePresence(get().presence, ...ids) === 'away',
  clearPresence: () => set({ presence: {} }),
}))

export default usePresenceStore
