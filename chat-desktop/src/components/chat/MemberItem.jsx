import React from 'react'
import { X } from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'
import { usePresenceStore } from '../../stores/presenceStore'

export default function MemberItem({ member, onOpenProfile, canRemove, onRemove }) {
  const presenceMap = usePresenceStore((s) => s.presence);
  const id = member?._id || member?.userId;
  const status = presenceMap[id] || presenceMap[member?.flowTaskUserId] || presenceMap[member?.chatUserId] || member?.onlineStatus || 'offline';
  const isOnline = status === 'online'
  const displayRole = member.workspaceRole || member.role || member.channelRole;

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-default ${member?.registrationStatus === 'faded' ? 'opacity-60' : 'hover:bg-(--bg-hover)'}`}>
      <button onClick={() => onOpenProfile?.(member)} className="flex items-center gap-3 w-full text-left" disabled={member?.registrationStatus === 'faded'}>
        <Avatar member={member} size={40} showStatus={member?.registrationStatus !== 'faded'} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-white)' }}>{member.name}</p>
            {member.registrationStatus === 'faded' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider" style={{ background: 'var(--bg-active)', color: 'var(--text-muted)' }}>
                Unregistered
              </span>
            )}
            {displayRole && member.registrationStatus !== 'faded' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
                {displayRole.charAt(0).toUpperCase() + displayRole.slice(1)}
              </span>
            )}
          </div>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{member.email || displayRole || ''}</p>
        </div>
      </button>
      <div className="flex items-center gap-2">
        {member?.registrationStatus !== 'faded' && (
          <span className="w-2 h-2 rounded-full" style={{ background: isOnline ? '#44b700' : 'transparent', border: isOnline ? 'none' : '1px solid var(--border-secondary)' }} />
        )}
        {canRemove && (
          <button onClick={onRemove} className="p-1 rounded-md text-muted hover:text-red-500 transition-colors" title="Remove member">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
