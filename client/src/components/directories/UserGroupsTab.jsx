import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, ChevronDown, ChevronRight, UsersRound, Users } from 'lucide-react'
import { directoriesAPI } from '../../services/directoriesAPI'
import { useProfileStore } from '../../stores/profileStore'
import { ListSkeleton } from './Skeletons'
import EmptyState from './EmptyState'

export default function UserGroupsTab() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('asc')
  const [expandedId, setExpandedId] = useState(null)
  const [expandedMembers, setExpandedMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
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
  }, [sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchInput = (e) => {
    const val = e.target.value
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchGroups(val, sort), 300)
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
            placeholder="Search user groups"
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

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
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Groups list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <ListSkeleton count={6} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No user groups"
            description={search ? 'Try adjusting your search' : 'No user groups created yet'}
          />
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {groups.map((g) => {
              const isExpanded = expandedId === g._id
              return (
                <div key={g._id}>
                  <button
                    onClick={() => handleToggleExpand(g._id)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer text-left"
                    style={{ background: isExpanded ? 'var(--bg-card)' : 'transparent', border: 'none' }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = 'var(--bg-hover, var(--bg-card))'
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
                    ) : (
                      <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-white)' }}>
                          {g.name}
                        </span>
                        {g.handle && (
                          <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                            @{g.handle}
                          </span>
                        )}
                      </div>
                      {g.description && (
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {g.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0" style={{ color: 'var(--text-muted)' }}>
                      <Users size={12} />
                      <span className="text-xs">{g.memberCount ?? g.members?.length ?? 0}</span>
                    </div>
                  </button>

                  {/* Expanded members */}
                  {isExpanded && (
                    <div
                      className="ml-8 mr-4 mb-2 rounded-lg overflow-hidden"
                      style={{ border: '1px solid var(--border-secondary)' }}
                    >
                      {loadingMembers ? (
                        <div className="px-4 py-3 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                          <div className="w-4 h-4 rounded-full shimmer" style={{ background: 'var(--bg-skeleton)' }} />
                          <div className="w-24 h-3 rounded shimmer" style={{ background: 'var(--bg-skeleton)' }} />
                        </div>
                      ) : expandedMembers.length === 0 ? (
                        <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                          No members in this group
                        </div>
                      ) : (
                        expandedMembers.map((m) => {
                          const name = m.name || m.displayName || 'Unknown'
                          const avatar = m.avatar || m.profilePicture
                          return (
                            <div
                              key={m._id}
                              onClick={() => useProfileStore.getState().openProfile(m)}
                              className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
                              style={{ borderBottom: '1px solid var(--border-secondary)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              {avatar ? (
                                <img src={avatar} alt={name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                  style={{ background: 'var(--accent-primary)', color: '#fff' }}
                                >
                                  {name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-sm truncate" style={{ color: 'var(--text-white)' }}>
                                {name}
                              </span>
                            </div>
                          )
                        })
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
