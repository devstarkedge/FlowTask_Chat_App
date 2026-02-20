import { create } from 'zustand'
import { authAPI } from '../services/api'
import { connectSocket, disconnectSocket } from '../services/socket'

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('flowtask_token') || null,
  user: null,
  isLoading: false,
  error: null,

  setToken: (token) => {
    localStorage.setItem('flowtask_token', token)
    set({ token })
  },

  syncUser: async () => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await authAPI.sync()
      set({
        user: data.data.user,
        isLoading: false,
      })
      // Connect socket after successful sync
      connectSocket()
      return data.data
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Failed to sync'
      set({ isLoading: false, error: msg })
      // If unauthorized, clear token
      if (error.response?.status === 401) {
        get().logout()
      }
      throw error
    }
  },

  login: async (token) => {
    localStorage.setItem('flowtask_token', token)
    set({ token, isLoading: true })
    try {
      const { data } = await authAPI.sync()
      set({ user: data.data.user, isLoading: false })
      connectSocket()
      return data.data
    } catch (error) {
      set({ isLoading: false, error: 'Login failed' })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('flowtask_token')
    disconnectSocket()
    set({ token: null, user: null, error: null })
  },

  updatePreferences: async (prefs) => {
    try {
      const { data } = await authAPI.updatePreferences(prefs)
      set({ user: data.data.user })
    } catch (error) {
      console.error('Failed to update preferences:', error)
    }
  },
}))
