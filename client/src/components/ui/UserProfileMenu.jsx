import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../chat/MemberAvatarGroup'
import { Smile, Moon, BellOff, User, Settings, Download, LogOut } from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import toast from 'react-hot-toast'

export default function UserProfileMenu({ anchorRef, onClose, onOpenPreferences, onOpenSetStatus }) {
  const menuRef = useRef(null)
  const { user, logout } = useAuthStore()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const STATUS_COLORS = {
    online: 'var(--status-online)',
    away: 'var(--status-away)',
    busy: 'var(--status-dnd)',
    dnd: 'var(--status-dnd)',
    offline: 'var(--status-offline)',
  }
  const STATUS_LABELS = {
    online: 'Active',
    away: 'Away',
    busy: 'Do not disturb',
    dnd: 'Do not disturb',
    offline: 'Offline',
  }
  const userStatus = user?.status || 'online'

  const handleLogout = () => {
    toast((t) => (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10
        }}
      >
        <span style={{ fontWeight: 500 }}>
          Are you sure you want to sign out?
        </span>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            className="btn-ghost"
            onClick={() => toast.dismiss(t.id)}
          >
            Cancel
          </button>

          <button
            className="btn-danger"
            onClick={async () => {
              toast.dismiss(t.id)

              setIsSigningOut(true)
              const loadingToast = toast.loading("Signing out...")

              try {
                await logout()
              } catch (err) {
                console.error("Logout API failed:", err)
              }

              try {
                localStorage.clear()
                sessionStorage.clear()

                useWorkspaceStore.getState().reset?.()
                useAuthStore.getState().reset?.()

                toast.dismiss(loadingToast)
                toast.success("Signed out successfully 👋")

                onClose?.()
                window.location.href = "/login"

              } catch (err) {
                toast.dismiss(loadingToast)
                toast.error("Something went wrong")
              } finally {
                setIsSigningOut(false)
              }
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    ), {
      duration: 5000
    })
  }


  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, anchorRef])

  const rect = anchorRef.current?.getBoundingClientRect()
  if (!rect) return null

  const menuWidth = 280
  const opensUp = rect.top > window.innerHeight / 2
  const left = rect.left < 96
    ? rect.right + 8
    : Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8)
  const style = opensUp
    ? { bottom: window.innerHeight - rect.top + 8, left }
    : { top: rect.bottom + 8, left }

  return createPortal(
    <div ref={menuRef} className="user-menu" style={style}>
      {/* Header */}
      <div className="user-menu-header">
        <Avatar
          member={{ name: user?.name || '?', avatar: user?.avatar, onlineStatus: userStatus }}
          size={40}
          showStatus={true}
        />
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-white)' }}>
            {user?.name || 'User'}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[userStatus] || 'var(--status-online)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{STATUS_LABELS[userStatus] || 'Active'}</span>
          </div>
          {user?.customStatus?.emoji || user?.customStatus?.text ? (
            <div style={{ marginTop: 6 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                {user.customStatus.emoji ? <span style={{ marginRight: 6 }}>{user.customStatus.emoji}</span> : null}
                <span>{user.customStatus.text}</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Status */}
      <button className="user-menu-item" onClick={() => { onClose(); onOpenSetStatus && onOpenSetStatus() }}>
        <Smile size={16} style={{ color: 'var(--text-muted)' }} />
        <span>Update your status</span>
      </button>

      <div className="user-menu-divider" />

      <button className="user-menu-item" onClick={onClose}>
        <Moon size={16} style={{ color: 'var(--text-muted)' }} />
        <span>Set yourself as away</span>
      </button>

      <button className="user-menu-item" onClick={onClose}>
        <BellOff size={16} style={{ color: 'var(--text-muted)' }} />
        <span>Pause notifications</span>
      </button>

      <div className="user-menu-divider" />

      <button className="user-menu-item" onClick={onClose}>
        <User size={16} style={{ color: 'var(--text-muted)' }} />
        <span>Profile</span>
      </button>

      <button
        className="user-menu-item"
        onClick={() => {
          onOpenPreferences?.()
          onClose()
        }}
      >
        <Settings size={16} style={{ color: 'var(--text-muted)' }} />
        <span>Preferences</span>
      </button>

      <div className="user-menu-divider" />

      <button className="user-menu-item" onClick={onClose}>
        <Download size={16} style={{ color: 'var(--text-muted)' }} />
        <span>Downloads</span>
        <span className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>Ctrl+Shift+J</span>
      </button>

      <div className="user-menu-divider" />

      <button
      className="user-menu-item"
      onClick={handleLogout}
      disabled={isSigningOut}
      style={{
        color: 'var(--accent-red)',
        opacity: isSigningOut ? 0.6 : 1
      }}
    >
      <LogOut size={16} />
      <span>
        {isSigningOut ? 'Signing out…' : `Sign out of ${user?.name || 'workspace'}`}
      </span>
    </button>
    </div>,
    document.body,
  )
}
