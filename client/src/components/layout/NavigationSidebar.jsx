import { useState, useMemo } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import {
  Hash, Lock, MessageCircle, Users, ChevronDown, ChevronRight,
  Plus, Search, Volume2, X, MessageSquareText, Bookmark,
  Send, Globe, Compass, Radio, AppWindow,
} from 'lucide-react'
import { Avatar } from '../chat/MemberAvatarGroup'
import CreateChannelModal from '../chat/CreateChannelModal'
import UserPickerModal from '../chat/UserPickerModal'
import PreferencesModal from '../chat/PreferencesModal'
import SetStatusModal from '../chat/SetStatusModal'
import WorkspaceSwitcher from '../workspace/WorkspaceSwitcher'
import CreateWorkspaceModal from '../workspace/CreateWorkspaceModal'
import JoinWorkspaceModal from '../workspace/JoinWorkspaceModal'
import WorkspaceSettingsModal from '../workspace/WorkspaceSettingsModal'
import { formatDistanceToNowStrict } from 'date-fns'

const CHANNEL_ICONS = {
  project: Hash,
  department: Users,
  team: Users,
  dm: MessageCircle,
  system: Volume2,
  public: Hash,
  private: Lock,
}

export default function NavigationSidebar({ onClose, onToggleAllThreads, onToggleNotifications, onToggleSaved }) {
  const { channels, activeChannelId, setActiveChannel, unreads } = useChannelStore()
  const { user } = useAuthStore()
  const { onlineUsers } = useChatStore()
  const [expandedSections, setExpandedSections] = useState({
    channels: true,
    privateChannels: true,
    dms: true,
    system: true,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)
  const [showJoinWorkspace, setShowJoinWorkspace] = useState(false)
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false)

  const toggleSection = (section) => {
    setExpandedSections((s) => ({ ...s, [section]: !s[section] }))
  }

  const projectChannels = channels.filter((c) => c.type === 'project' && !c.isArchived)
  const publicChannels = channels.filter((c) => c.type === 'public' && !c.isArchived)
  const privateChannels = channels.filter((c) => c.type === 'private' && !c.isArchived)
  const dmChannels = useMemo(() => {
    return channels
      .filter((c) => c.type === 'dm' && !c.isArchived)
      .map((c) => {
        if (c.dmRecipientId) return c
        const currentFlowTaskId = user?.flowTaskUserId || user?._id
        const recipientId = c.dmParticipants?.find((p) => p !== currentFlowTaskId) || null
        return { ...c, dmRecipientId: recipientId }
      })
  }, [channels, user])
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

  const sortChannels = (list, isDMSort = false) => {
    return [...list].sort((a, b) => {
      const aUnread = unreads[a._id] || 0
      const bUnread = unreads[b._id] || 0
      if (aUnread > 0 && bUnread === 0) return -1
      if (aUnread === 0 && bUnread > 0) return 1
      if (isDMSort) {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
        if (aTime !== bTime) return bTime - aTime
      }
      return (a.name || '').localeCompare(b.name || '')
    })
  }

  const handleSelectChannel = (channelId) => {
    setActiveChannel(channelId)
    onClose?.()
  }

  return (
    <nav
      className="flex flex-col h-full select-none overflow-hidden"
      aria-label="Channels sidebar"
      style={{
        width: '100%',
        minWidth: '100%',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-secondary)',
      }}
    >
      {/* Workspace Header */}
      <div
        className="px-4 flex items-center justify-between shrink-0"
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-secondary)',
        }}
      >
        <WorkspaceSwitcher
          onOpenCreate={() => setShowCreateWorkspace(true)}
          onOpenJoin={() => setShowJoinWorkspace(true)}
          onOpenSettings={() => setShowWorkspaceSettings(true)}
        />
        <div className="flex items-center gap-1">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md cursor-pointer transition-colors mobile-menu-btn"
              style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-1">
        {showSearch ? (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search conversation, contact, etc..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-sm"
              style={{ color: 'var(--text-primary)' }}
              autoFocus
            />
            <button
              onClick={() => { setShowSearch(false); setSearchQuery('') }}
              className="p-0.5 rounded cursor-pointer"
              style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm cursor-pointer transition-all"
            style={{
              color: 'var(--text-muted)',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-secondary)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-secondary)')}
          >
            <Search size={14} />
            <span>Search conversation, contact, etc...</span>
          </button>
        )}
      </div>

      {/* Quick Nav Section */}
      <div className="px-3 py-1">
        <NavButton icon={MessageSquareText} label="Threads" onClick={() => onToggleAllThreads?.()} />
        <NavButton icon={Radio} label="Huddles" onClick={() => {}} />
        <NavButton icon={Send} label="Drafts & Sent" onClick={() => {}} />
        <NavButton icon={Compass} label="Directories" onClick={() => {}} />
      </div>

      <div className="mx-3 my-1" style={{ height: 1, background: 'var(--border-secondary)' }} />

      {/* Starred & External */}
      <div className="px-3 py-1">
        <NavButton icon={Bookmark} label="Starred" onClick={() => onToggleSaved?.()} />
        <NavButton icon={Globe} label="External Connections" onClick={() => {}} />
      </div>

      <div className="mx-3 my-1" style={{ height: 1, background: 'var(--border-secondary)' }} />

      {/* Channel List */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {systemChannels.length > 0 && (
          <ChannelSection
            title="System"
            channels={sortChannels(filteredChannels(systemChannels))}
            expanded={expandedSections.system}
            onToggle={() => toggleSection('system')}
            activeId={activeChannelId}
            unreads={unreads}
            onSelect={handleSelectChannel}
            onlineUsers={onlineUsers}
          />
        )}

        <ChannelSection
          title="Channels"
          channels={sortChannels(filteredChannels([...publicChannels, ...projectChannels, ...deptChannels]))}
          expanded={expandedSections.channels}
          onToggle={() => toggleSection('channels')}
          activeId={activeChannelId}
          unreads={unreads}
          onSelect={handleSelectChannel}
          showAdd
          onAdd={() => setShowCreateChannel(true)}
          onlineUsers={onlineUsers}
        />

        {privateChannels.length > 0 && (
          <ChannelSection
            title="Private Channels"
            channels={sortChannels(filteredChannels(privateChannels))}
            expanded={expandedSections.privateChannels}
            onToggle={() => toggleSection('privateChannels')}
            activeId={activeChannelId}
            unreads={unreads}
            onSelect={handleSelectChannel}
            onlineUsers={onlineUsers}
          />
        )}

        <ChannelSection
          title="Direct Messages"
          channels={sortChannels(filteredChannels(dmChannels), true)}
          expanded={expandedSections.dms}
          onToggle={() => toggleSection('dms')}
          activeId={activeChannelId}
          unreads={unreads}
          onSelect={handleSelectChannel}
          showAdd
          onAdd={() => setShowUserPicker(true)}
          isDM
          onlineUsers={onlineUsers}
        />
      </div>

      <div className="mx-3 my-1" style={{ height: 1, background: 'var(--border-secondary)' }} />

      {/* Apps Section */}
      <div className="px-3 py-2 shrink-0">
        <NavButton icon={AppWindow} label="Apps" onClick={() => {}} />
      </div>

      {/* Modals */}
      {showCreateChannel && <CreateChannelModal onClose={() => setShowCreateChannel(false)} />}
      {showUserPicker && (
        <UserPickerModal
          onClose={() => setShowUserPicker(false)}
          onSelect={(channelId) => { setShowUserPicker(false); handleSelectChannel(channelId) }}
        />
      )}
      {showPreferences && <PreferencesModal onClose={() => setShowPreferences(false)} />}
      {showStatusModal && <SetStatusModal onClose={() => setShowStatusModal(false)} />}
      {showCreateWorkspace && <CreateWorkspaceModal onClose={() => setShowCreateWorkspace(false)} />}
      {showJoinWorkspace && <JoinWorkspaceModal onClose={() => setShowJoinWorkspace(false)} />}
      {showWorkspaceSettings && <WorkspaceSettingsModal onClose={() => setShowWorkspaceSettings(false)} />}
    </nav>
  )
}

