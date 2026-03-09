import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import ChatLayout from './ChatLayout'

/**
 * WorkspaceLayout — reads :workspaceId from the URL, sets it as active
 * in the workspace store, then renders ChatLayout.
 * If workspaceId changes (e.g. URL navigation), it triggers a workspace switch.
 */
export default function WorkspaceLayout() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const {
    activeWorkspaceId,
    workspaces,
    switchWorkspace,
    fetchWorkspaces,
    isLoading,
  } = useWorkspaceStore()

  // Ensure workspaces are loaded
  useEffect(() => {
    if (workspaces.length === 0 && !isLoading) {
      fetchWorkspaces()
    }
  }, [workspaces.length, isLoading, fetchWorkspaces])

  // Sync URL workspaceId → store
  useEffect(() => {
    if (!workspaceId) return

    if (workspaceId !== activeWorkspaceId) {
      // Wait until workspaces have been loaded before validating
      if (workspaces.length === 0) return
      const valid = workspaces.find((w) => w._id === workspaceId)
      if (!valid) {
        navigate('/select-workspace', { replace: true })
        return
      }
      switchWorkspace(workspaceId)
    }
  }, [workspaceId, activeWorkspaceId, workspaces, switchWorkspace, navigate])

  // Don't render ChatLayout until workspace context is set
  if (!activeWorkspaceId || activeWorkspaceId !== workspaceId) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return <ChatLayout />
}
