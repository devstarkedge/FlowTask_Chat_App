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
      isSwitching: false,
      error: null,

      // ─── Fetch user's workspaces ───────────────────────────────────────
      fetchWorkspaces: async (skipAutoSelect = false) => {
        set({ isLoading: true, error: null })
        try {
          const { data } = await api.get('/workspaces/mine')
          const workspaces = data.data?.workspaces || []
          set({ workspaces, isLoading: false })

          // Auto-select if no active workspace or current one is invalid
          const { activeWorkspaceId } = get()
          if (!activeWorkspaceId || !workspaces.find((w) => w._id === activeWorkspaceId)) {
            if (workspaces.length > 0) {
              if (!skipAutoSelect) {
                set({
                  activeWorkspaceId: workspaces[0]._id,
                  activeWorkspace: workspaces[0],
                })
              } else {
                set({
                  activeWorkspaceId: null,
                  activeWorkspace: null,
                })
              }
            } else {
              set({
                activeWorkspaceId: null,
                activeWorkspace: null,
              })
            }
          } else {
            // Refresh active workspace data
            const active = workspaces.find((w) => w._id === activeWorkspaceId)
            if (active) set({ activeWorkspace: active })
          }

          return workspaces
        } catch (error) {
          const msg = error.response?.data?.error?.message || 'Failed to fetch workspaces'
          set({ isLoading: false, error: msg })
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
          const updated = data.data?.workspace
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
        set({
          workspaces: [],
          activeWorkspaceId: null,
          activeWorkspace: null,
          members: [],
          error: null,
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
          ? { _id: state.activeWorkspace._id, name: state.activeWorkspace.name, slug: state.activeWorkspace.slug, logo: state.activeWorkspace.logo }
          : null,
      }),
    },
  ),
)
