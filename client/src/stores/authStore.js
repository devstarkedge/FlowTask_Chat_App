import { create } from 'zustand'
import { authAPI } from '../services/api'
import { useChannelStore } from './channelStore'
import { connectSocket, disconnectSocket } from '../services/socket'
import { useWorkspaceStore } from './workspaceStore'

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
      set({ accessToken, refreshToken, user, isLoading: false })
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
      const { user, accessToken, refreshToken, channels } = data.data
      localStorage.setItem('chat_access_token', accessToken)
      localStorage.setItem('chat_refresh_token', refreshToken)
      set({ accessToken, refreshToken, user, isLoading: false })
      // Seed sidebar channels immediately from login payload to avoid
      // any race with subsequent /channels fetch.
      if (Array.isArray(channels) && channels.length > 0) {
        useChannelStore.setState({ channels })
      }
      await useWorkspaceStore.getState().fetchWorkspaces()
      return data
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'FlowTask login failed'
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
      console.error('Failed to update preferences:', error)
    }
  },

  clearError: () => set({ error: null }),
}))
