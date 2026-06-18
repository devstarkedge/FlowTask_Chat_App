import { create } from 'zustand'
import { useChatStore } from './chatStore'
import { directoriesAPI } from '../services/directoriesAPI'
import logger from '../utils/logger'

export const usePresenceStore = create((set, get) => ({
  presence: {},

  syncFromChatStore: () => {
    const onlineUsers = useChatStore.getState().onlineUsers
    const current = get().presence
    const next = { ...current }
    for (const [userId, status] of onlineUsers) {
      next[userId] = status
    }
    if (onlineUsers.size > 0) {
      for (const userId of Object.keys(next)) {
        if (!onlineUsers.has(userId)) {
          next[userId] = 'offline'
        }
      }
    }
    set({ presence: next })
  },

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

  getPresence: (userId) => {
    if (!userId) return 'offline'
    return get().presence[userId] || 'offline'
  },

  isOnline: (userId) => get().presence[userId] === 'online',
  isAway: (userId) => get().presence[userId] === 'away',
  clearPresence: () => set({ presence: {} }),
}))

function setupPresenceSync() {
  let lastSize = -1
  useChatStore.subscribe((state, prevState) => {
    const currentSize = state.onlineUsers.size
    if (state.onlineUsers !== prevState.onlineUsers || currentSize !== lastSize) {
      lastSize = currentSize
      usePresenceStore.getState().syncFromChatStore()
    }
  })
}
setupPresenceSync()

export default usePresenceStore