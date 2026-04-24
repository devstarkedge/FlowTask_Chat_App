import { useEffect, useRef, useState } from 'react'
import './UserProfileMenu.css'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../chat/MemberAvatarGroup'
import { Smile, Moon, BellOff, User, Settings, Download, LogOut, HelpCircle } from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import toast from 'react-hot-toast'
import { dndAPI } from '../../services/api'

export default function UserProfileMenu({ anchorRef, onClose, onOpenPreferences, onOpenSetStatus }) {
  const menuRef = useRef(null)
  const { user, logout, setPresence } = useAuthStore()
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
  // Prefer showing DND presence when manual DND is active
  const userStatus = (user?.chatPreferences?.dnd?.enabled) ? 'dnd' : (user?.onlineStatus || 'online')
  const isAway = userStatus === 'away' || userStatus === 'offline' || userStatus === 'dnd'

  const [showPauseMenu, setShowPauseMenu] = useState(false)
  const [dndState, setDndState] = useState({ enabled: false, endAt: null })
  const [customEndsAt, setCustomEndsAt] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [allowVip, setAllowVip] = useState(false)

  useEffect(() => {
    // Fetch current DND status on mount
    let mounted = true
    ;(async () => {
      try {
        const { data } = await dndAPI.status()
        if (!mounted) return
        const d = data.data.dnd || { enabled: false, endAt: null }
        setDndState(d)
        setAllowVip(Boolean(d.vipUsers && d.vipUsers.length > 0))
      } catch (err) {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])

  const applyPause = async (payload) => {
    try {
      const { data } = await dndAPI.pause(payload)
      setDndState(data.data.dnd || { enabled: true })
      try {
        await useAuthStore.getState().fetchUser()
      } catch (err) {
        // ignore refresh errors
      }
      setShowPauseMenu(false)
      toast.success('Notifications paused')
    } catch (err) {
      toast.error('Failed to pause notifications')
    }
  }

  const handleResume = async () => {
    try {
      const { data } = await dndAPI.resume()
      setDndState(data.data.dnd || { enabled: false })
      try {
        await useAuthStore.getState().fetchUser()
      } catch (err) {
        // ignore
      }
      setShowPauseMenu(false)
      toast.success('Notifications resumed')
    } catch (err) {
      toast.error('Failed to resume notifications')
    }
  }

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
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
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

      <button className="user-menu-item" onClick={() => {
        onClose();
        setPresence(isAway ? 'online' : 'away');
      }}>
        {isAway ? (
          <Smile size={16} style={{ color: 'var(--status-online)' }} />
        ) : (
          <Moon size={16} style={{ color: 'var(--text-muted)' }} />
        )}
        <span>{isAway ? 'Set yourself as active' : 'Set yourself as away'}</span>
      </button>

        <div style={{ position: 'relative' }}>
        <button className={`user-menu-item ${showPauseMenu ? 'is-active' : ''}`} onClick={() => setShowPauseMenu((s) => !s)}>
          <BellOff size={16} style={{ color: 'var(--text-muted)' }} />
          <span>{dndState?.enabled ? 'Notifications paused' : 'Pause notifications'}</span>
        </button>

        {showPauseMenu && (
          <div
            className="user-menu-popup"
            style={{ position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 0 }}
          >
            <div className="user-submenu">
              <div className="user-submenu-header">
                <div className="user-submenu-title">Pause notifications...</div>
                <button className="help-icon" title="Pause notifications help">
                  <HelpCircle size={16} />
                </button>
              </div>

              {dndState?.enabled ? (
                <div>
                  <button className="user-submenu-item" onClick={handleResume}>
                    <span>Resume notifications</span>
                  </button>
                  {dndState.endAt ? (
                    <div className="section-note">
                      Notifications paused until {new Date(dndState.endAt).toLocaleString()}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div>
                  <button className="user-submenu-item" onClick={() => { applyPause({ duration: '30m' }) }}>{'For 30 minutes'}</button>
                  <button className="user-submenu-item" onClick={() => { applyPause({ duration: '1h' }) }}>{'For 1 hour'}</button>
                  <button className="user-submenu-item" onClick={() => { applyPause({ duration: '2h' }) }}>{'For 2 hours'}</button>
                  <button className="user-submenu-item" onClick={() => { applyPause({ duration: 'tomorrow' }) }}>{'Until tomorrow'}</button>
                  <button className="user-submenu-item" onClick={() => { applyPause({ duration: 'next_week' }) }}>{'Until next week'}</button>
                  <button className="user-submenu-item" onClick={() => setShowCustom((s) => !s)}>{'Custom...'}</button>

                  {showCustom && (
                    <div className="p-2">
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Custom date & time</label>
                      <input className="input-field w-full" type="datetime-local" value={customEndsAt} onChange={(e) => setCustomEndsAt(e.target.value)} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="btn" onClick={() => {
                          if (!customEndsAt) return toast.error('Select a date/time')
                          const iso = new Date(customEndsAt).toISOString()
                          applyPause({ endsAt: iso })
                        }}>Set</button>
                        <button className="btn-ghost" onClick={() => setCustomEndsAt('')}>Clear</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="submenu-divider" />

              <div className="appearance-toggle-row" style={{ padding: '10px' }}>
                <div style={{ width: 22 }}>
                  <span className="w-5 h-5 rounded-full" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Always allow VIP messages</p>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>Still get notified when VIPs send messages.</span>
                </div>
                <div style={{ marginLeft: 8 }}>
                  <button className={`appearance-switch ${allowVip ? 'is-on' : ''}`} disabled title={allowVip ? 'VIP allowed' : 'VIP not allowed'}>
                    <span />
                  </button>
                </div>
              </div>

              <div className="submenu-divider" />

              <button className="user-submenu-item schedule-link" onClick={() => { setShowPauseMenu(false); onOpenPreferences && onOpenPreferences() }}>
                <span>Set a notification schedule</span>
                <span className="new-badge">NEW</span>
              </button>
            </div>
          </div>
        )}
      </div>

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
