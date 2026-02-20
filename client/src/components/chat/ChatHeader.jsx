import { Hash, Lock, Users, MessageCircle, Search, Bell, Settings, Info, ChevronDown } from 'lucide-react'
import MemberAvatarGroup from './MemberAvatarGroup'
import { useChannelStore } from '../../stores/channelStore'

const TYPE_ICONS = {
  project: Hash,
  department: Users,
  team: Users,
  dm: MessageCircle,
  system: Hash,
}

export default function ChatHeader({ channel, onToggleSearch }) {
  const { membersByChannel, toggleInfoPanel } = useChannelStore()

  if (!channel) return null

  const Icon = TYPE_ICONS[channel.type] || Hash
  const members = membersByChannel[channel._id] || []
  const isDM = channel.type === 'dm'

  return (
    <div
      className="flex items-center px-4 gap-3 shrink-0 select-none"
      style={{
        height: 'var(--header-height)',
        borderBottom: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Channel Name */}
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <h2
          className="font-bold text-base truncate"
          style={{ color: 'var(--text-white)' }}
        >
          {channel.name || channel.slug}
        </h2>
        {channel.visibility === 'private' && (
          <Lock size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        )}
      </div>

      {/* Topic */}
      {channel.topic && (
        <>
          <div
            className="w-px self-stretch my-3"
            style={{ background: 'var(--border-primary)' }}
          />
          <span
            className="text-sm truncate"
            style={{ color: 'var(--text-muted)', maxWidth: 300 }}
          >
            {channel.topic}
          </span>
        </>
      )}

      <div className="flex-1" />

      {/* Members Avatar Group */}
      {!isDM && members.length > 0 && (
        <MemberAvatarGroup
          members={members}
          max={5}
          size={26}
          showStatus={true}
          onShowAll={toggleInfoPanel}
        />
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-0.5 ml-1">
        {!isDM && (
          <HeaderButton
            icon={Users}
            title="Members"
            label={members.length > 0 ? String(members.length) : undefined}
            onClick={toggleInfoPanel}
          />
        )}
        <HeaderButton icon={Search} title="Search" onClick={onToggleSearch} />
        <HeaderButton
          icon={Info}
          title="Channel details"
          onClick={toggleInfoPanel}
        />
      </div>
    </div>
  )
}

function HeaderButton({ icon: Icon, title, label, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 p-1.5 rounded-md cursor-pointer transition-colors"
      style={{ color: 'var(--text-muted)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={16} />
      {label && (
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
      )}
    </button>
  )
}
