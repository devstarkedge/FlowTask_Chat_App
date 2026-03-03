import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'
import toast from 'react-hot-toast'

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
      fetchWorkspaces: async () => {
        set({ isLoading: true, error: null })
        try {
          const { data } = await api.get('/workspaces/mine')
          const workspaces = data.data?.workspaces || []
          set({ workspaces, isLoading: false })

          // Auto-select if no active workspace or current one is invalid
          const { activeWorkspaceId } = get()
          if (!activeWorkspaceId || !workspaces.find((w) => w._id === activeWorkspaceId)) {
            if (workspaces.length > 0) {
              set({
                activeWorkspaceId: workspaces[0]._id,
                activeWorkspace: workspaces[0],
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
          console.error('Failed to fetch workspaces:', error)
          return []
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
          // Update active workspace
          set({
            activeWorkspaceId: workspaceId,
            activeWorkspace: workspace,
            isSwitching: false,
          })

          // The socket reconnection and channel refresh will be triggered
          // by the component that observes activeWorkspaceId changes
        } catch (error) {
          set({ isSwitching: false })
          toast.error('Failed to switch workspace')
          console.error('Workspace switch failed:', error)
        }
      },

      // ─── Create workspace ──────────────────────────────────────────────
      createWorkspace: async ({ name, description }) => {
        set({ isLoading: true, error: null })
        try {
          const { data } = await api.post('/workspaces', { name, description })
          const workspace = data.data?.workspace
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
          await api.delete(`/workspaces/${workspaceId}`)
          set((state) => {
            const remaining = state.workspaces.filter((w) => w._id !== workspaceId)
            const isActive = state.activeWorkspaceId === workspaceId
            return {
              workspaces: remaining,
              activeWorkspaceId: isActive ? remaining[0]?._id || null : state.activeWorkspaceId,
              activeWorkspace: isActive ? remaining[0] || null : state.activeWorkspace,
            }
          })
          toast.success('Workspace deleted')
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
          const members = data.data?.members || []
          set({ members })
          return members
        } catch (error) {
          console.error('Failed to fetch workspace members:', error)
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
            members: state.members.filter((m) => m.userId !== userId && m._id !== userId),
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
              (m.userId === userId || m._id === userId) ? { ...m, role } : m,
            ),
          }))
          toast.success('Role updated')
        } catch (error) {
          toast.error(error.response?.data?.error?.message || 'Failed to update role')
          throw error
        }
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
          const { data } = await api.post(`/workspaces/${id}/invite-code`)
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
    }),
    {
      name: 'flowtask-workspace-storage',
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    },
  ),
)
