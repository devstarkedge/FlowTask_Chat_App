import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Globe, Trash2, Loader2 } from 'lucide-react'
import { directoriesAPI } from '../../services/directoriesAPI'
import { useAuthStore } from '../../stores/authStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useProfileStore } from '../../stores/profileStore'
import { ListSkeleton } from './Skeletons'
import EmptyState from './EmptyState'
import toast from 'react-hot-toast'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
]

export default function ExternalTab() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId, members } = useWorkspaceStore()

  const [externalUsers, setExternalUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [removingId, setRemovingId] = useState(null)
  const debounceRef = useRef(null)

  const currentMembership = members.find(
    (m) => (m.userId?._id || m.userId) === user?._id
  )
  const isAdmin = currentMembership?.role === 'owner' || currentMembership?.role === 'admin'

  const fetchExternal = useCallback(async (searchVal = '', statusVal = '') => {
    if (!activeWorkspaceId) return
    setLoading(true)
    try {
      const { data } = await directoriesAPI.getExternalUsers({
        search: searchVal,
        status: statusVal,
      })
      setExternalUsers(data.data?.users || data.data || [])
    } catch {
      setExternalUsers([])
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    fetchExternal(search, status)
  }, [activeWorkspaceId, status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchInput = (e) => {
    const val = e.target.value
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchExternal(val, status), 300)
  }

  const handleRemove = async (userId) => {
    if (!activeWorkspaceId || removingId) return
    if (!confirm('Remove this external user from the workspace?')) return

    setRemovingId(userId)
    try {
      await directoriesAPI.removeExternalUser(activeWorkspaceId, userId)
      setExternalUsers((prev) => prev.filter((u) => u._id !== userId && u.userId !== userId))
      toast.success('User removed')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove user')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div
        className="shrink-0 px-5 py-3 flex flex-wrap items-center gap-3"
        style={{ borderBottom: '1px solid var(--border-secondary)' }}
      >
        <div
          className="flex items-center gap-2 rounded-md px-3 py-1.5 flex-1 min-w-45"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-primary)' }}
        >
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={handleSearchInput}
            placeholder="Search external users"
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors"
              style={{
                background: status === f.value ? 'var(--accent-primary)' : 'var(--bg-card)',
                color: status === f.value ? '#fff' : 'var(--text-secondary)',
                border: status === f.value ? 'none' : '1px solid var(--border-primary)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <ListSkeleton count={6} />
        ) : externalUsers.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="No external users"
            description={search ? 'Try adjusting your search' : 'No external or guest users in this workspace'}
          />
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {externalUsers.map((eu) => {
              const name = eu.name || eu.displayName || eu.email || 'Unknown'
              const avatar = eu.avatar || eu.profilePicture
              const userId = eu._id || eu.userId
              const isActive = eu.status === 'active' || eu.isActive
              return (
                <div
                  key={userId}
                  onClick={() => useProfileStore.getState().openProfile(eu)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, var(--bg-card))')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Avatar */}
                  {avatar ? (
                    <img src={avatar} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: 'var(--accent-primary)', color: '#fff' }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-white)' }}>
                      {name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {eu.email && (
                        <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{eu.email}</span>
                      )}
                      {eu.invitedBy && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          · Invited by {eu.invitedBy}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={{
                      background: isActive ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
                      color: isActive ? '#22c55e' : '#eab308',
                    }}
                  >
                    {isActive ? 'Active' : 'Pending'}
                  </span>

                  {/* Remove */}
                  {isAdmin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove(userId) }}
                      disabled={removingId === userId}
                      className="p-1.5 rounded-md cursor-pointer transition-colors shrink-0"
                      style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
                      title="Remove external user"
                    >
                      {removingId === userId ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
