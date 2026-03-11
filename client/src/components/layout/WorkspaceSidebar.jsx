import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Home, MessageSquare, Bell, FolderOpen, Clock, Wrench, Plus } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { Avatar } from '../chat/MemberAvatarGroup'
import Tooltip from '../ui/Tooltip'
import CreateMenu from '../ui/CreateMenu'
import UserProfileMenu from '../ui/UserProfileMenu'
import HoverPreview from './HoverPreview'

const NAV_ITEMS = [
  { id: 'home', icon: Home, label: 'Home', path: '' },
  { id: 'dms', icon: MessageSquare, label: 'DMs', path: '/dms' },
  { id: 'activity', icon: Bell, label: 'Activity', path: '/activity' },
  { id: 'files', icon: FolderOpen, label: 'Files', path: '/files' },
  { id: 'later', icon: Clock, label: 'Later', path: '/later' },
  { id: 'tools', icon: Wrench, label: 'Tools', path: '/tools' },
]

const WorkspaceSidebar = memo(function WorkspaceSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { workspaceId } = useParams()
  const { user } = useAuthStore()
  const unreadNotifications = useNotificationStore((s) => s.unreadCount)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [hoveredItem, setHoveredItem] = useState(null)
  const [hoverRect, setHoverRect] = useState(null)
  const hoverTimerRef = useRef(null)
  const createBtnRef = useRef(null)
  const avatarBtnRef = useRef(null)

  const basePath = `/workspace/${workspaceId}`

  const getActiveId = () => {
    const path = location.pathname.replace(basePath, '')
    if (path.startsWith('/dms') || path.startsWith('/dm/')) return 'dms'
    if (path.startsWith('/activity')) return 'activity'
    if (path.startsWith('/files')) return 'files'
    if (path.startsWith('/later')) return 'later'
    if (path.startsWith('/tools')) return 'tools'
    if (path === '' || path === '/' || path.startsWith('/channel/')) return 'home'
    return 'home'
  }

  const activeId = getActiveId()

  const handleNav = useCallback(
    (item) => {
      navigate(`${basePath}${item.path}`)
    },
    [navigate, basePath],
  )

  const handleHoverEnter = useCallback((id, e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    hoverTimerRef.current = setTimeout(() => {
      setHoveredItem(id)
      setHoverRect(rect)
    }, 400)
  }, [])

  const handleHoverLeave = useCallback(() => {
    clearTimeout(hoverTimerRef.current)
    setHoveredItem(null)
    setHoverRect(null)
  }, [])

  // Close menus on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowCreateMenu(false)
        setShowUserMenu(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <nav className="workspace-sidebar" aria-label="Workspace navigation">
        {/* Logo */}
        <div
          className="flex items-center justify-center mb-2 cursor-pointer"
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
          }}
          onClick={() => navigate(basePath)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>

        <div className="workspace-sidebar-divider" />

        {/* Nav Icons */}
        {NAV_ITEMS.map((item) => (
          <Tooltip key={item.id} label={item.label} position="right">
            <button
              className={`workspace-sidebar-icon ${activeId === item.id ? 'active' : ''}`}
              onClick={() => handleNav(item)}
              onMouseEnter={(e) => handleHoverEnter(item.id, e)}
              onMouseLeave={handleHoverLeave}
              aria-label={item.label}
            >
              <item.icon size={20} />
              {item.id === 'activity' && unreadNotifications > 0 && (
                <span className="badge-dot" />
              )}
            </button>
          </Tooltip>
        ))}

        <div className="flex-1" />

        {/* Create Button */}
        <div className="workspace-sidebar-divider" />
        <Tooltip label="Create new" position="right">
          <button
            ref={createBtnRef}
            className="workspace-sidebar-create"
            onClick={() => { setShowCreateMenu((s) => !s); setShowUserMenu(false) }}
            aria-label="Create new"
          >
            <Plus size={20} />
          </button>
        </Tooltip>

        {/* User Avatar */}
        <div
          ref={avatarBtnRef}
          className="workspace-sidebar-avatar"
          onClick={() => { setShowUserMenu((s) => !s); setShowCreateMenu(false) }}
        >
          <Avatar
            member={{ name: user?.name || '?', avatar: user?.avatar, onlineStatus: 'online' }}
            size={34}
            showStatus={false}
          />
          <span className="online-dot" />
        </div>
      </nav>

      {/* Hover Preview Panels */}
      {hoveredItem && hoverRect && ['dms', 'activity', 'files'].includes(hoveredItem) && (
        <HoverPreview
          section={hoveredItem}
          anchorRect={hoverRect}
          onClose={handleHoverLeave}
        />
      )}

      {/* Create Menu */}
      {showCreateMenu && (
        <CreateMenu
          anchorRef={createBtnRef}
          onClose={() => setShowCreateMenu(false)}
        />
      )}

      {/* User Profile Menu */}
      {showUserMenu && (
        <UserProfileMenu
          anchorRef={avatarBtnRef}
          onClose={() => setShowUserMenu(false)}
        />
      )}
    </>
  )
})

export default WorkspaceSidebar
