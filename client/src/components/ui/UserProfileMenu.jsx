import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import { Avatar } from '../chat/MemberAvatarGroup'
import { Smile, Moon, BellOff, User, Settings, Download, LogOut } from 'lucide-react'

export default function UserProfileMenu({ anchorRef, onClose }) {
  const menuRef = useRef(null)
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()

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

  const style = {
    bottom: window.innerHeight - rect.top + 8,
    left: rect.right + 8,
  }

  return createPortal(
    <div ref={menuRef} className="user-menu" style={style}>
      {/* Header */}
      <div className="user-menu-header">
        <Avatar
          member={{ name: user?.name || '?', avatar: user?.avatar, onlineStatus: 'online' }}
          size={40}
          showStatus={true}
        />
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-white)' }}>
            {user?.name || 'User'}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--status-online)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Active</span>
          </div>
        </div>
      </div>

      {/* Status */}
      <button className="user-menu-item" onClick={onClose}>
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
        onClick={() => { toggleTheme(); onClose() }}
      >
        <Settings size={16} style={{ color: 'var(--text-muted)' }} />
        <span>Preferences</span>
        <span className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>
          {theme === 'dark' ? 'Dark' : 'Light'}
        </span>
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
        onClick={() => { logout(); onClose() }}
        style={{ color: 'var(--accent-red)' }}
      >
        <LogOut size={16} />
        <span>Sign out of {user?.name || 'workspace'}</span>
      </button>
    </div>,
    document.body,
  )
}
