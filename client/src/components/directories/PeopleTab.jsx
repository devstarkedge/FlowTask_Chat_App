import { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { Search, UserPlus, ChevronDown } from 'lucide-react'
import { VirtuosoGrid } from 'react-virtuoso'
import { directoriesAPI } from '../../services/directoriesAPI'
import { useAuthStore } from '../../stores/authStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useChatStore } from '../../stores/chatStore'
import { useProfileStore } from '../../stores/profileStore'
import useResponsive from '../../hooks/useResponsive'
import { CardSkeletonGrid } from './Skeletons'
import EmptyState from './EmptyState'
import InviteModal from './InviteModal'

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Most recommended' },
  { value: 'asc', label: 'A → Z' },
  { value: 'desc', label: 'Z → A' },
]

export default function PeopleTab() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId, members } = useWorkspaceStore()
  const { isMobile, isTablet } = useResponsive()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recommended')
  const [showInvite, setShowInvite] = useState(false)
  const debounceRef = useRef(null)

  // Determine admin
  const currentMembership = members.find(
    (m) => (m.userId?._id || m.userId) === user?._id
  )
  const isAdmin = currentMembership?.role === 'owner' || currentMembership?.role === 'admin'

  const fetchUsers = useCallback(async (searchVal = '', sortVal = 'recommended') => {
    if (!activeWorkspaceId) return
    setLoading(true)
    try {
      const { data } = await directoriesAPI.getUsers({
        search: searchVal,
        sort: sortVal,
        limit: 50,
      })
      setUsers(data.data?.users || data.data || [])
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    fetchUsers(search, sort)
  }, [activeWorkspaceId, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchInput = (e) => {
    const val = e.target.value
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchUsers(val, sort), 300)
  }

  // Grid columns based on breakpoint
  const gridCols = isMobile
    ? 'repeat(1, 1fr)'
    : isTablet
      ? 'repeat(3, 1fr)'
      : 'repeat(auto-fill, minmax(190px, 1fr))'

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div
        className="shrink-0 px-5 py-3 flex flex-wrap items-center gap-3"
        style={{ borderBottom: '1px solid var(--border-secondary)' }}
      >
        {/* Search */}
        <div
          className="flex items-center gap-2 rounded-md px-3 py-1.5 flex-1 min-w-45"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-primary)' }}
        >
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={handleSearchInput}
            placeholder="Search people"
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-md text-sm cursor-pointer"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-secondary)',
              outline: 'none',
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
        </div>

        {/* Invite */}
        {isAdmin && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors"
            style={{
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
            }}
          >
            <UserPlus size={14} />
            Invite People
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="overflow-y-auto h-full custom-scrollbar">
            <CardSkeletonGrid count={isMobile ? 4 : 12} columns={gridCols} />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            title="No people found"
            description={search ? 'Try adjusting your search' : 'No members in this workspace yet'}
          />
        ) : (
          <VirtuosoGrid
            totalCount={users.length}
            overscan={200}
            components={{
              List: forwardRef((props, ref) => (
                <div
                  ref={ref}
                  {...props}
                  className="grid gap-4 p-4"
                  style={{ ...props.style, gridTemplateColumns: gridCols }}
                />
              )),
            }}
            itemContent={(index) => (
              <PersonCard person={users[index]} currentUserId={user?._id} />
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

function PersonCard({ person, currentUserId }) {
  const isCurrentUser = person._id === currentUserId || person.userId === currentUserId
  const name = person.name || person.displayName || 'Unknown'
  const avatar = person.avatar || person.profilePicture
  const role = person.role || 'member'
  const title = person.title || ''

  // Real-time online status from chatStore
  const onlineUsers = useChatStore((s) => s.onlineUsers)
  const personId = person._id || person.userId
  const liveStatus = onlineUsers.get(personId)
  const isOnline = liveStatus === 'online' || (!liveStatus && (person.isOnline || person.status === 'online'))
  const isAway = liveStatus === 'away'

  const handleClick = () => {
    useProfileStore.getState().openProfile(person)
  }

  return (
    <div
      onClick={handleClick}
      className="rounded-2xl overflow-hidden transition-all duration-200 hover:scale-[1.02] cursor-pointer group"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-secondary)',
      }}
    >
      <div className="p-4 flex flex-col items-center text-center">
        {/* Avatar */}
        <div className="relative mb-3">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className="w-20 h-20 rounded-full object-cover"
              style={{ border: '2px solid var(--border-secondary)' }}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
              style={{
                background: 'var(--accent-primary)',
                color: '#fff',
                border: '2px solid var(--border-secondary)',
              }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Online dot */}
          <span
            className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2"
            style={{
              background: isOnline
                ? 'var(--status-online, #22c55e)'
                : isAway
                  ? 'var(--status-away, #f59e0b)'
                  : 'var(--status-offline, #6b7280)',
              borderColor: 'var(--bg-card)',
            }}
          />
        </div>

        {/* Name */}
        <p
          className="text-sm font-semibold truncate max-w-full leading-tight"
          style={{ color: 'var(--text-white)' }}
        >
          {name}
          {isCurrentUser && (
            <span className="ml-1 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(you)</span>
          )}
        </p>

        {/* Title or role */}
        <p className="text-xs mt-0.5 truncate max-w-full" style={{ color: 'var(--text-secondary)' }}>
          {title || role}
        </p>
      </div>
    </div>
  )
}