/* ─── Nav Button ──────────────────────────────────────────────────────── */

function NavButton({ icon: Icon, label, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[13px] cursor-pointer transition-colors"
      style={{
        color: 'var(--text-secondary)',
        background: 'transparent',
        border: 'none',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={15} style={{ opacity: 0.6 }} />
      <span className="flex-1 text-left">{label}</span>
      {badge > 0 && <span className="badge badge-red">{badge}</span>}
    </button>
  )
}

/* ─── Channel Section ───────────────────────────────────────────────────── */

function ChannelSection({ title, channels, expanded, onToggle, activeId, unreads, onSelect, showAdd, onAdd, isDM, onlineUsers }) {
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-1 py-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider cursor-pointer"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{title}</span>
          {channels.length > 0 && (
            <span className="ml-1 font-normal opacity-60">{channels.length}</span>
          )}
        </button>
        {showAdd && (
          <button
            onClick={onAdd}
            className="p-0.5 rounded cursor-pointer transition-colors"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-white)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            title="Create channel"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-px">
          {channels.map((channel) => (
            <ChannelItem
              key={channel._id}
              channel={channel}
              isActive={channel._id === activeId}
              unread={unreads[channel._id] || 0}
              onClick={() => onSelect(channel._id)}
              isDM={isDM}
              onlineUsers={onlineUsers}
            />
          ))}
          {channels.length === 0 && (
            <p className="text-xs px-3 py-2" style={{ color: 'var(--text-muted)' }}>
              No {isDM ? 'conversations' : 'channels'} yet
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Channel Item ──────────────────────────────────────────────────────── */

function ChannelItem({ channel, isActive, unread, onClick, isDM, onlineUsers }) {
  const Icon = CHANNEL_ICONS[channel.type] || Hash
  const isOnline = isDM && onlineUsers?.has?.(channel.dmRecipientId)
  const isAway = isOnline && onlineUsers?.get?.(channel.dmRecipientId) === 'away'

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-1.5 w-full text-left rounded-lg cursor-pointer transition-all"
      style={{
        background: isActive ? 'var(--bg-active)' : 'transparent',
        color: isActive ? 'var(--accent-primary)' : unread > 0 ? 'var(--text-white)' : 'var(--text-secondary)',
        fontWeight: unread > 0 ? 600 : 400,
        border: 'none',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent' }}
    >
      {isDM ? (
        <div className="relative shrink-0">
          <Avatar
            member={{ name: channel.name, avatar: channel.avatar, onlineStatus: isOnline ? (isAway ? 'away' : 'online') : 'offline' }}
            size={28}
            showStatus={false}
          />
          {isOnline && (
            <span
              className="absolute rounded-full"
              style={{
                width: 8, height: 8,
                background: isAway ? 'var(--status-away, #f59e0b)' : 'var(--status-online)',
                border: '2px solid var(--bg-sidebar)',
                bottom: -1, right: -1,
              }}
            />
          )}
        </div>
      ) : (
        <Icon size={15} style={{ opacity: isActive ? 1 : 0.5, flexShrink: 0 }} />
      )}

      <div className="flex-1 min-w-0">
        <span className="truncate text-[13px] block">{channel.name}</span>
        {isDM && channel.lastMessagePreview && (
          <div className="flex items-center gap-1.5">
            <span
              className="truncate text-[11px] flex-1"
              style={{ color: 'var(--text-muted)', fontWeight: 400, lineHeight: '16px' }}
            >
              {channel.lastMessagePreview}
            </span>
            {channel.lastMessageAt && (
              <span
                className="text-[10px] shrink-0"
                style={{ color: 'var(--text-muted)', fontWeight: 400 }}
              >
                {(() => { const d = new Date(channel.lastMessageAt); return isNaN(d.getTime()) ? '' : formatDistanceToNowStrict(d, { addSuffix: false }) })()}
              </span>
            )}
          </div>
        )}
      </div>

      {unread > 0 && (
        <span className="badge badge-red" style={{ fontSize: 10, minWidth: 16, height: 16 }}>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
