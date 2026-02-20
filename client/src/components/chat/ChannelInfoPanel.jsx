import { X, Users, Hash, Lock, Clock, User } from 'lucide-react'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { Avatar } from './MemberAvatarGroup'

export default function ChannelInfoPanel({ channel }) {
  const { membersByChannel, isMembersLoading, setShowInfoPanel } = useChannelStore()
  const { onlineUsers } = useChatStore()

  if (!channel) return null

  const members = membersByChannel[channel._id] || []
  const onlineMembers = members.filter((m) => m.onlineStatus === 'online')
  const offlineMembers = members.filter((m) => m.onlineStatus !== 'online')

  return (
    <div
      className="flex flex-col h-full animate-slide-in"
      style={{
        width: 'var(--info-panel-width, 340px)',
        minWidth: 'var(--info-panel-width, 340px)',
        borderLeft: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <div className="flex items-center gap-2">
          <Hash size={16} style={{ color: 'var(--text-white)' }} />
          <span
            className="font-bold text-sm truncate"
            style={{ color: 'var(--text-white)', maxWidth: 220 }}
          >
            {channel.name}
          </span>
        </div>
        <button
          onClick={() => setShowInfoPanel(false)}
          className="p-1 rounded hover:opacity-80 cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Channel Info Section */}
        <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          {channel.description && (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                Description
              </p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {channel.description}
              </p>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1">
              <Users size={12} />
              {members.length} members
            </span>
            {channel.visibility === 'private' && (
              <span className="flex items-center gap-1">
                <Lock size={12} />
                Private
              </span>
            )}
            {channel.type && (
              <span className="capitalize">{channel.type} channel</span>
            )}
          </div>
        </div>

        {/* Members Section */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Members — {members.length}
            </p>
            {isMembersLoading && (
              <div
                className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
              />
            )}
          </div>

          {/* Online Members */}
          {onlineMembers.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: '#44b700' }}>
                Online — {onlineMembers.length}
              </p>
              <div className="flex flex-col gap-0.5">
                {onlineMembers.map((member) => (
                  <MemberRow key={member._id || member.flowTaskUserId} member={member} />
                ))}
              </div>
            </div>
          )}

          {/* Offline Members */}
          {offlineMembers.length > 0 && (
            <div>
              {onlineMembers.length > 0 && (
                <p className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  Offline — {offlineMembers.length}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {offlineMembers.map((member) => (
                  <MemberRow key={member._id || member.flowTaskUserId} member={member} />
                ))}
              </div>
            </div>
          )}

          {members.length === 0 && !isMembersLoading && (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
              No members found
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function MemberRow({ member }) {
  const isOnline = member.onlineStatus === 'online'

  return (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors cursor-default"
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Avatar member={member} size={32} showStatus={true} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-white)' }}>
          {member.name}
        </p>
        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
          {member.role || member.email}
          {member.source?.length > 0 && (
            <span className="ml-1 opacity-60">
              · {member.source.join(', ')}
            </span>
          )}
        </p>
      </div>

      {member.channelRole === 'owner' && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
          style={{ background: 'var(--bg-hover)', color: 'var(--accent-yellow)' }}
        >
          Owner
        </span>
      )}
    </div>
  )
}
