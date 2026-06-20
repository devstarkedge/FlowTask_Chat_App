import { useState, useEffect, useRef, useCallback, forwardRef, useMemo } from 'react'
import { Search, UserPlus, ChevronDown, X, Users } from 'lucide-react'
import { VirtuosoGrid } from 'react-virtuoso'
import { directoriesAPI } from '../../services/directoriesAPI'
import { useAuthStore } from '../../stores/authStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useChatStore } from '../../stores/chatStore'
import { usePresenceStore } from '../../stores/presenceStore'
import { useProfileStore } from '../../stores/profileStore'
import useResponsive from '../../hooks/useResponsive'
import { CardSkeletonGrid } from './Skeletons'
import EmptyState from './EmptyState'
import InviteModal from './InviteModal'

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Most recommended' },
  { value: 'asc',         label: 'A → Z' },
  { value: 'desc',        label: 'Z → A' },
]

export default function PeopleTab() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId, members } = useWorkspaceStore()
  const { isMobile, isTablet } = useResponsive()

  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [sort, setSort]         = useState('recommended')
  const [showInvite, setShowInvite] = useState(false)
  const debounceRef = useRef(null)

  const currentMembership = members.find(
    (m) => (m.userId?._id || m.userId) === user?._id
  )
  const isAdmin =
    currentMembership?.role === 'owner' || currentMembership?.role === 'admin'

  const fetchUsers = useCallback(
    async (searchVal = '', sortVal = 'recommended') => {
      if (!activeWorkspaceId) return
      setLoading(true)
      try {
        const { data } = await directoriesAPI.getUsers({
          search: searchVal,
          sort:   sortVal,
          limit:  50,
        })
        let usersList = data.data?.users || data.data || []
        
        // Client-side sorting to ensure correct order
        if (sortVal === 'asc') {
          usersList = [...usersList].sort((a, b) => {
            const nameA = (a.name || a.displayName || '').toLowerCase()
            const nameB = (b.name || b.displayName || '').toLowerCase()
            return nameA.localeCompare(nameB)
          })
        } else if (sortVal === 'desc') {
          usersList = [...usersList].sort((a, b) => {
            const nameA = (a.name || a.displayName || '').toLowerCase()
            const nameB = (b.name || b.displayName || '').toLowerCase()
            return nameB.localeCompare(nameA)
          })
        }
        
        usePresenceStore.getState().updateFromUsers(usersList)
        setUsers(usersList)
      } catch {
        setUsers([])
      } finally {
        setLoading(false)
      }
    },
    [activeWorkspaceId]
  )

  useEffect(() => {
    fetchUsers(search, sort)
  }, [activeWorkspaceId, sort])

  const handleSearchInput = (e) => {
    const val = e.target.value
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchUsers(val, sort), 300)
  }

  const clearSearch = () => {
    setSearch('')
    fetchUsers('', sort)
  }

  const presenceMap = usePresenceStore((state) => state.presence)
  const onlineCount = users.filter((u) => {
    const status = presenceMap[u._id || u.userId]
    return status === 'online'
  }).length

  const gridCols = isMobile
    ? 'repeat(2, 1fr)'
    : isTablet
      ? 'repeat(3, 1fr)'
      : 'repeat(auto-fill, minmax(170px, 1fr))'

  // Stable List reference — only recreates when viewport bucket changes.
  // Previously defined inline, causing VirtuosoGrid to fully remount the list
  // on every render (e.g. when a card click triggers a parent re-render via profileStore).
  const GridList = useMemo(
    () =>
      forwardRef((props, ref) => (
        <div
          ref={ref}
          {...props}
          className="dir-people-grid"
          style={{ ...props.style, gridTemplateColumns: gridCols }}
        />
      )),
    [gridCols]
  )

  return (
    <div className="dir-people-root">
      {/* ── Header strip ── */}
      <div className="dir-people-header">
        <div className="dir-people-header-left">
          <div className="dir-people-stat">
            <Users size={13} className="dir-stat-icon" />
            <span>{users.length} members</span>
          </div>
          {onlineCount > 0 && (
            <div className="dir-people-stat online">
              <span className="dir-online-dot" />
              <span>{onlineCount} online</span>
            </div>
          )}
        </div>

        <div className="dir-people-controls">
          {/* Search */}
          <div className="dir-search-wrap">
            <Search size={14} className="dir-search-icon" />
            <input
              type="text"
              value={search}
              onChange={handleSearchInput}
              placeholder="Search people…"
              className="dir-search-input"
            />
            {search && (
              <button onClick={clearSearch} className="dir-search-clear">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="dir-select-wrap">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="dir-select"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="dir-select-arrow" />
          </div>

          {/* Invite */}
          {isAdmin && (
            <button onClick={() => setShowInvite(true)} className="dir-invite-btn">
              <UserPlus size={14} />
              <span>Invite</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="dir-people-body">
        {loading ? (
          <div className="dir-grid-scroll">
            <CardSkeletonGrid count={isMobile ? 6 : 12} columns={gridCols} />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            title="No people found"
            description={
              search
                ? 'Try adjusting your search'
                : 'No members in this workspace yet'
            }
          />
        ) : (
          <VirtuosoGrid
            totalCount={users.length}
            overscan={300}
            components={{ List: GridList }}
            itemContent={(index) => (
              <PersonCard
                person={users[index]}
                currentUserId={user?._id}
                index={index}
              />
            )}
          />
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => fetchUsers(search, sort)}
        />
      )}
    </div>
  )
}

function PersonCard({ person, currentUserId, index }) {
  const isCurrentUser =
    person._id === currentUserId || person.userId === currentUserId
  const name   = person.name || person.displayName || 'Unknown'
  const avatar = person.avatar || person.profilePicture
  const role   = person.role || 'member'
  const title  = person.title || ''
  const dept   = person.department || ''
  const formattedRole = role.charAt(0).toUpperCase() + role.slice(1)

  const presenceMap = usePresenceStore((s) => s.presence)
  const personId    = person._id || person.userId
  const liveStatus  = presenceMap[personId]
  const isOnline    = liveStatus === 'online'
  const isAway = liveStatus === 'away'

  const statusColor = isOnline
    ? 'var(--status-online,#22c55e)'
    : isAway
      ? 'var(--status-away,#f59e0b)'
      : 'var(--status-offline,#6b7280)'
  const statusLabel = isOnline ? 'online' : isAway ? 'away' : 'offline'
  const availabilityLabel = isOnline ? 'Active now' : isAway ? 'Away' : 'Offline'
  const secondaryText = title || dept || formattedRole

  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  const avatarGradient = `linear-gradient(135deg, hsl(${hue},60%,45%), hsl(${(hue + 40) % 360},70%,35%))`

  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    useProfileStore.getState().openProfile(person)
  }

  return (
    <div
      className="dir-person-card"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick(e)
        }
      }}
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
      role="button"
      tabIndex={0}
      aria-label={`Open profile for ${name}`}
    >
      {(role === 'owner' || role === 'admin') && (
        <div className="dir-person-ribbon">{role}</div>
      )}

      <div className="dir-person-avatar-wrap">
        {avatar ? (
          <img src={avatar} alt={name} className="dir-person-avatar-img" />
        ) : (
          <div
            className="dir-person-avatar-fallback"
            style={{ background: avatarGradient }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <span
          className="dir-person-status-dot"
          style={{ background: statusColor }}
          title={statusLabel}
        />
      </div>

      <div className="dir-person-info">
        <p className="dir-person-name">
          {name}
          {isCurrentUser && <span className="dir-person-you">you</span>}
        </p>
        <p className="dir-person-title">{secondaryText}</p>
      </div>

      <div className="dir-person-hover-cta">
        <span>View profile</span>
      </div>
    </div>
  )
}