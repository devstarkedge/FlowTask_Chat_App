import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BarChart3, Users, Hash, Settings, Loader2, ChevronLeft,
  Shield, UserX, UserCheck, Archive, Trash2, Search,
} from 'lucide-react'
import { adminAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'channels', label: 'Channels', icon: Hash },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function AdminDashboard({ onClose }) {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 shrink-0"
        style={{ height: 'var(--header-height)', borderBottom: '1px solid var(--border-primary)' }}
      >
        <button
          onClick={onClose}
          className="p-1.5 rounded-md cursor-pointer transition-colors"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <ChevronLeft size={18} />
        </button>
        <Shield size={18} style={{ color: 'var(--accent-primary)' }} />
        <h2 className="font-bold text-sm" style={{ color: 'var(--text-white)' }}>Workspace Admin</h2>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Tab navigation */}
        <div className="flex flex-col w-48 shrink-0 py-2 px-2" style={{ borderRight: '1px solid var(--border-secondary)', background: 'var(--bg-sidebar)' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] cursor-pointer transition-colors text-left"
                style={{
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--bg-active)' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  border: 'none',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent' }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'channels' && <ChannelsTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </div>
  )
}

function OverviewTab() {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAPI.getAnalytics()
      .then(({ data }) => setAnalytics(data.data))
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
  if (!analytics) return null

  const stats = [
    { label: 'Total Users', value: analytics.totalUsers },
    { label: 'Active Users', value: analytics.activeUsers },
    { label: 'Total Channels', value: analytics.totalChannels },
    { label: 'Total Messages', value: analytics.totalMessages },
  ]

  return (
    <div>
      <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-white)' }}>Overview</h3>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-xl"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
          >
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{s.value ?? '—'}</p>
          </div>
        ))}
      </div>

      {analytics.dailyMessages?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>Messages (Last 7 Days)</h4>
          <div className="flex items-end gap-1" style={{ height: 100 }}>
            {analytics.dailyMessages.map((d) => {
              const max = Math.max(...analytics.dailyMessages.map((x) => x.count), 1)
              const height = Math.max((d.count / max) * 80, 4)
              return (
                <div key={d._id} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{d.count}</span>
                  <div
                    className="w-full rounded-sm"
                    style={{ height, background: 'var(--accent-primary)', opacity: 0.8 }}
                  />
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{d._id?.slice(5)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function UsersTab() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const debounceRef = useRef(null)

  // Debounce search input
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminAPI.listUsers({ search: debouncedSearch, page, limit: 20 })
      setUsers(data.data.users || [])
      setTotal(data.data.total || 0)
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, page])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleRoleChange = async (userId, role) => {
    try {
      await adminAPI.changeUserRole(userId, role)
      toast.success('Role updated')
      fetchUsers()
    } catch {
      toast.error('Failed to update role')
    }
  }

  const handleDeactivate = async (userId) => {
    if (userId === currentUser?._id) {
      toast.error('You cannot deactivate yourself')
      return
    }
    if (!window.confirm('Are you sure you want to deactivate this user?')) return
    try {
      await adminAPI.deactivateUser(userId)
      toast.success('User deactivated')
      fetchUsers()
    } catch {
      toast.error('Failed to deactivate')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-white)' }}>Users</h3>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({total})</span>
        <div className="flex-1" />
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-primary)' }}
        >
          <Search size={13} style={{ color: 'var(--text-muted)' }} />
          <input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-xs"
            style={{ color: 'var(--text-primary)', width: 140 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-secondary)' }}>
          {users.map((u) => (
            <div
              key={u._id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: '1px solid var(--border-secondary)', background: 'var(--bg-secondary)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{u.displayName || u.name}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
              </div>
              <select
                value={u.role || 'member'}
                onChange={(e) => handleRoleChange(u._id, e.target.value)}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={() => handleDeactivate(u._id)}
                title={u.isActive === false ? 'User deactivated' : 'Deactivate'}
                disabled={u._id === currentUser?._id || u.isActive === false}
                className="p-1.5 rounded cursor-pointer"
                style={{
                  color: u.isActive === false ? 'var(--text-muted)' : 'var(--accent-red)',
                  background: 'transparent',
                  border: 'none',
                  opacity: (u._id === currentUser?._id || u.isActive === false) ? 0.4 : 1,
                }}
              >
                {u.isActive === false ? <UserCheck size={14} /> : <UserX size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Page {page} of {Math.ceil(total / 20)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 rounded text-xs cursor-pointer"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', opacity: page <= 1 ? 0.4 : 1 }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(Math.ceil(total / 20), p + 1))}
              disabled={page >= Math.ceil(total / 20)}
              className="px-3 py-1 rounded text-xs cursor-pointer"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', opacity: page >= Math.ceil(total / 20) ? 0.4 : 1 }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ChannelsTab() {
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchChannels = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminAPI.listChannels({})
      setChannels(data.data.channels || [])
    } catch {
      toast.error('Failed to load channels')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchChannels() }, [fetchChannels])

  const handleArchive = async (chId, isArchived) => {
    try {
      if (isArchived) {
        await adminAPI.unarchiveChannel(chId)
        toast.success('Channel unarchived')
      } else {
        await adminAPI.archiveChannel(chId)
        toast.success('Channel archived')
      }
      fetchChannels()
    } catch {
      toast.error('Failed to update channel')
    }
  }

  const handleDelete = async (chId) => {
    if (!window.confirm('Delete this channel and all its messages? This cannot be undone.')) return
    try {
      await adminAPI.deleteChannel(chId)
      toast.success('Channel deleted')
      fetchChannels()
    } catch {
      toast.error('Failed to delete channel')
    }
  }

  return (
    <div>
      <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-white)' }}>Channels</h3>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-secondary)' }}>
          {channels.map((ch) => (
            <div
              key={ch._id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: '1px solid var(--border-secondary)', background: 'var(--bg-secondary)' }}
            >
              <Hash size={14} style={{ color: 'var(--text-muted)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ch.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {ch.type} · {ch.memberCount || ch.members?.length || 0} members
                  {ch.isArchived && ' · archived'}
                </p>
              </div>
              <button
                onClick={() => handleArchive(ch._id, ch.isArchived)}
                title={ch.isArchived ? 'Unarchive' : 'Archive'}
                className="p-1.5 rounded cursor-pointer"
                style={{ color: 'var(--accent-yellow)', background: 'transparent', border: 'none' }}
              >
                <Archive size={14} />
              </button>
              <button
                onClick={() => handleDelete(ch._id)}
                title="Delete"
                className="p-1.5 rounded cursor-pointer"
                style={{ color: 'var(--accent-red)', background: 'transparent', border: 'none' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SettingsTab() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAPI.getSettings()
      .then(({ data }) => setSettings(data.data || {}))
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await adminAPI.updateSettings(settings)
      toast.success('Settings saved')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>

  return (
    <div>
      <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-white)' }}>Workspace Settings</h3>
      {settings && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Workspace Name</label>
            <input
              value={settings.name || ''}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Description</label>
            <textarea
              value={settings.description || ''}
              onChange={(e) => setSettings({ ...settings, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="self-start px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: 'var(--accent-primary)', color: 'white', border: 'none', opacity: isSaving ? 0.6 : 1 }}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}
