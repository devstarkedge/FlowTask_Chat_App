import { useState } from 'react'
import { X, Users, Hash, Lock, Settings, UserPlus, LogOut, Shield, Trash2 } from 'lucide-react'
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
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-secondary)',
        }}
      >
        <div className="flex items-center gap-2">
          <Hash size={14} style={{ color: 'var(--text-muted)' }} />
          <span
            className="font-bold text-sm truncate"
            style={{ color: 'var(--text-white)', maxWidth: 200 }}
          >
            {channel.name}
          </span>
        </div>
        <button
          onClick={() => setShowInfoPanel(false)}
          className="p-1.5 rounded-md cursor-pointer transition-colors"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Channel Info Section */}
        <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          {/* Channel Icon */}
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center mb-3"
            style={{ background: 'var(--bg-hover)' }}
          >
            <Hash size={24} style={{ color: 'var(--text-muted)' }} />
          </div>

          <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-white)' }}>
            {channel.name}
          </h3>

          {channel.description && (
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {channel.description}
            </p>
          )}

          {channel.topic && (
            <div className="mb-3">
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Topic
              </p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {channel.topic}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1.5">
              <Users size={12} />
              {members.length} members
            </span>
            {channel.visibility === 'private' && (
              <span className="flex items-center gap-1.5">
                <Lock size={12} />
                Private
              </span>
            )}
            {channel.type && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
              >
                {channel.type}
              </span>
            )}
          </div>

          {/* Channel Action Buttons */}
          {!isDM && (
            <div className="flex flex-wrap gap-2 mt-3">
              {isAdmin && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors"
                  style={{
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-secondary)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                >
                  <Settings size={12} />
                  Edit
                </button>
              )}
              {!isSystem && (
                <button
                  onClick={() => setConfirmLeave(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors"
                  style={{
                    color: 'var(--accent-red)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-secondary)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                >
                  <LogOut size={12} />
                  Leave
                </button>
              )}
            </div>
          )}

          {/* Leave Confirmation */}
          {confirmLeave && (
            <div
              className="mt-3 p-3 rounded-lg"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}
            >
              <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                Leave <strong>#{channel.name}</strong>?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleLeave}
                  className="btn-danger px-3 py-1.5 text-xs"
                >
                  Leave Channel
                </button>
                <button
                  onClick={() => setConfirmLeave(false)}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Members Section */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Members — {members.length}
            </p>
            <div className="flex items-center gap-1">
              {isAdmin && !isDM && (
                <button
                  onClick={() => setShowAddMember(true)}
                  className="p-1 rounded-md cursor-pointer transition-colors"
                  title="Add Member"
                  style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <UserPlus size={14} />
                </button>
              )}
              {isMembersLoading && (
                <div
                  className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
                />
              )}
            </div>
          </div>

          {/* Online Members */}
          {onlineMembers.length > 0 && (
            <div className="mb-3">
              <p
                className="text-[10px] font-medium uppercase tracking-wider mb-2"
                style={{ color: 'var(--status-online)' }}
              >
                Online — {onlineMembers.length}
              </p>
              <div className="flex flex-col gap-0.5">
                {onlineMembers.map((member) => (
                  <MemberRow
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

          {/* Offline Members */}
          {offlineMembers.length > 0 && (
            <div>
              {onlineMembers.length > 0 && (
                <p
                  className="text-[10px] font-medium uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Offline — {offlineMembers.length}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {offlineMembers.map((member) => (
                  <MemberRow
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
              <Users size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No members found
              </p>
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

function MemberRow({ member, onOpenProfile, canRemove, onRemove }) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <div className="group relative">
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <button
          onClick={() => onOpenProfile?.(member)}
          className="flex items-center gap-2.5 w-full text-left cursor-pointer"
          style={{ background: 'transparent', border: 'none' }}
        >
          <Avatar member={member} size={32} showStatus={true} />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-white)' }}>
              {member.name}
            </p>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
              {member.role
                ? member.role.charAt(0).toUpperCase() + member.role.slice(1)
                : member.email}
            </p>
          </div>

          {member.channelRole === 'owner' && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
              style={{ background: 'rgba(236,178,46,0.15)', color: 'var(--accent-yellow)' }}
            >
              Owner
            </span>
          )}
          {member.channelRole === 'admin' && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
              style={{ background: 'rgba(124,58,237,0.15)', color: 'var(--accent-purple)' }}
            >
              Admin
            </span>
          )}
        </button>

        {canRemove && member.channelRole !== 'owner' && (
          <button
            onClick={() => setConfirmRemove(true)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all shrink-0 cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--status-error)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            title="Remove member"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {confirmRemove && (
        <div
          className="mx-2 mb-1 p-2 rounded-md flex items-center gap-2"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <p className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>
            Remove <strong>{member.name}</strong>?
          </p>
          <button
            onClick={() => { onRemove?.(); setConfirmRemove(false) }}
            className="text-xs px-2 py-0.5 rounded font-medium cursor-pointer"
            style={{ background: 'var(--status-error)', color: 'white' }}
          >
            Remove
          </button>
          <button
            onClick={() => setConfirmRemove(false)}
            className="text-xs px-2 py-0.5 rounded cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
