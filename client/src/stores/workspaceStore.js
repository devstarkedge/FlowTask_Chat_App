import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useChannelStore } from './channelStore'
import { useChatStore } from './chatStore'
import { useNotificationStore } from './notificationStore'
import { useDraftStore } from './draftStore'
import { reconnectWithWorkspace, disconnectSocket } from '../services/socket'
import logger from '../utils/logger'

// Helper for user-scoped active workspace persistence
export const getSavedWorkspaceId = (userId) => {
  try {
    if (userId) {
      const userKey = `taskchat_active_workspace_${userId}`
      const userVal = localStorage.getItem(userKey)
      if (userVal) return userVal
    }
    return localStorage.getItem('flowtask_last_active_workspace_id') || null
  } catch (e) {
    logger.warn('Failed to read saved workspace ID:', e)
    return null
  }
}

export const saveActiveWorkspaceId = (userId, workspaceId) => {
  try {
    if (workspaceId) {
      localStorage.setItem('flowtask_last_active_workspace_id', workspaceId)
      if (userId) {
        localStorage.setItem(`taskchat_active_workspace_${userId}`, workspaceId)
      }
    } else {
      localStorage.removeItem('flowtask_last_active_workspace_id')
      if (userId) {
        localStorage.removeItem(`taskchat_active_workspace_${userId}`)
      }
    }
  } catch (e) {
    logger.warn('Failed to save workspace ID:', e)
  }
}

export const clearSavedWorkspaceId = (userId) => {
  try {
    localStorage.removeItem('flowtask_last_active_workspace_id')
    if (userId) {
      localStorage.removeItem(`taskchat_active_workspace_${userId}`)
    }
  } catch (e) {
    logger.warn('Failed to clear saved workspace ID:', e)
  }
}

/**
 * Workspace Store — manages workspace state for multi-tenant isolation.
 *
 * Responsibilities:
 *   - Track current workspace and list of user's workspaces
 *   - Switch workspace (clears channel/chat state, reconnects socket)
 *   - CRUD for workspace settings, members, invite codes
 *   - Persists activeWorkspaceId to survive page refresh
 */
