import { create } from 'zustand'
import { authAPI, userAPI } from '../services/api'
import { useChannelStore } from './channelStore'
import { connectSocket, disconnectSocket, emitPresenceUpdate } from '../services/socket'
import { useWorkspaceStore } from './workspaceStore'
import logger from '../utils/logger'

const FLOWTASK_ENABLED = import.meta.env.VITE_FLOWTASK_ENABLED !== 'false'
let flowTaskLoginInFlight = null

function createAuthAttemptId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `flowtask-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getSavedUser() {
  try {
    const raw = localStorage.getItem('chat_user')
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

function saveUser(user) {
  try {
    if (user) {
      localStorage.setItem('chat_user', JSON.stringify(user))
    } else {
      localStorage.removeItem('chat_user')
    }
  } catch (e) {}
}

const hasNativeAuthCache = () => typeof window !== 'undefined' && Boolean(window.electronAPI?.readAuthSession)

function readLegacySession() {
  try {
    return {
      accessToken: localStorage.getItem('chat_access_token'),
      refreshToken: localStorage.getItem('chat_refresh_token'),
      flowTaskToken: localStorage.getItem('flowtask_token'),
      user: getSavedUser(),
    }
  } catch (e) {
    return { accessToken: null, refreshToken: null, flowTaskToken: null, user: null }
  }
}

async function writeAuthSession(session) {
  const value = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    flowTaskToken: session.flowTaskToken || null,
    user: session.user || null,
  }
  try {
    if (hasNativeAuthCache()) {
      await window.electronAPI.writeAuthSession(value)
      localStorage.removeItem('chat_access_token')
      localStorage.removeItem('chat_refresh_token')
      localStorage.removeItem('flowtask_token')
      localStorage.removeItem('chat_user')
      return
    }
    if (value.accessToken) localStorage.setItem('chat_access_token', value.accessToken)
    else localStorage.removeItem('chat_access_token')
    if (value.refreshToken) localStorage.setItem('chat_refresh_token', value.refreshToken)
    else localStorage.removeItem('chat_refresh_token')
    if (value.flowTaskToken) localStorage.setItem('flowtask_token', value.flowTaskToken)
    else localStorage.removeItem('flowtask_token')
    saveUser(value.user)
  } catch (error) {
    logger.warn('Failed to persist auth session:', error)
  }
}

async function clearAuthSession() {
  try {
    if (hasNativeAuthCache()) await window.electronAPI.clearAuthSession()
  } catch (error) {
    logger.warn('Failed to clear native auth session:', error)
  }
  for (const key of ['chat_access_token', 'chat_refresh_token', 'flowtask_token', 'chat_user']) {
    localStorage.removeItem(key)
  }
}

export const useAuthStore = create((set, get) => ({
  accessToken: hasNativeAuthCache() ? null : localStorage.getItem('chat_access_token') || null,
  refreshToken: hasNativeAuthCache() ? null : localStorage.getItem('chat_refresh_token') || null,
  flowTaskToken: hasNativeAuthCache() ? null : localStorage.getItem('flowtask_token') || null,
  user: hasNativeAuthCache() ? null : getSavedUser(),
  isLoading: false,
  isInitialized: hasNativeAuthCache() ? false : !localStorage.getItem('chat_access_token') || !!getSavedUser(),
  error: null,
  flowtaskEnabled: FLOWTASK_ENABLED,
  channelSync: null,
  setChannelSync: (channelSync) => set((state) => {
    const current = state.channelSync
    if (!current || current.jobId !== channelSync?.jobId) return { channelSync }
    const terminal = ['completed', 'partial', 'failed']
    if (terminal.includes(current.status) && !terminal.includes(channelSync.status)) return state
    if ((channelSync.processedBoards || 0) < (current.processedBoards || 0)) return state
    return {
      channelSync: {
        ...current,
        ...channelSync,
        totalBoards: Math.max(current.totalBoards || 0, channelSync.totalBoards || 0),
        completedBoards: Math.max(current.completedBoards || 0, channelSync.completedBoards || 0),
        failedBoards: Math.max(current.failedBoards || 0, channelSync.failedBoards || 0),
      },
    }
  }),
  fetchChannelSyncStatus: async () => {
    try {
      const { data } = await authAPI.channelSyncStatus()
      const channelSync = data.data?.channelSync
      if (channelSync) get().setChannelSync(channelSync)
      return channelSync
    } catch (error) {
      logger.warn('Failed to reconcile project-channel sync status:', error)
      return null
    }
  },

  // ─── Token management ─────────────────────────────────────────────
  setTokens: (accessToken, refreshToken) => {
    const nextRefreshToken = refreshToken || get().refreshToken
    const state = { ...get(), accessToken, refreshToken: nextRefreshToken }
    set({ accessToken, refreshToken: nextRefreshToken })
    return writeAuthSession(state)
  },

  restoreSession: async () => {
    let session = null
    if (hasNativeAuthCache()) {
      try {
        session = await window.electronAPI.readAuthSession()
      } catch (error) {
        logger.warn('Failed to read native auth session; checking the previous session cache:', error)
      }
    }
    if (!session) {
      session = readLegacySession()
      if (hasNativeAuthCache() && session.accessToken && session.refreshToken) {
        await writeAuthSession(session)
      }
    }
    set({
      accessToken: session?.accessToken || null,
      refreshToken: session?.refreshToken || null,
      flowTaskToken: session?.flowTaskToken || null,
      user: session?.user || null,
      isInitialized: true,
    })
    return session
  },

  // Alias for backward compat — used by api interceptor
  get token() {
    return get().accessToken
  },

  // ─── Native Registration ──────────────────────────────────────────
  register: async ({ name, email, password, termsVersion }) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await authAPI.register({ name, email, password, termsVersion })
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
      await writeAuthSession({ accessToken, refreshToken, flowTaskToken: get().flowTaskToken, user })
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
  loginFlowTask: (token) => {
    if (flowTaskLoginInFlight) return flowTaskLoginInFlight.promise

    const attemptId = createAuthAttemptId()
    set({ isLoading: true, error: null })
    const promise = (async () => {
      try {
        const { data } = await authAPI.loginFlowTask(token, attemptId)
        const {
          user,
          accessToken,
          refreshToken,
          channels,
          flowTaskToken,
          channelSync,
        } = data.data
        await writeAuthSession({ accessToken, refreshToken, flowTaskToken, user })
        set({
          accessToken,
          refreshToken,
          flowTaskToken: flowTaskToken || null,
          user,
          channelSync: channelSync || null,
          isInitialized: true,
        })
        if (Array.isArray(channels)) {
          // setChannels (not a raw setState) — drops a stale, persisted
          // activeChannelId from an earlier session/workspace if it isn't
          // in this login's channel list. See channelStore.js#setChannels.
          useChannelStore.getState().setChannels?.(channels)
        }
        useWorkspaceStore.getState().fetchWorkspaces().catch((error) => {
          logger.error('Post-login workspace reconciliation failed:', error)
        })
        return data
      } catch (error) {
        const status = error.response?.status
        const serverMsg = error.response?.data?.error?.message
        let msg = serverMsg || 'FlowTask login failed'
        if (!serverMsg && status) msg = `FlowTask login failed (HTTP ${status})`
        if (!error.response) {
          msg = 'FlowTask login failed — could not reach the server. Check your network or backend URL.'
        }
        set({ error: msg })
        throw error
      } finally {
        if (flowTaskLoginInFlight?.attemptId === attemptId) {
          flowTaskLoginInFlight = null
          set({ isLoading: false })
        }
      }
    })()

    flowTaskLoginInFlight = { attemptId, promise }
    return promise
  },

  // ─── Fetch Current User ───────────────────────────────────────────
  fetchUser: async () => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await authAPI.me()
      const user = data.data.user || data.data
      await writeAuthSession({ ...get(), user })
      set({ user, isLoading: false, isInitialized: true })
      await useWorkspaceStore.getState().fetchWorkspaces()
      return user
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Failed to fetch user'
      const status = error.response?.status
      const cachedUser = getSavedUser()
      // If we have an existing access token and a cached user profile, but network/server failed (not 401/403 explicit auth failure),
      // preserve authenticated state with cached user profile instead of dropping to unauthenticated state.
      if (get().accessToken && cachedUser && status !== 401 && status !== 403) {
        logger.warn('fetchUser failed (network or server error), preserving session with cached user profile:', error)
        set({ user: cachedUser, isLoading: false, isInitialized: true, error: null })
        useWorkspaceStore.getState().fetchWorkspaces().catch(() => {})
        return cachedUser
      }
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
    const user = get().user
    const refreshToken = get().refreshToken
    // Fire-and-forget server logout
    if (refreshToken) {
      authAPI.logout(refreshToken).catch(() => {})
    }
    const clearSessionPromise = clearAuthSession()
    if (user?._id) {
      localStorage.removeItem(`taskchat_active_workspace_${user._id}`)
    }
    localStorage.removeItem('flowtask_last_active_workspace_id')
    disconnectSocket()
    useWorkspaceStore.getState().clearWorkspaceState()
    flowTaskLoginInFlight = null
    set({ accessToken: null, refreshToken: null, flowTaskToken: null, user: null, channelSync: null, error: null, isLoading: false, isInitialized: true })
    return clearSessionPromise
  },

  // ─── Account Deletion ─────────────────────────────────────────────
  deleteAccount: async (password) => {
    set({ isLoading: true, error: null });
    try {
      await authAPI.deleteAccount(password);
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Failed to delete account';
      set({ isLoading: false, error: msg });
      throw error;
    }

    // Wipe local session state (same cleanup as logout)
    await clearAuthSession();
    disconnectSocket();
    useWorkspaceStore.getState().clearWorkspaceState();
    flowTaskLoginInFlight = null;
    set({
      accessToken: null,
      refreshToken: null,
      flowTaskToken: null,
      user: null,
      channelSync: null,
      error: null,
      isLoading: false,
      isInitialized: true,
    });
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
      const updated = data.data.user
      saveUser(updated)
      set({ user: updated })
    } catch (error) {
      logger.error('Failed to update preferences:', error)
    }
  },

  // ─── Role Update ───────────────────────────────────────────────────
  updateUserRole: (newRole, workspaceId, flowTaskRole = null) => {
    set((state) => {
      if (!state.user) return state
      
      // ChatUser.role is global identity data. A role event is scoped to one
      // workspace, so never overwrite it here or the last switched workspace
      // leaks into every other tenant in this browser session.
      const updatedUser = {
        ...state.user,
        workspaceRole: newRole,
        workspaceRoleWorkspaceId: workspaceId,
        ...(flowTaskRole ? { flowTaskRole } : {}),
      }
      
      logger.info('[AuthStore] User role updated', { 
        userId: state.user._id, 
        newRole, 
        flowTaskRole,
        workspaceId 
      })
      
      return { user: updatedUser }
    })
  },

  clearError: () => set({ error: null }),
}))
