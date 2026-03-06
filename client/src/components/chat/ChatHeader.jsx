import { useMemo, useState, useRef } from 'react'
import { Hash, Lock, Users, MessageCircle, Search, Info, Menu, Pin, FileText } from 'lucide-react'
import MemberAvatarGroup from './MemberAvatarGroup'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { channelAPI } from '../../services/api'
import toast from 'react-hot-toast'

const TYPE_ICONS = {
  project: Hash,
  department: Users,
  team: Users,
  dm: MessageCircle,
  system: Hash,
}

const EMPTY_PINS = []

export default function ChatHeader({ channel, onToggleSearch, onOpenMobileSidebar, onTogglePins }) {
  const { membersByChannel, toggleInfoPanel, updateChannel } = useChannelStore()
  const pinnedMessages = useChatStore((s) => s.pinnedMessagesByChannel[channel?._id]) ?? EMPTY_PINS
  const [editingTopic, setEditingTopic] = useState(false)
  const [topicValue, setTopicValue] = useState('')
  const topicInputRef = useRef(null)

  if (!channel) return null

  const Icon = TYPE_ICONS[channel.type] || Hash
  const members = membersByChannel[channel._id] || []
  const isDM = channel.type === 'dm'
  const onlineCount = members.filter(m => m.onlineStatus === 'online').length

  const handleTopicClick = () => {
    setTopicValue(channel.topic || '')
    setEditingTopic(true)
    setTimeout(() => topicInputRef.current?.focus(), 0)
  }

  const handleTopicSave = async () => {
    setEditingTopic(false)
    if (topicValue === (channel.topic || '')) return
    try {
      await channelAPI.update(channel._id, { topic: topicValue })
      if (updateChannel) updateChannel(channel._id, { topic: topicValue })
    } catch {
      toast.error('Failed to update topic')
    }
  }

  return (
    <div
      className="flex items-center px-3 gap-2 shrink-0 select-none"
      style={{
        height: 'var(--header-height)',
        borderBottom: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Mobile Menu */}
      <button
        onClick={onOpenMobileSidebar}
        className="mobile-menu-btn p-1.5 rounded-md cursor-pointer transition-colors"
        style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Menu size={18} />
      </button>

      {/* Channel Name */}
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <h2
          className="font-bold text-[15px] truncate"
          style={{ color: 'var(--text-white)' }}
        >
          {channel.name || channel.slug}
        </h2>
        {channel.visibility === 'private' && (
          <Lock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        )}
      </div>

      {/* Topic — editable on click */}
      {!isDM && (
        <>
          <div className="w-px self-stretch my-3.5 hide-mobile" style={{ background: 'var(--border-secondary)' }} />
          {editingTopic ? (
            <input
              ref={topicInputRef}
              value={topicValue}
              onChange={(e) => setTopicValue(e.target.value)}
              onBlur={handleTopicSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.target.blur() }
                if (e.key === 'Escape') setEditingTopic(false)
              }}
              placeholder="Add a topic"
              className="text-xs hide-mobile bg-transparent outline-none"
              style={{ color: 'var(--text-primary)', maxWidth: 250, borderBottom: '1px solid var(--accent-primary)', padding: '1px 0' }}
            />
          ) : (
            <span
              role="button"
              tabIndex={0}
              className="text-xs truncate hide-mobile cursor-pointer hover:underline"
              style={{ color: 'var(--text-muted)', maxWidth: 250 }}
              onClick={handleTopicClick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTopicClick() } }}
              title={channel.topic || 'Click to add a topic'}
            >
              {channel.topic || 'Add a topic'}
            </span>
          )}
        </>
      )}

      <div className="flex-1" />

      {/* Members — desktop only */}
      {!isDM && members.length > 0 && (
        <div className="hide-mobile">
          <MemberAvatarGroup
            members={members}
            max={4}
            size={24}
            showStatus={true}
            onShowAll={toggleInfoPanel}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-0.5">
        {!isDM && (
          <HeaderBtn icon={Users} title="Members" label={members.length > 0 ? String(members.length) : undefined} onClick={toggleInfoPanel} />
        )}
        <HeaderBtn icon={Pin} title="Pinned messages" label={pinnedMessages.length > 0 ? String(pinnedMessages.length) : undefined} onClick={onTogglePins} />
        <HeaderBtn icon={Search} title="Search" onClick={onToggleSearch} />
        <HeaderBtn icon={Info} title="Channel details" onClick={toggleInfoPanel} className="hide-mobile" />
      </div>
    </div>
  )
}

function HeaderBtn({ icon: Icon, title, label, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 p-1.5 rounded-md cursor-pointer transition-colors ${className}`}
      style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={16} />
      {label && (
        <span className="text-xs font-medium hide-mobile" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
      )}
    </button>
  )
}
