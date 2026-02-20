import { useState } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import {
  Hash, Lock, MessageCircle, Users, ChevronDown, ChevronRight,
  Plus, Search, LogOut, Volume2, Bookmark, Bell,
  MoreHorizontal, PenSquare,
} from 'lucide-react'
import { Avatar } from '../chat/MemberAvatarGroup'
import CreateChannelModal from '../chat/CreateChannelModal'

const CHANNEL_ICONS = {
  project: Hash,
  department: Users,
  team: Users,
  dm: MessageCircle,
  system: Volume2,
}

export default function Sidebar() {
  const { channels, activeChannelId, setActiveChannel, unreads } = useChannelStore()
  const { user, logout } = useAuthStore()
  const { onlineUsers } = useChatStore()
  const [expandedSections, setExpandedSections] = useState({
    channels: true,
    dms: true,
    system: true,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showCreateChannel, setShowCreateChannel] = useState(false)

  const toggleSection = (section) => {
    setExpandedSections((s) => ({ ...s, [section]: !s[section] }))
  }

  const projectChannels = channels.filter((c) => c.type === 'project' && !c.isArchived)
  const dmChannels = channels.filter((c) => c.type === 'dm' && !c.isArchived)
  const systemChannels = channels.filter((c) => c.type === 'system' && !c.isArchived)
  const deptChannels = channels.filter(
    (c) => (c.type === 'department' || c.type === 'team') && !c.isArchived,
  )

  const filteredChannels = (list) => {
    if (!searchQuery) return list
    return list.filter((c) =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()),
    )
  }

  // Sort channels: those with unreads first, then alphabetically
  const sortChannels = (list) => {
    return [...list].sort((a, b) => {
      const aUnread = unreads[a._id] || 0
      const bUnread = unreads[b._id] || 0
      if (aUnread > 0 && bUnread === 0) return -1
      if (aUnread === 0 && bUnread > 0) return 1
      return (a.name || '').localeCompare(b.name || '')
    })
  }

  const totalUnread = Object.values(unreads).reduce((a, b) => a + b, 0)

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 'var(--sidebar-width)',
        minWidth: 'var(--sidebar-width)',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-secondary)',
      }}
    >
      {/* Workspace Header */}
      <div
        className="px-3 flex items-center justify-between"
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-secondary)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0 cursor-pointer group">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent-primary)' }}
          >
            <MessageCircle size={15} color="white" />
          </div>
          <span
            className="font-bold text-[15px] truncate"
            style={{ color: 'var(--text-white)' }}
          >
            FlowTask
          </span>
          <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
        </div>
        <div className="flex items-center gap-0.5">
          <SidebarIconBtn
            icon={PenSquare}
            title="New message"
            onClick={() => {}}
          />
        </div>
      </div>

      {/* Quick Nav */}
      <div className="px-2 pt-2 pb-1">
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <span>Search</span>
        </button>
      </div>

      {/* Search Input (toggleable) */}
      {showSearch && (
        <div className="px-3 pb-2">
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <Search size={13} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Filter channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-sm"
              style={{ color: 'var(--text-primary)' }}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Channel List */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {/* System Channels */}
        {systemChannels.length > 0 && (
          <ChannelSection
            title="System"
            channels={sortChannels(filteredChannels(systemChannels))}
            expanded={expandedSections.system}
            onToggle={() => toggleSection('system')}
            activeId={activeChannelId}
            unreads={unreads}
            onSelect={setActiveChannel}
            onlineUsers={onlineUsers}
          />
        )}

        {/* Project & Department Channels */}
        <ChannelSection
          title="Channels"
          channels={sortChannels(
            filteredChannels([...projectChannels, ...deptChannels]),
          )}
          expanded={expandedSections.channels}
          onToggle={() => toggleSection('channels')}
          activeId={activeChannelId}
          unreads={unreads}
          onSelect={setActiveChannel}
          showAdd
          onAdd={() => setShowCreateChannel(true)}
          onlineUsers={onlineUsers}
        />

        {/* Direct Messages */}
        <ChannelSection
          title="Direct Messages"
          channels={sortChannels(filteredChannels(dmChannels))}
          expanded={expandedSections.dms}
          onToggle={() => toggleSection('dms')}
          activeId={activeChannelId}
          unreads={unreads}
          onSelect={setActiveChannel}
          showAdd
          isDM
          onlineUsers={onlineUsers}
        />
      </div>

      {/* User Footer */}
      <div
        className="px-3 py-2.5 flex items-center gap-2"
        style={{ borderTop: '1px solid var(--border-secondary)' }}
      >
        <div className="relative">
          <Avatar
            member={{
              name: user?.name || '?',
              avatar: user?.avatar,
              onlineStatus: 'online',
            }}
            size={32}
            showStatus={true}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium truncate"
            style={{ color: 'var(--text-white)' }}
          >
            {user?.name || 'User'}
          </p>
          <div className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: '#44b700' }}
            />
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Active
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="p-1.5 rounded-md cursor-pointer transition-colors"
          title="Sign out"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <CreateChannelModal onClose={() => setShowCreateChannel(false)} />
      )}
    </div>
  )
}

