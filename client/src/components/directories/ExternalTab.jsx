import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Globe, Trash2, X } from 'lucide-react';
import Loader from '../shared/Loader';
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

  const clearSearch = () => {
    setSearch('')
    fetchExternal('', status)
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
    <div className="dir-ext-root">
      {/* Banner */}
      <div className="dir-ext-banner">
        <div className="dir-ext-banner-icon">
          <Globe size={16} />
        </div>
        <div>
          <h6 className="dir-ext-banner-title">External Members</h6>
          <p className="dir-ext-banner-sub">
            Guest and external members with access to this workspace
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="dir-ext-filters">
        <div className="dir-search-wrap" style={{ flex: 1, maxWidth: 340 }}>
          <Search size={14} className="dir-search-icon" />
          <input
            type="text"
            value={search}
            onChange={handleSearchInput}
            placeholder="Search external users…"
            className="dir-search-input"
          />
          {search && (
            <button onClick={clearSearch} className="dir-search-clear" aria-label="Clear search">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Status filter tabs */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {STATUS_FILTERS.map((f) => {
            const isSelected = status === f.value
            return (
              <button
                key={f.value}
                onClick={() => setStatus(f.value)}
                className="dir-ext-filter-btn"
                style={{
                  padding: '6px 12px',
                  borderRadius: '7px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: isSelected ? 'none' : '1px solid var(--border-primary)',
                  background: isSelected ? 'var(--accent-color, var(--accent-primary))' : 'var(--bg-card)',
                  color: isSelected ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease'
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* List */}
      <div className="dir-ext-body">
        {loading ? (
          <div style={{ padding: '8px 12px' }}>
            <ListSkeleton count={6} />
          </div>
        ) : externalUsers.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="No external users"
            description={search ? 'Try adjusting your search' : 'No external or guest users in this workspace'}
          />
        ) : (
          <div className="dir-ext-list">
            {externalUsers.map((eu, index) => {
              const name = eu.name || eu.displayName || eu.email || 'Unknown'
              const avatar = eu.avatar || eu.profilePicture
              const userId = eu._id || eu.userId
              const isActive = eu.status === 'active' || eu.isActive
              const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
              const avatarGradient = `linear-gradient(135deg, hsl(${hue},60%,45%), hsl(${(hue + 40) % 360},70%,35%))`

              return (
                <div
                  key={userId}
                  onClick={() => useProfileStore.getState().openProfile(eu)}
                  className="dir-ext-row"
                  style={{ animationDelay: `${Math.min(index * 25, 250)}ms` }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      useProfileStore.getState().openProfile(eu)
                    }
                  }}
                >
                  {/* Avatar Wrap */}
                  <div className="dir-ext-avatar-wrap">
                    {avatar ? (
                      <img src={avatar} alt={name} className="dir-ext-avatar" />
                    ) : (
                      <div
                        className="dir-ext-avatar dir-ext-avatar--fallback"
                        style={{ background: avatarGradient }}
                      >
                        {name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="dir-ext-globe-dot">
                      <Globe size={10} />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="dir-ext-info">
                    <h6 className="dir-ext-name">{name}</h6>
                    <div className="dir-ext-meta">
                      {eu.email && (
                        <span className="dir-ext-email" title={eu.email}>{eu.email}</span>
                      )}
                      {eu.invitedBy && (
                        <span className="dir-ext-inviter">
                          · Invited by {eu.invitedBy}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`dir-ext-status-badge ${isActive ? 'active' : 'pending'}`}>
                    {isActive ? 'Active' : 'Pending'}
                  </span>

                  {/* Remove */}
                  {isAdmin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove(userId) }}
                      disabled={removingId === userId}
                      className="dir-ext-remove-btn"
                      title="Remove external user"
                    >
                      {removingId === userId ? (
                        <Loader size={14} />
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
