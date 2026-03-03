import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { reconnectWithWorkspace } from '../../services/socket'
import {
  ChevronDown, Plus, Settings, LogIn, Check, Loader2, MessageCircle,
} from 'lucide-react'

/**
 * WorkspaceSwitcher — dropdown in sidebar header for switching/creating workspaces.
 */
export default function WorkspaceSwitcher({ onOpenCreate, onOpenJoin, onOpenSettings }) {
  const {
    workspaces, activeWorkspace, activeWorkspaceId,
    switchWorkspace, isSwitching,
  } = useWorkspaceStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])

  const handleSwitch = async (workspaceId) => {
    if (workspaceId === activeWorkspaceId) {
      setIsOpen(false)
      return
    }

    setIsOpen(false)

    // Switch workspace state
    await switchWorkspace(workspaceId)

    // Clear channel and chat state for clean slate
    useChannelStore.setState({
      channels: [],
      activeChannelId: null,
      unreads: {},
      membersByChannel: {},
    })
    useChatStore.getState().clearCache?.()

    // Reconnect socket with new workspace context
    reconnectWithWorkspace()

    // Fetch channels for the new workspace
    setTimeout(() => {
      useChannelStore.getState().fetchChannels()
    }, 100)
  }

  const getWorkspaceInitial = (name) => {
    return name?.charAt(0)?.toUpperCase() || '?'
  }

  const getWorkspaceColor = (index) => {
    const colors = [
      'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
      'linear-gradient(135deg, #f59e0b, #ef4444)',
      'linear-gradient(135deg, #10b981, #3b82f6)',
      'linear-gradient(135deg, #8b5cf6, #ec4899)',
      'linear-gradient(135deg, #06b6d4, #6366f1)',
      'linear-gradient(135deg, #f97316, #eab308)',
    ]
    return colors[index % colors.length]
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 min-w-0 w-full cursor-pointer"
        style={{ background: 'transparent', border: 'none', padding: 0 }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
          style={{
            background: activeWorkspace?.logo
              ? `url(${activeWorkspace.logo}) center/cover`
              : 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
            color: 'white',
          }}
        >
          {!activeWorkspace?.logo && (
            activeWorkspace ? getWorkspaceInitial(activeWorkspace.name) : <MessageCircle size={16} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-white)' }}>
            {isSwitching ? 'Switching...' : activeWorkspace?.name || 'FlowTask'}
          </p>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: 'var(--text-muted)',
            transition: 'transform 0.15s',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute left-0 top-full mt-1.5 w-72 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          {/* Workspace list */}
          <div className="p-1.5 max-h-64 overflow-y-auto">
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}>
              Workspaces
            </p>
            {workspaces.map((ws, idx) => {
              const isActive = ws._id === activeWorkspaceId
              return (
                <button
                  key={ws._id}
                  onClick={() => handleSwitch(ws._id)}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors cursor-pointer"
                  style={{
                    background: isActive ? 'var(--bg-active)' : 'transparent',
                    border: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                    style={{
                      background: ws.logo
                        ? `url(${ws.logo}) center/cover`
                        : getWorkspaceColor(idx),
                      color: 'white',
                    }}
                  >
                    {!ws.logo && getWorkspaceInitial(ws.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-white)' }}>
                      {ws.name}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {ws.memberCount || 0} {ws.memberCount === 1 ? 'member' : 'members'}
                    </p>
                  </div>
                  {isActive && (
                    <Check size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  )}
                  {isSwitching && ws._id === activeWorkspaceId && (
                    <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Actions */}
          <div
            className="p-1.5"
            style={{ borderTop: '1px solid var(--border-secondary)' }}
          >
            <button
              onClick={() => { setIsOpen(false); onOpenCreate?.() }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer"
              style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Plus size={16} style={{ color: 'var(--accent-primary)' }} />
              Create a workspace
            </button>
            <button
              onClick={() => { setIsOpen(false); onOpenJoin?.() }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer"
              style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <LogIn size={16} style={{ color: 'var(--accent-green)' }} />
              Join a workspace
            </button>
            {activeWorkspace && (
              <button
                onClick={() => { setIsOpen(false); onOpenSettings?.() }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer"
                style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Settings size={16} style={{ color: 'var(--text-muted)' }} />
                Workspace settings
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
