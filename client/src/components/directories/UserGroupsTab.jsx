import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, ChevronDown, ChevronRight, UsersRound, Users, X } from 'lucide-react'
import { directoriesAPI } from '../../services/directoriesAPI'
import { useProfileStore } from '../../stores/profileStore'
import { ListSkeleton } from './Skeletons'
import EmptyState from './EmptyState'

export default function UserGroupsTab() {
  const [groups, setGroups]               = useState([])
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState('')
  const [sort, setSort]                   = useState('asc')
  const [expandedId, setExpandedId]       = useState(null)
  const [expandedMembers, setExpandedMembers] = useState([])
  const [loadingMembers, setLoadingMembers]   = useState(false)
  const debounceRef = useRef(null)

  const fetchGroups = useCallback(async (searchVal = '', sortVal = 'asc') => {
    setLoading(true)
    try {
      const { data } = await directoriesAPI.getGroups({ search: searchVal, sort: sortVal })
      setGroups(data.data?.groups || data.data || [])
    } catch {
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups(search, sort)
  }, [sort]) // eslint-disable-line

  const handleSearchInput = (e) => {
    const val = e.target.value
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchGroups(val, sort), 300)
  }

  const clearSearch = () => {
    setSearch('')
    fetchGroups('', sort)
  }

  const handleToggleExpand = async (groupId) => {
    if (expandedId === groupId) {
      setExpandedId(null)
      setExpandedMembers([])
      return
    }
    setExpandedId(groupId)
    setLoadingMembers(true)
    try {
      const { data } = await directoriesAPI.getGroupById(groupId)
      setExpandedMembers(data.data?.members || data.data?.group?.members || [])
    } catch {
      setExpandedMembers([])
    } finally {
      setLoadingMembers(false)
    }
  }

  return (
    <div className="dir-groups-root">
      {/* Filters */}
      <div className="dir-groups-filters">
        <div className="dir-search-wrap" style={{ flex: 1, maxWidth: 340 }}>
          <Search size={14} className="dir-search-icon" />
          <input
            type="text"
            value={search}
            onChange={handleSearchInput}
            placeholder="Search user groups…"
            className="dir-search-input"
          />
          {search && (
            <button onClick={clearSearch} className="dir-search-clear">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="dir-select-wrap">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="dir-select"
          >
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
          </select>
          <ChevronDown size={13} className="dir-select-arrow" />
        </div>
      </div>

      {/* List */}
      <div className="dir-groups-body">
        {loading ? (
          <div style={{ padding: '8px 12px' }}>
            <ListSkeleton count={6} />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No user groups"
            description={search ? 'Try adjusting your search' : 'No user groups created yet'}
          />
        ) : (
          <div className="dir-groups-list">
            {groups.map((g, index) => {
              const isExpanded = expandedId === g._id
              const hue = [...(g.name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
              const accentColor = `hsl(${hue}, 55%, 52%)`

              return (
                <div
                  key={g._id}
                  className={`dir-group-item ${isExpanded ? 'dir-group-item--open' : ''}`}
                  style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                >
                  {/* Group row */}
                  <button
                    onClick={() => handleToggleExpand(g._id)}
                    className="dir-group-row"
                  >
                    {/* Icon */}
                    <div
                      className="dir-group-icon"
                      style={{
                        background: `hsl(${hue}, 55%, 52%, 0.12)`,
                        color: accentColor,
                        borderColor: `hsl(${hue}, 55%, 52%, 0.22)`,
                      }}
                    >
                      <UsersRound size={14} />
                    </div>

                    {/* Info */}
                    <div className="dir-group-info">
                      <div className="dir-group-name-row">
                        <span className="dir-group-name">{g.name}</span>
                        {g.handle && (
                          <span className="dir-group-handle">@{g.handle}</span>
                        )}
                      </div>
                      {g.description && (
                        <p className="dir-group-desc">{g.description}</p>
                      )}
                    </div>

                    {/* Member count */}
                    <div className="dir-group-meta">
                      <Users size={12} />
                      <span>{g.memberCount ?? g.members?.length ?? 0}</span>
                    </div>

                    {/* Chevron */}
                    <div className={`dir-group-chevron ${isExpanded ? 'dir-group-chevron--open' : ''}`}>
                      <ChevronRight size={14} />
                    </div>
                  </button>

                  {/* Expanded members panel */}
                  {isExpanded && (
                    <div className="dir-group-members">
                      {loadingMembers ? (
                        <div className="dir-group-members-loading">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="dir-group-member-skeleton">
                              <div className="dir-skeleton-circle" />
                              <div className="dir-skeleton-line" style={{ width: `${60 + i * 15}%` }} />
                            </div>
                          ))}
                        </div>
                      ) : expandedMembers.length === 0 ? (
                        <div className="dir-group-empty">No members in this group</div>
                      ) : (
                        <div className="dir-group-member-list">
                          {expandedMembers.map((m, mi) => {
                            const name = m.name || m.displayName || 'Unknown'
                            const avatar = m.avatar || m.profilePicture
                            const mhue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
                            return (
                              <div
                                key={m._id}
                                onClick={() => useProfileStore.getState().openProfile(m)}
                                className="dir-group-member-row"
                                style={{ animationDelay: `${mi * 25}ms` }}
                              >
                                {avatar ? (
                                  <img src={avatar} alt={name} className="dir-group-member-avatar" />
                                ) : (
                                  <div
                                    className="dir-group-member-avatar dir-group-member-avatar--fallback"
                                    style={{ background: `hsl(${mhue},55%,45%)` }}
                                  >
                                    {name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span className="dir-group-member-name">{name}</span>
                                {m.title && (
                                  <span className="dir-group-member-title">{m.title}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
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