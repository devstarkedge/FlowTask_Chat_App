import { create } from 'zustand'
import { directoriesAPI } from '../services/directoriesAPI'
import logger from '../utils/logger'

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
        const userId = user._id || user.userId
        if (!userId) continue
        
        // Only set if we don't already have presence info (socket takes precedence)
        if (nextPresence[userId] === undefined) {
          if (user.isOnline || user.status === 'online') {
            nextPresence[userId] = 'online'
            changed = true
          } else if (user.status) {
            nextPresence[userId] = user.status
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

  getPresence: (userId) => {
    if (!userId) return 'offline'
    return get().presence[userId] || 'offline'
  },

  isOnline: (userId) => get().presence[userId] === 'online',
  isAway: (userId) => get().presence[userId] === 'away',
  clearPresence: () => set({ presence: {} }),
}))

export default usePresenceStore