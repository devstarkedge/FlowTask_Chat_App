import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Hash, Lock, Plus, Users, ChevronDown, Loader2 } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import { directoriesAPI } from '../../services/directoriesAPI'
import { useAuthStore } from '../../stores/authStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { getChannelPath } from '../../utils/chatRoutes'
import { ListSkeleton } from './Skeletons'
import EmptyState from './EmptyState'
import CreateChannelModal from '../chat/CreateChannelModal'

const TYPE_OPTIONS = [
  { value: '', label: 'All channels' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
]

export default function ChannelsTab() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId, members } = useWorkspaceStore()
  const navigate = useNavigate()

  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState('asc')
  const [showCreate, setShowCreate] = useState(false)
  const [joiningId, setJoiningId] = useState(null)
  const debounceRef = useRef(null)

  const currentMembership = members.find(
    (m) => (m.userId?._id || m.userId) === user?._id
  )
  const isAdmin = currentMembership?.role === 'owner' || currentMembership?.role === 'admin'

  const fetchChannels = useCallback(async (searchVal = '', typeVal = '', sortVal = 'asc') => {
    if (!activeWorkspaceId) return
    setLoading(true)
    try {
      const { data } = await directoriesAPI.getChannels({
        search: searchVal,
        type: typeVal,
        sort: sortVal,
        limit: 100,
      })
      setChannels(data.data?.channels || data.data || [])
    } catch {
      setChannels([])
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    fetchChannels(search, type, sort)
  }, [activeWorkspaceId, type, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchInput = (e) => {
    const val = e.target.value
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchChannels(val, type, sort), 300)
  }

  const handleJoinLeave = async (channel) => {
    if (joiningId) return
    const wasJoined = channel.isJoined
    setJoiningId(channel._id)

    // Optimistic update
    setChannels((prev) =>
      prev.map((c) => (c._id === channel._id ? { ...c, isJoined: !wasJoined } : c))
    )

    try {
      if (wasJoined) {
        await directoriesAPI.leaveChannel(channel._id)
      } else {
        await directoriesAPI.joinChannel(channel._id)
      }
    } catch {
      // Revert on failure
      setChannels((prev) =>
        prev.map((c) => (c._id === channel._id ? { ...c, isJoined: wasJoined } : c))
      )
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Banner */}
      <div className="panel-header px-5 py-4">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>
            Organize your team's conversations
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Browse and discover channels in this workspace
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer shrink-0"
            style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none' }}
          >
            <Plus size={14} />
            Create Channel
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="shrink-0 px-5 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-md px-3 py-1.5 flex-1 min-w-45 panel-search">
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={handleSearchInput}
            placeholder="Search channels"
            className="flex-1 bg-transparent border-none outline-none text-sm panel-search-input"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        <div className="relative">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-md text-sm cursor-pointer"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-secondary)',
              outline: 'none',
            }}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="overflow-y-auto h-full custom-scrollbar">
            <ListSkeleton count={8} />
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={Hash}
            title="No channels found"
            description={search ? 'Try adjusting your search' : 'No channels in this workspace yet'}
          />
        ) : (
          <Virtuoso
            data={channels}
            overscan={150}
            style={{ height: '100%' }}
            itemContent={(index, ch) => (
              <div
                onClick={() => navigate(getChannelPath(activeWorkspaceId, ch._id))}
                className="panel-item flex items-center gap-3 mx-2 px-4 py-3 rounded-lg transition-colors cursor-pointer"
              >
                {/* Icon */}
                {ch.isPrivate ? (
                  <Lock size={16} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
                ) : (
                  <Hash size={16} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-white)' }}>
                      {ch.name}
                    </span>
                    {ch.isJoined && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                        style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                      >
                        Joined
                      </span>
                    )}
                  </div>
                  {ch.description && (
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {ch.description}
                    </p>
                  )}
                </div>

                {/* Member count */}
                <div className="flex items-center gap-1 shrink-0" style={{ color: 'var(--text-muted)' }}>
                  <Users size={12} />
                  <span className="text-xs">{ch.memberCount ?? '—'}</span>
                </div>

                {/* Join/Leave */}
                {!ch.isPrivate && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleJoinLeave(ch) }}
                    disabled={joiningId === ch._id}
                    className="px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors shrink-0"
                    style={{
                      background: ch.isJoined ? 'transparent' : 'var(--accent-primary)',
                      color: ch.isJoined ? 'var(--text-secondary)' : '#fff',
                      border: ch.isJoined ? '1px solid var(--border-primary)' : 'none',
                    }}
                  >
                    {joiningId === ch._id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : ch.isJoined ? 'Leave' : 'Join'}
                  </button>
                )}
              </div>
            )}
          />
        )}
      </div>

      {showCreate && <CreateChannelModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
