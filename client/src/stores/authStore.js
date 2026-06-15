import { create } from 'zustand'
import { authAPI, userAPI } from '../services/api'
import { useChannelStore } from './channelStore'
import { connectSocket, disconnectSocket, emitPresenceUpdate } from '../services/socket'
import { useWorkspaceStore } from './workspaceStore'
import logger from '../utils/logger'

const FLOWTASK_ENABLED = import.meta.env.VITE_FLOWTASK_ENABLED !== 'false'

export const useAuthStore = create((set, get) => ({
  accessToken: localStorage.getItem('chat_access_token') || null,
  refreshToken: localStorage.getItem('chat_refresh_token') || null,
  user: null,
  isLoading: false,
  isInitialized: !localStorage.getItem('chat_access_token'),
  error: null,
  flowtaskEnabled: FLOWTASK_ENABLED,

  // ─── Token management ─────────────────────────────────────────────
  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem('chat_access_token', accessToken)
    if (refreshToken) localStorage.setItem('chat_refresh_token', refreshToken)
    set({ accessToken, refreshToken: refreshToken || get().refreshToken })
  },

  // Alias for backward compat — used by api interceptor
  get token() {
    return get().accessToken
  },

  // ─── Native Registration ──────────────────────────────────────────
  register: async ({ name, email, password }) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await authAPI.register({ name, email, password })
      set({ isLoading: false })
      return data
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Registration failed'
      set({ isLoading: false, error: msg })
      throw error
    }
  },

  // ─── Native Login ─────────────────────────────────────────────────
  loginNative: async ({ email, password }) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await authAPI.login({ email, password })
      const { user, accessToken, refreshToken } = data.data
      localStorage.setItem('chat_access_token', accessToken)
      localStorage.setItem('chat_refresh_token', refreshToken)
      set({ accessToken, refreshToken, user, isLoading: false, isInitialized: true })
      // Fetch workspaces for workspace selector; socket connects when workspace is selected
      await useWorkspaceStore.getState().fetchWorkspaces()
      return data
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Login failed'
      set({ isLoading: false, error: msg })
      throw error
    }
  },

  // ─── FlowTask SSO Login ──────────────────────────────────────────
  loginFlowTask: async (token) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await authAPI.loginFlowTask(token)
      const { user, accessToken, refreshToken, channels, flowTaskToken } = data.data
      localStorage.setItem('chat_access_token', accessToken)
      localStorage.setItem('chat_refresh_token', refreshToken)
      if (flowTaskToken) localStorage.setItem('flowtask_token', flowTaskToken)
      set({ accessToken, refreshToken, user, isLoading: false, isInitialized: true })
      // Seed sidebar channels immediately from login payload to avoid
      // any race with subsequent /channels fetch.
      if (Array.isArray(channels) && channels.length > 0) {
        useChannelStore.setState({ channels })
      }
      await useWorkspaceStore.getState().fetchWorkspaces()
      return data
    } catch (error) {
      const status = error.response?.status
      const serverMsg = error.response?.data?.error?.message
      let msg = serverMsg || 'FlowTask login failed'
      if (!serverMsg && status) {
        msg = `FlowTask login failed (HTTP ${status})`
      }
      if (!error.response) {
        msg = 'FlowTask login failed — could not reach the server. Check your network or backend URL.'
      }
      set({ isLoading: false, error: msg })
      throw error
    }
  },

  // ─── Fetch Current User ───────────────────────────────────────────
  fetchUser: async () => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await authAPI.me()
      set({ user: data.data.user || data.data, isLoading: false, isInitialized: true })
      await useWorkspaceStore.getState().fetchWorkspaces()
      // Socket connects when workspace is selected via WorkspaceLayout
      return data.data.user || data.data
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Failed to fetch user'
      set({ isLoading: false, error: msg, isInitialized: true })
      // Don't call logout() here — the API 401 interceptor handles token refresh
      // and calls logout only when refresh fails. Calling it here would be premature.
      throw error
    }
  },

  // ─── Logout ───────────────────────────────────────────────────────
  setPresence: async (status) => {
    try {
      // Optimistic update
      set((state) => ({ user: { ...state.user, onlineStatus: status } }))

      await userAPI.setPresence(status)
      emitPresenceUpdate(status)
    } catch (error) {
      console.error('Failed to update presence:', error)
      // fetchUser to revert optimistic update
      get().fetchUser()
    }
  },

  logout: () => {
    const refreshToken = get().refreshToken
    // Fire-and-forget server logout
    if (refreshToken) {
      authAPI.logout(refreshToken).catch(() => {})
    }
    localStorage.removeItem('chat_access_token')
    localStorage.removeItem('chat_refresh_token')
    // Also clear legacy token if exists
    localStorage.removeItem('flowtask_token')
    disconnectSocket()
    useWorkspaceStore.getState().clearWorkspaceState()
    set({ accessToken: null, refreshToken: null, user: null, error: null, isInitialized: true })
  },

  // ─── Password Reset ──────────────────────────────────────────────
  forgotPassword: async (email) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await authAPI.forgotPassword(email)
      set({ isLoading: false })
      return data
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Request failed'
      set({ isLoading: false, error: msg })
      throw error
    }
  },

  resetPassword: async ({ token, newPassword }) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await authAPI.resetPassword({ token, newPassword })
      set({ isLoading: false })
      return data
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Reset failed'
      set({ isLoading: false, error: msg })
      throw error
    }
  },

  // ─── Preferences ─────────────────────────────────────────────────
  updatePreferences: async (prefs) => {
    try {
      const { data } = await authAPI.updatePreferences(prefs)
      set({ user: data.data.user })
    } catch (error) {
      logger.error('Failed to update preferences:', error)
    }
  },

  // ─── Role Update ───────────────────────────────────────────────────
  updateUserRole: (newRole, workspaceId) => {
    set((state) => {
      if (!state.user) return state
      
      // Update user object with new role
      const updatedUser = { ...state.user, role: newRole }
      
      logger.info('[AuthStore] User role updated', { 
        userId: state.user._id, 
        newRole, 
        workspaceId 
      })
      
      return { user: updatedUser }
    })
  },

  clearError: () => set({ error: null }),
}))