// ─── Sidebar Icon Button ────────────────────────────────────────────────────

function SidebarIconBtn({ icon: Icon, title, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="relative p-1.5 rounded-md cursor-pointer transition-colors"
      style={{ color: 'var(--text-muted)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={16} />
      {badge > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-4 h-4 flex items-center justify-center text-[10px] font-bold rounded-full"
          style={{ background: 'var(--accent-red)', color: 'white' }}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

// ─── Channel Section Component ───────────────────────────────────────────────

function ChannelSection({
  title,
  channels,
  expanded,
  onToggle,
  activeId,
  unreads,
  onSelect,
  showAdd,
  onAdd,
  isDM,
  onlineUsers,
}) {
  const sectionUnread = channels.reduce(
    (sum, c) => sum + (unreads[c._id] || 0),
    0,
  )

  return (
    <div className="mb-1">
      <div className="flex items-center group">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 px-1.5 py-1 flex-1 text-left cursor-pointer"
        >
          {expanded ? (
            <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
          )}
          <span
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {title}
          </span>
          {!expanded && sectionUnread > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1"
              style={{ background: 'var(--accent-red)', color: 'white' }}
            >
              {sectionUnread}
            </span>
          )}
        </button>
        {showAdd && (
          <button
            onClick={onAdd}
            className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            title={`Add ${isDM ? 'direct message' : 'channel'}`}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-0.5">
          {channels.length === 0 ? (
            <p
              className="px-6 py-1.5 text-[11px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {isDM ? 'No conversations yet' : 'No channels'}
            </p>
          ) : (
            channels.map((channel) => (
              <ChannelItem
                key={channel._id}
                channel={channel}
                isActive={activeId === channel._id}
                unread={unreads[channel._id] || 0}
                onClick={() => onSelect(channel._id)}
                isDM={isDM}
                onlineUsers={onlineUsers}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Channel Item Component ──────────────────────────────────────────────────

function ChannelItem({ channel, isActive, unread, onClick, isDM, onlineUsers }) {
  const Icon = CHANNEL_ICONS[channel.type] || Hash
  const isPrivate = channel.visibility === 'private'

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3  w-full text-left rounded-md cursor-pointer transition-all group"
      style={{
        background: isActive ? 'var(--bg-active)' : 'transparent',
        color: isActive
          ? 'var(--text-white)'
          : unread > 0
            ? 'var(--text-white)'
            : 'var(--text-secondary)',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      {channel.type === 'dm' ? (
        <div className="relative">
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
            style={{ background: 'var(--accent-green)', color: 'white' }}
          >
            {channel.name?.[0]?.toUpperCase() || '?'}
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full"
            style={{
              background: '#44b700',
              border: '1.5px solid var(--bg-sidebar)',
            }}
          />
        </div>
      ) : (
        <Icon size={15} className="shrink-0" style={{ opacity: 0.7 }} />
      )}

      <span
        className={`flex-1 text-sm truncate ${unread > 0 ? 'font-semibold' : ''}`}
      >
        {channel.name || channel.slug}
      </span>

      {unread > 0 && (
        <span
          className="text-[11px] px-1.5 py-0.5 rounded-full min-w-5 text-center font-bold"
          style={{ background: 'var(--accent-red)', color: 'white' }}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
