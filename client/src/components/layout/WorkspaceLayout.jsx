import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useChatStore } from '../../stores/chatStore'
import { useLaterStore } from '../../stores/laterStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { connectSocket } from '../../services/socket'
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
    isLoading,
    switchWorkspace,
    fetchWorkspaces,
  } = useWorkspaceStore()

  // Ensure workspaces are loaded — run ONCE on mount using a store snapshot
  // to avoid an infinite loop when the user has no workspaces (workspaces stays
  // [] after every fetch, re-triggering an effect that watches workspaces.length)
  useEffect(() => {
    const { workspaces: ws, isLoading: loading } = useWorkspaceStore.getState()
    if (ws.length === 0 && !loading) {
      fetchWorkspaces()
    }
  }, [fetchWorkspaces])

  // Sync URL workspaceId → store
  useEffect(() => {
    if (!workspaceId) return

    if (workspaceId !== activeWorkspaceId) {
      if (isLoading && workspaces.length === 0) return

      const valid = workspaces.find((w) => w._id === workspaceId)
      if (!valid) {
        if (workspaces.length > 0) {
          navigate(`/workspace/${workspaces[0]._id}`, { replace: true })
        } else {
          navigate('/select-workspace', { replace: true })
        }
        return
      }
      switchWorkspace(workspaceId)
    }
  }, [workspaceId, activeWorkspaceId, workspaces, isLoading, switchWorkspace, navigate])

  // Ensure socket is connected once workspace context is ready
  const connectionStatus = useChatStore((s) => s.connectionStatus)
  useEffect(() => {
    if (activeWorkspaceId && activeWorkspaceId === workspaceId && connectionStatus === 'disconnected') {
      connectSocket()
    }
  }, [activeWorkspaceId, workspaceId, connectionStatus])

  // Fetch global context data that drives badges/indicators across the workspace
  useEffect(() => {
    if (activeWorkspaceId && activeWorkspaceId === workspaceId) {
      useLaterStore.getState().fetchSavedMessages()
      useCanvasStore.getState().fetchSavedCanvases(null, undefined)
    }
  }, [activeWorkspaceId, workspaceId])

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
