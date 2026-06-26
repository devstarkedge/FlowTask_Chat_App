import { useState, useEffect } from 'react'
import { Hash, Lock, Users, Search, X } from 'lucide-react';
import Loader from '../shared/Loader';
import { channelAPI } from '../../services/api'
import { useChannelStore } from '../../stores/channelStore'
import toast from 'react-hot-toast'

const TYPE_ICONS = { project: Hash, department: Users, team: Users }

export default function ChannelBrowser({ onClose }) {
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all')
  const { setActiveChannel } = useChannelStore()

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      try {
        const { data } = await channelAPI.list()
        if (!cancelled) setChannels(data.data || [])
      } catch {
        toast.error('Failed to load channels')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [])

  const filtered = channels.filter((ch) => {
    if (ch.type === 'dm') return false
    if (filterType !== 'all' && ch.type !== filterType) return false
    if (searchQuery && !ch.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const handleJoin = (channelId) => {
    setActiveChannel(channelId)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 600, width: '100%', maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Hash size={18} style={{ color: 'var(--accent-primary)' }} />
            <h3 className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
              Channel Browser
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md cursor-pointer"
              style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Search + Filter */}
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-primary)' }}
            >
              <Search size={14} style={{ color: 'var(--text-muted)' }} />
              <input
                placeholder="Search channels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
                autoFocus
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-2 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              <option value="all">All Types</option>
              <option value="project">Project</option>
              <option value="department">Department</option>
              <option value="team">Team</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>

        {/* Channel List */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 130px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader size={20} color="var(--text-muted)" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>
              No channels found
            </p>
          ) : (
            filtered.map((ch) => {
              let Icon = TYPE_ICONS[ch.type] || Hash
              if (ch.visibility === 'private') Icon = Lock
              else if (ch.visibility === 'public') Icon = Hash
              return (
                <div
                  key={ch._id}
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid var(--border-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => handleJoin(ch._id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleJoin(ch._id) } }}
                >
                  <Icon size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {ch.name}
                      </span>
                      {ch.visibility === 'private' && <Lock size={11} style={{ color: 'var(--text-muted)' }} />}
                    </div>
                    {ch.topic && (
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {ch.topic}
                      </p>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {ch.memberCount ?? ch.members?.length ?? 0} members
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