export const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      members: [],
      isLoading: false,
      isWorkspacesLoaded: false,
      isSwitching: false,
      error: null,

      // ─── Fetch user's workspaces ───────────────────────────────────────
      fetchWorkspaces: async (skipAutoSelect = false) => {
        set({ isLoading: true, error: null })
        try {
          const { data } = await api.get('/workspaces/mine')
          const workspaces = data.data?.workspaces || []

          let userId = null
          try {
            const authStoreModule = await import('./authStore')
            userId = authStoreModule.useAuthStore.getState()?.user?._id
          } catch (e) {}

          const savedId = getSavedWorkspaceId(userId)

          const { activeWorkspaceId } = get()
          let targetWorkspace = null

          // Priority 1: In-memory activeWorkspaceId if still valid
          if (activeWorkspaceId && workspaces.some((w) => w._id === activeWorkspaceId)) {
            targetWorkspace = workspaces.find((w) => w._id === activeWorkspaceId)
          } 
          // Priority 2: User-scoped persisted workspace ID if valid
          else if (savedId && workspaces.some((w) => w._id === savedId)) {
            targetWorkspace = workspaces.find((w) => w._id === savedId)
          } 
          // Priority 3: Fallback auto-select single workspace if requested
          else if (!skipAutoSelect && workspaces.length === 1) {
            targetWorkspace = workspaces[0]
          }

          if (targetWorkspace) {
            set({
              workspaces,
              activeWorkspaceId: targetWorkspace._id,
              activeWorkspace: targetWorkspace,
              isLoading: false,
              isWorkspacesLoaded: true,
            })
            saveActiveWorkspaceId(userId, targetWorkspace._id)
          } else {
            set({
              workspaces,
              activeWorkspaceId: null,
              activeWorkspace: null,
              isLoading: false,
              isWorkspacesLoaded: true,
            })
            if (savedId && !workspaces.some((w) => w._id === savedId)) {
              clearSavedWorkspaceId(userId)
            }
          }

          return workspaces
        } catch (error) {
          const msg = error.response?.data?.error?.message || 'Failed to fetch workspaces'
          set({ isLoading: false, isWorkspacesLoaded: true, error: msg })
          logger.error('Failed to fetch workspaces:', error)
          return []
        }
      },

      // Fetch a single workspace by id and update store (used to load inviteCode)
      fetchWorkspace: async (workspaceId) => {
        if (!workspaceId) return null
        try {
          const { data } = await api.get(`/workspaces/${workspaceId}`)
          const workspace = data.data?.workspace || data.data
          if (!workspace) return null

          set((state) => ({
            workspaces: state.workspaces.map((w) => (w._id === workspace._id ? { ...w, ...workspace } : w)),
            activeWorkspace: state.activeWorkspaceId === workspace._id
              ? { ...state.activeWorkspace, ...workspace }
              : state.activeWorkspace,
          }))

          return workspace
        } catch (error) {
          logger.error('Failed to fetch workspace:', error)
          return null
        }
      },

      // ─── Switch workspace ──────────────────────────────────────────────
      switchWorkspace: async (workspaceId) => {
        const { activeWorkspaceId, workspaces } = get()
        if (workspaceId === activeWorkspaceId) return

        const workspace = workspaces.find((w) => w._id === workspaceId)
        if (!workspace) {
          toast.error('Workspace not found')
          return
        }

        set({ isSwitching: true })

        try {
          // 1. Clear channel state for clean slate
          useChannelStore.setState({
            channels: [],
            activeChannelId: null,
            unreads: {},
            membersByChannel: {},
            showInfoPanel: false,
          })

          // 2. Clear chat state (messages, threads, typing, online)
          useChatStore.getState().clearCache?.()

          // 3. Clear notification state
          useNotificationStore.getState().clearNotifications()

          // 4. Reset draft sidebar state for clean workspace transition
          // (local drafts are keyed by workspaceId — no leakage risk)
          useDraftStore.getState().resetSidebarState?.()

          // 5. Update active workspace
          set({
            activeWorkspaceId: workspaceId,
            activeWorkspace: workspace,
            members: [],
          })

          // Persist active workspace ID immediately for renderer reload / Electron restart survival
          try {
            const authStoreModule = await import('./authStore')
            saveActiveWorkspaceId(authStoreModule.useAuthStore.getState()?.user?._id, workspaceId)
          } catch (e) {}

          // 6. Reconnect socket with new workspace context
          // (handles disconnect, reconnect, fetchChannels, fetchNotifications)
          reconnectWithWorkspace()

          set({ isSwitching: false })
        } catch (error) {
          set({ isSwitching: false })
          toast.error('Failed to switch workspace')
          logger.error('Workspace switch failed:', error)
        }
      },

      // ─── Create workspace ──────────────────────────────────────────────
      createWorkspace: async ({ name, description, plan, logo }) => {
        set({ isLoading: true, error: null })
        try {
          const { data } = await api.post('/workspaces', { name, description, plan, logo })
          const workspace = data.data?.workspace || data.data
          set((state) => ({
            workspaces: [...state.workspaces, workspace],
            isLoading: false,
          }))
          toast.success(`Workspace "${workspace.name}" created!`)
          return workspace
        } catch (error) {
          const msg = error.response?.data?.error?.message || 'Failed to create workspace'
          set({ isLoading: false, error: msg })
          toast.error(msg)
          throw error
        }
      },

      // ─── Update workspace ─────────────────────────────────────────────
      updateWorkspace: async (workspaceId, updates) => {
        try {
          const { data } = await api.patch(`/workspaces/${workspaceId}`, updates)
          const updated = data.data?.workspace || data.data
          set((state) => ({
            workspaces: state.workspaces.map((w) =>
              w._id === workspaceId ? { ...w, ...updated } : w,
            ),
            activeWorkspace:
              state.activeWorkspaceId === workspaceId
                ? { ...state.activeWorkspace, ...updated }
                : state.activeWorkspace,
          }))
          toast.success('Workspace updated')
          return updated
        } catch (error) {
          toast.error(error.response?.data?.error?.message || 'Failed to update workspace')
          throw error
        }
      },

      // ─── Delete workspace ─────────────────────────────────────────────
      deleteWorkspace: async (workspaceId) => {
        try {
          const res = await api.delete(`/workspaces/${workspaceId}`)

          set((state) => {
            const remaining = state.workspaces.filter((w) => w._id !== workspaceId)
            const isActive = state.activeWorkspaceId === workspaceId
            
            if (isActive) {
              // 1. Clear channel state
              useChannelStore.setState({
                channels: [],
                activeChannelId: null,
                unreads: {},
                membersByChannel: {},
                showInfoPanel: false,
              })
              // 2. Clear chat state
              useChatStore.getState().clearCache?.()
              // 3. Clear notification state
              useNotificationStore.getState().clearNotifications()
              // 4. Clear drafts
              useDraftStore.getState().resetSidebarState?.()
              
              // 5. Unsubscribe socket immediately
              disconnectSocket()
              
              if (remaining.length > 0) {
                const nextActive = remaining[0]
                // Reconnect socket with new workspace context
                setTimeout(() => {
                  reconnectWithWorkspace()
                }, 0)

                return {
                  workspaces: remaining,
                  activeWorkspaceId: nextActive._id,
                  activeWorkspace: nextActive,
                  members: [],
                }
              }

              return {
                workspaces: remaining,
                activeWorkspaceId: null,
                activeWorkspace: null,
                members: [],
              }
            }

            return {
              workspaces: remaining,
            }
          })

          // Ensure the workspace list is explicitly refreshed from the server in the background
          get().fetchWorkspaces(true).catch(() => {})

          return res.data   

        } catch (error) {
          toast.error(error.response?.data?.error?.message || 'Failed to delete workspace')
          throw error
        }
      },

      leaveWorkspace: async (workspaceId) => {
        const id = workspaceId || get().activeWorkspaceId
        if (!id) throw new Error('No workspace to leave')

        try {
          await api.post(`/workspaces/${id}/leave`)
          const wasActive = get().activeWorkspaceId === id

          if (wasActive) {
            useChannelStore.setState({
              channels: [], activeChannelId: null, unreads: {}, membersByChannel: {}, showInfoPanel: false,
            })
            useChatStore.getState().clearCache?.()
            useNotificationStore.getState().clearNotifications()
            useDraftStore.getState().resetSidebarState?.()
            disconnectSocket()
            set({ activeWorkspaceId: null, activeWorkspace: null, members: [] })
          }

          await get().fetchWorkspaces(true)
          const nextWorkspace = get().workspaces[0]
          if (wasActive && nextWorkspace) await get().switchWorkspace(nextWorkspace._id)
          toast.success('Left workspace')
        } catch (error) {
          toast.error(error.response?.data?.error?.message || 'Failed to leave workspace')
          throw error
        }
      },

      // ─── Members ──────────────────────────────────────────────────────
      fetchMembers: async (workspaceId) => {
        try {
          const id = workspaceId || get().activeWorkspaceId
          if (!id) return []
          const { data } = await api.get(`/workspaces/${id}/members`)
          const members = data.data || []
          set({ members })
          return members
        } catch (error) {
          logger.error('Failed to fetch workspace members:', error)
          return []
        }
      },

      inviteMember: async (email, role = 'member') => {
        const id = get().activeWorkspaceId
        if (!id) return
        try {
          const { data } = await api.post(`/workspaces/${id}/members`, { email, role })
          toast.success('Invitation sent')
          get().fetchMembers()
          return data.data
        } catch (error) {
          toast.error(error.response?.data?.error?.message || 'Failed to invite member')
          throw error
        }
      },

      removeMember: async (userId) => {
        const id = get().activeWorkspaceId
        if (!id) return
        try {
          await api.delete(`/workspaces/${id}/members/${userId}`)
          set((state) => ({
            members: state.members.filter((m) => 
              m.userId?._id !== userId && m.userId !== userId && m._id !== userId
            ),
          }))
          toast.success('Member removed')
        } catch (error) {
          toast.error(error.response?.data?.error?.message || 'Failed to remove member')
          throw error
        }
      },

      updateMemberRole: async (userId, role) => {
        const id = get().activeWorkspaceId
        if (!id) return
        try {
          await api.patch(`/workspaces/${id}/members/${userId}`, { role })
          set((state) => ({
            members: state.members.map((m) =>
              (m.userId?._id === userId || m.userId === userId || m._id === userId)
                ? { ...m, role }
                : m,
            ),
          }))
          toast.success('Role updated')
        } catch (error) {
          toast.error(error.response?.data?.error?.message || 'Failed to update role')
          throw error
        }
      },

      // Update member role in store (for socket events, no API call)
      updateMemberRoleInStore: (userId, newRole) => {
        set((state) => ({
          members: state.members.map((m) =>
            (m.userId?._id === userId || m.userId === userId || m._id === userId)
              ? { ...m, role: newRole }
              : m
          ),
        }))
      },

      // Update member profile in store (for socket events, no API call)
      updateMemberProfile: (userId, updates) => {
        set((state) => ({
          members: state.members.map((m) => {
            if (m.userId?._id === userId || m.userId === userId || m._id === userId) {
              const isNested = typeof m.userId === 'object' && m.userId !== null;
              if (isNested) {
                return { ...m, userId: { ...m.userId, ...updates } };
              }
              return { ...m, ...updates };
            }
            return m;
          }),
        }))
      },

      // ─── Invite Code ─────────────────────────────────────────────────
      joinByInviteCode: async (inviteCode) => {
        set({ isLoading: true, error: null })
        try {
          const { data } = await api.post('/workspaces/join', { inviteCode })
          const workspace = data.data?.workspace
          set((state) => {
            const exists = state.workspaces.some((w) => w._id === workspace._id)
            return {
              workspaces: exists ? state.workspaces : [...state.workspaces, workspace],
              isLoading: false,
            }
          })
          toast.success(`Joined "${workspace.name}"!`)
          return workspace
        } catch (error) {
          const msg = error.response?.data?.error?.message || 'Invalid invite code'
          set({ isLoading: false, error: msg })
          toast.error(msg)
          throw error
        }
      },

      regenerateInviteCode: async () => {
        const id = get().activeWorkspaceId
        if (!id) return
        try {
          const { data } = await api.post(`/workspaces/${id}/invite-code/regenerate`, {})
          const inviteCode = data.data?.inviteCode
          set((state) => ({
            activeWorkspace: state.activeWorkspace
              ? { ...state.activeWorkspace, inviteCode }
              : null,
            workspaces: state.workspaces.map((w) =>
              w._id === id ? { ...w, inviteCode } : w,
            ),
          }))
          toast.success('Invite code regenerated')
          return inviteCode
        } catch (error) {
          toast.error('Failed to regenerate invite code')
          throw error
        }
      },

      // ─── Helpers ──────────────────────────────────────────────────────
      getActiveWorkspaceId: () => get().activeWorkspaceId,

      clearWorkspaceState: () => {
        try {
          const userId = localStorage.getItem('chat_access_token') ? null : null
          clearSavedWorkspaceId(userId)
        } catch (e) {}
        set({
          workspaces: [],
          activeWorkspaceId: null,
          activeWorkspace: null,
          members: [],
          error: null,
          isWorkspacesLoaded: false,
        })
      },

      // ─── Billing & Plan ─────────────────────────────────────────────
      fetchBilling: async (workspaceId) => {
        const id = workspaceId || get().activeWorkspaceId
        if (!id) return null
        try {
          const { data } = await api.get(`/workspaces/${id}/billing`)
          return data.data
        } catch (error) {
          logger.error('Failed to fetch billing:', error)
          return null
        }
      },

      upgradePlan: async (workspaceId, newPlan) => {
        const id = workspaceId || get().activeWorkspaceId
        if (!id) return
        try {
          const { data } = await api.post(`/workspaces/${id}/upgrade-plan`, { plan: newPlan })
          const updated = data.data
          if (updated) {
            set((state) => ({
              workspaces: state.workspaces.map((w) =>
                w._id === id ? { ...w, plan: updated.plan } : w,
              ),
              activeWorkspace:
                state.activeWorkspaceId === id
                  ? { ...state.activeWorkspace, plan: updated.plan }
                  : state.activeWorkspace,
            }))
          }
          toast.success(`Plan changed to ${updated?.plan || newPlan}!`)
          return updated
        } catch (error) {
          toast.error(error.response?.data?.error?.message || 'Failed to upgrade plan')
          throw error
        }
      },
    }),
    {
      name: 'flowtask-workspace-storage',
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
        // Persist workspace object so sidebar shows correct name after refresh
        activeWorkspace: state.activeWorkspace
          ? {
              _id: state.activeWorkspace._id,
              name: state.activeWorkspace.name,
              slug: state.activeWorkspace.slug,
              logo: state.activeWorkspace.logo,
              source: state.activeWorkspace.source,
              settings: state.activeWorkspace.settings,
              plan: state.activeWorkspace.plan,
              flowTaskRole: state.activeWorkspace.flowTaskRole,
            }
          : null,
      }),
    },
  ),
)
