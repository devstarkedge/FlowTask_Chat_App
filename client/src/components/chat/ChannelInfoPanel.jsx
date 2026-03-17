import { useState } from 'react'
import { X, Users, Hash, Lock, Settings, UserPlus, LogOut } from 'lucide-react'
import SectionHeader from './SectionHeader'
import MemberItem from './MemberItem'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from './MemberAvatarGroup'
import EditChannelModal from './EditChannelModal'
import AddMemberModal from './AddMemberModal'

export default function ChannelInfoPanel({ channel, onOpenProfile }) {
  const { membersByChannel, isMembersLoading, setShowInfoPanel, addMember, removeMember, leaveChannel } = useChannelStore()
  const { onlineUsers } = useChatStore()
  const { user } = useAuthStore()
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  if (!channel) return null

  const members = membersByChannel[channel._id] || []
  const onlineMembers = members.filter((m) => m.onlineStatus === 'online')
  const offlineMembers = members.filter((m) => m.onlineStatus !== 'online')

  // Check if current user is owner or admin for this channel
  const myMembership = members.find((m) => m._id === user?._id)
  const isOwner = myMembership?.channelRole === 'owner' || channel.createdBy === user?._id
  const isAdmin = isOwner || myMembership?.channelRole === 'admin' || user?.role === 'admin'
  const isDM = channel.type === 'dm'
  const isSystem = channel.type === 'system'

  const handleRemoveMember = async (memberId) => {
    await removeMember(channel._id, memberId)
  }

  const handleLeave = async () => {
    await leaveChannel(channel._id)
    setShowInfoPanel(false)
  }

  return (
    <div
      className="flex flex-col h-full animate-slide-in-right"
      style={{
        width: 'var(--profile-panel-width)',
        minWidth: 'var(--profile-panel-width)',
        borderLeft: '1px solid var(--border-primary)',
        background: 'var(--bg-secondary)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 shrink-0 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-hover)' }}>
            {channel.visibility === 'private' || channel.type === 'private' ? (
              <Lock size={20} style={{ color: 'var(--text-muted)' }} />
            ) : (
              <Hash size={20} style={{ color: 'var(--text-muted)' }} />
            )}
          </div>

          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate" style={{ color: 'var(--text-white)' }}>{channel.name}</h2>
            <div className="flex items-center gap-3 text-xs mt-1">
              <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Users size={12} />
                <span>{members.length} members</span>
              </div>
              {channel.visibility === 'private' && (
                <div className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>Private</div>
              )}
              {channel.type && (
                <div className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>{channel.type}</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isDM && isAdmin && (
            <button onClick={() => setShowEditModal(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition shadow-sm" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              <Settings size={14} />
              Edit
            </button>
          )}

          {!isSystem && (
            <button onClick={() => setConfirmLeave(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition" style={{ background: 'transparent', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.08)' }}>
              <LogOut size={14} />
              Leave
            </button>
          )}

          <button onClick={() => setShowInfoPanel(false)} className="p-2 rounded-md hover:bg-(--bg-hover) transition">
            <X size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Channel description */}
        {channel.description && (
          <div className="mb-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{channel.description}</p>
          </div>
        )}

        {/* Topic */}
        {channel.topic && (
          <div className="mb-4">
            <SectionHeader title="Topic" subtitle={channel.visibility === 'private' ? 'Private' : ''} />
            <p className="mt-2 text-sm" style={{ color: 'var(--text-primary)' }}>{channel.topic}</p>
          </div>
        )}

        {/* Members */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader title={`Members (${members.length})`} />

            <div className="flex items-center gap-2">
              {isAdmin && !isDM && (
                <button onClick={() => setShowAddMember(true)} className="flex items-center gap-2 px-3 py-1 rounded-md text-sm" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                  <UserPlus size={14} />
                  Add
                </button>
              )}
              {isMembersLoading && (
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
              )}
            </div>
          </div>

          {/* Online */}
          {onlineMembers.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] font-medium uppercase mb-2" style={{ color: 'var(--status-online)' }}>Online — {onlineMembers.length}</p>
              <div className="flex flex-col gap-2">
                {onlineMembers.map((member) => (
                  <MemberItem
                    key={member._id || member.flowTaskUserId}
                    member={member}
                    onOpenProfile={onOpenProfile}
                    canRemove={isAdmin && member._id !== user?._id && !isDM && !isSystem}
                    onRemove={() => handleRemoveMember(member._id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Offline */}
          {offlineMembers.length > 0 && (
            <div>
              {onlineMembers.length > 0 && (
                <p className="text-[11px] font-medium uppercase mb-2" style={{ color: 'var(--text-muted)' }}>Offline — {offlineMembers.length}</p>
              )}
              <div className="flex flex-col gap-2">
                {offlineMembers.map((member) => (
                  <MemberItem
                    key={member._id || member.flowTaskUserId}
                    member={member}
                    onOpenProfile={onOpenProfile}
                    canRemove={isAdmin && member._id !== user?._id && !isDM && !isSystem}
                    onRemove={() => handleRemoveMember(member._id)}
                  />
                ))}
              </div>
            </div>
          )}

          {members.length === 0 && !isMembersLoading && (
            <div className="text-center py-6">
              <Users size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No members found</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showEditModal && (
        <EditChannelModal
          channel={channel}
          onClose={() => setShowEditModal(false)}
        />
      )}
      {showAddMember && (
        <AddMemberModal
          channel={channel}
          onClose={() => setShowAddMember(false)}
        />
      )}
    </div>
  )
}

