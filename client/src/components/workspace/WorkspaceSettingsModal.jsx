import { useState, useEffect, useMemo } from 'react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useAuthStore } from '../../stores/authStore'
import {
  X, Settings, Users, Link2, Copy, RefreshCw, Loader2,
  Crown, Shield, UserMinus, ChevronDown, Trash2, Zap, Lock, Bell,
} from 'lucide-react'
import { Avatar } from '../chat/MemberAvatarGroup'
import toast from 'react-hot-toast'
import api from '../../services/api'

const TABS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'invite', label: 'Invite', icon: Link2 },
  { id: 'integrations', label: 'Integrations', icon: Zap },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
]

const ROLE_LABELS = {
  owner: { label: 'Owner', color: 'var(--accent-yellow)', icon: Crown },
  admin: { label: 'Admin', color: 'var(--accent-purple)', icon: Shield },
  member: { label: 'Member', color: 'var(--text-muted)', icon: null },
  guest: { label: 'Guest', color: 'var(--text-muted)', icon: null },
}

export default function WorkspaceSettingsModal({ onClose }) {
  const {
    activeWorkspace, activeWorkspaceId, members,
    fetchMembers, updateWorkspace, removeMember, updateMemberRole,
    regenerateInviteCode, deleteWorkspace,
  } = useWorkspaceStore()
  const { user } = useAuthStore()

  const [activeTab, setActiveTab] = useState('general')
  const [name, setName] = useState(activeWorkspace?.name || '')
  const [description, setDescription] = useState(activeWorkspace?.description || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  useEffect(() => {
    if (activeWorkspaceId) fetchMembers()
  }, [activeWorkspaceId, fetchMembers])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const currentUserRole = useMemo(() => {
    const membership = members.find(
      (m) => (m.userId?._id || m.userId) === user?._id
    )
    return membership?.role || 'member'
  }, [members, user])

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin'

  const handleSaveGeneral = async () => {
    if (!name.trim() || isSaving) return
    setIsSaving(true)
    try {
      await updateWorkspace(activeWorkspaceId, {
        name: name.trim(),
        description: description.trim(),
      })
    } catch { /* handled by store */ }
    setIsSaving(false)
  }

  const handleRegenerate = async () => {
    if (isRegenerating) return
    setIsRegenerating(true)
    try {
      await regenerateInviteCode()
    } catch { /* handled */ }
    setIsRegenerating(false)
  }

  const handleCopyInviteCode = () => {
    if (activeWorkspace?.inviteCode) {
      navigator.clipboard.writeText(activeWorkspace.inviteCode)
      toast.success('Invite code copied!')
    }
  }

  const handleDeleteWorkspace = async () => {
    if (!confirm(`Delete "${activeWorkspace?.name}"? This cannot be undone.`)) return
    try {
      await deleteWorkspace(activeWorkspaceId)
      onClose()
    } catch { /* handled */ }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col animate-fade-in"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-white)' }}>
            Workspace Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-0 px-5 shrink-0"
          style={{ borderBottom: '1px solid var(--border-secondary)' }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors cursor-pointer"
                style={{
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5" style={{ minHeight: 0 }}>
          {activeTab === 'general' && (
            <GeneralTab
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              canManage={canManage}
              isSaving={isSaving}
              onSave={handleSaveGeneral}
              onDelete={handleDeleteWorkspace}
              isOwner={currentUserRole === 'owner'}
              workspace={activeWorkspace}
            />
          )}

          {activeTab === 'members' && (
            <MembersTab
              members={members}
              currentUserId={user?._id}
              currentUserRole={currentUserRole}
              canManage={canManage}
              onRemove={removeMember}
              onUpdateRole={updateMemberRole}
            />
          )}

          {activeTab === 'invite' && (
            <InviteTab
              inviteCode={activeWorkspace?.inviteCode}
              canManage={canManage}
              isRegenerating={isRegenerating}
              onCopy={handleCopyInviteCode}
              onRegenerate={handleRegenerate}
            />
          )}

          {activeTab === 'integrations' && (
            <IntegrationsTab canManage={canManage} />
          )}

          {activeTab === 'security' && (
            <SecurityTab canManage={canManage} />
          )}

          {activeTab === 'notifications' && (
            <NotificationsTab />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── General Tab ──────────────────────────────────────────────────────────
function GeneralTab({ name, setName, description, setDescription, canManage, isSaving, onSave, onDelete, isOwner, workspace }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Workspace Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canManage}
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none disabled:opacity-60"
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-white)',
          }}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canManage}
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none disabled:opacity-60"
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-white)',
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Slug: <span className="font-mono">{workspace?.slug || '—'}</span>
          {' · '}
          Plan: <span className="capitalize">{workspace?.plan || 'free'}</span>
          {' · '}
          Members: {workspace?.memberCount || 0}
        </p>
      </div>

      {canManage && (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onSave}
            disabled={!name.trim() || isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors disabled:opacity-50"
            style={{ background: 'var(--accent-primary)', color: 'white', border: 'none' }}
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      )}

      {isOwner && (
        <div
          className="pt-4 mt-4"
          style={{ borderTop: '1px solid var(--border-secondary)' }}
        >
          <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--accent-red)' }}>
            Danger Zone
          </h4>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            style={{
              background: 'transparent',
              color: 'var(--accent-red)',
              border: '1px solid var(--accent-red)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-red)'
              e.currentTarget.style.color = 'white'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--accent-red)'
            }}
          >
            <Trash2 size={14} />
            Delete Workspace
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Members Tab ──────────────────────────────────────────────────────────
function MembersTab({ members, currentUserId, currentUserRole, canManage, onRemove, onUpdateRole }) {
  const [roleMenuId, setRoleMenuId] = useState(null)

  return (
    <div className="space-y-1">
      <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
        {members.length} {members.length === 1 ? 'member' : 'members'}
      </p>

      {members.map((m) => {
        const memberUser = m.userId && typeof m.userId === 'object' ? m.userId : { _id: m.userId }
        const memberId = memberUser._id || m.userId
        const isCurrentUser = memberId === currentUserId
        const roleInfo = ROLE_LABELS[m.role] || ROLE_LABELS.member
        const RoleIcon = roleInfo.icon

        return (
          <div
            key={m._id || memberId}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Avatar member={memberUser} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-white)' }}>
                {memberUser.name || m.displayName || 'Unknown'}
                {isCurrentUser && (
                  <span className="ml-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    (you)
                  </span>
                )}
              </p>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                {memberUser.email || ''}
              </p>
            </div>

            {/* Role badge */}
            <div className="relative flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: `${roleInfo.color}15`,
                  color: roleInfo.color,
                }}
              >
                {RoleIcon && <RoleIcon size={10} />}
                {roleInfo.label}
              </span>

              {/* Role / remove controls */}
              {canManage && !isCurrentUser && m.role !== 'owner' && (
                <div className="relative">
                  <button
                    onClick={() => setRoleMenuId(roleMenuId === memberId ? null : memberId)}
                    className="p-1 rounded cursor-pointer"
                    style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <ChevronDown size={14} />
                  </button>

                  {roleMenuId === memberId && (
                    <div
                      className="absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl z-50 overflow-hidden"
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                      }}
                    >
                      {['admin', 'member', 'guest'].filter((r) => r !== m.role).map((role) => (
                        <button
                          key={role}
                          onClick={() => {
                            onUpdateRole(memberId, role)
                            setRoleMenuId(null)
                          }}
                          className="w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors"
                          style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          Make {role}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          onRemove(memberId)
                          setRoleMenuId(null)
                        }}
                        className="w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
                        style={{ color: 'var(--accent-red)', background: 'transparent', border: 'none' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <UserMinus size={13} />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Invite Tab ───────────────────────────────────────────────────────────
function InviteTab({ inviteCode, canManage, isRegenerating, onCopy, onRegenerate }) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [isSendingInvite, setIsSendingInvite] = useState(false)
  const { activeWorkspaceId } = useWorkspaceStore()

  const handleSendEmailInvite = async () => {
    if (!inviteEmail.trim()) return
    setIsSendingInvite(true)
    try {
      await api.post(`/workspaces/${activeWorkspaceId}/invite-email`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      })
      toast.success(`Invite sent to ${inviteEmail}`)
      setInviteEmail('')
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to send invite')
    }
    setIsSendingInvite(false)
  }
  return (
    <div className="space-y-6">
      {/* Email invite */}
      {canManage && (
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Invite by Email
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendEmailInvite()}
              placeholder="name@company.com"
              className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-white)',
              }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-2 py-2.5 rounded-lg text-sm outline-none cursor-pointer"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-white)',
              }}
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="guest">Guest</option>
            </select>
            <button
              onClick={handleSendEmailInvite}
              disabled={!inviteEmail.trim() || isSendingInvite}
              className="px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors disabled:opacity-50"
              style={{ background: 'var(--accent-primary)', color: 'white', border: 'none' }}
            >
              {isSendingInvite ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Invite Code
        </label>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Share this code with people you'd like to invite.
        </p>

        {inviteCode ? (
          <div className="flex items-center gap-2">
            <div
              className="flex-1 px-4 py-3 rounded-lg font-mono text-lg tracking-widest select-all"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-white)',
                textAlign: 'center',
                letterSpacing: '0.15em',
              }}
            >
              {inviteCode}
            </div>
            <button
              onClick={onCopy}
              className="p-3 rounded-lg cursor-pointer transition-colors"
              title="Copy invite code"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            >
              <Copy size={16} />
            </button>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No invite code generated yet.
          </p>
        )}
      </div>

      {canManage && (
        <button
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors disabled:opacity-50"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-secondary)',
          }}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-tertiary)'
          }}
        >
          {isRegenerating ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          {inviteCode ? 'Regenerate Code' : 'Generate Invite Code'}
        </button>
      )}
    </div>
  )
}

// ─── Integrations Tab ─────────────────────────────────────────────────────
function IntegrationsTab({ canManage }) {
  const [flowTaskConnected] = useState(!!import.meta.env.VITE_FLOWTASK_ENABLED)
  const [autoChannels, setAutoChannels] = useState(true)
  const [syncMembers, setSyncMembers] = useState(true)

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--text-white)' }}>
          FlowTask Integration
        </h4>
        <div
          className="flex items-center justify-between p-3 rounded-lg"
          style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: flowTaskConnected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              }}
            >
              <Zap size={16} style={{ color: flowTaskConnected ? '#10b981' : '#ef4444' }} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-white)' }}>FlowTask</p>
              <p className="text-[11px]" style={{ color: flowTaskConnected ? '#10b981' : '#ef4444' }}>
                {flowTaskConnected ? 'Connected' : 'Not connected'}
              </p>
            </div>
          </div>
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={{
              background: flowTaskConnected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: flowTaskConnected ? '#10b981' : '#ef4444',
            }}
          >
            {flowTaskConnected ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {flowTaskConnected && (
        <>
          <SettingsToggle
            label="Auto-create project channels"
            description="Automatically create channels for new FlowTask projects"
            checked={autoChannels}
            onChange={setAutoChannels}
            disabled={!canManage}
          />
          <SettingsToggle
            label="Sync team members"
            description="Automatically add FlowTask project members to channels"
            checked={syncMembers}
            onChange={setSyncMembers}
            disabled={!canManage}
          />
        </>
      )}
    </div>
  )
}

// ─── Security Tab ─────────────────────────────────────────────────────────
function SecurityTab({ canManage }) {
  const [requireVerification, setRequireVerification] = useState(true)
  const [sessionTimeout, setSessionTimeout] = useState('7d')

  return (
    <div className="space-y-6">
      <SettingsToggle
        label="Require email verification"
        description="New members must verify their email before accessing the workspace"
        checked={requireVerification}
        onChange={setRequireVerification}
        disabled={!canManage}
      />

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Session Timeout
        </label>
        <select
          value={sessionTimeout}
          onChange={(e) => setSessionTimeout(e.target.value)}
          disabled={!canManage}
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none cursor-pointer disabled:opacity-60"
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-white)',
          }}
        >
          <option value="1d">1 day</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="never">Never</option>
        </select>
      </div>

      <div
        className="p-3 rounded-lg"
        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Shield size={14} style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-white)' }}>Two-Factor Authentication</p>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Coming soon — enforce 2FA for all workspace members.</p>
      </div>
    </div>
  )
}

// ─── Notifications Tab ────────────────────────────────────────────────────
function NotificationsTab() {
  const [notifyMentions, setNotifyMentions] = useState(true)
  const [notifyDMs, setNotifyDMs] = useState(true)
  const [notifyThreads, setNotifyThreads] = useState(true)
  const [notifyTasks, setNotifyTasks] = useState(true)

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Configure default notification preferences for this workspace.
      </p>
      <SettingsToggle
        label="@Mentions"
        description="Notify when someone mentions you"
        checked={notifyMentions}
        onChange={setNotifyMentions}
      />
      <SettingsToggle
        label="Direct messages"
        description="Notify for new direct messages"
        checked={notifyDMs}
        onChange={setNotifyDMs}
      />
      <SettingsToggle
        label="Thread replies"
        description="Notify when someone replies to your thread"
        checked={notifyThreads}
        onChange={setNotifyThreads}
      />
      <SettingsToggle
        label="Task updates"
        description="Notify for FlowTask task assignments and updates"
        checked={notifyTasks}
        onChange={setNotifyTasks}
      />
    </div>
  )
}

// ─── Shared Toggle Component ──────────────────────────────────────────────
function SettingsToggle({ label, description, checked, onChange, disabled }) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg"
      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)', opacity: disabled ? 0.6 : 1 }}
    >
      <div className="flex-1 min-w-0 mr-3">
        <p className="text-sm font-medium" style={{ color: 'var(--text-white)' }}>{label}</p>
        {description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className="relative shrink-0 cursor-pointer disabled:cursor-not-allowed"
        style={{
          background: checked ? 'var(--accent-primary)' : 'var(--bg-primary)',
          border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
          borderRadius: 12, width: 40, height: 22, padding: 0,
        }}
      >
        <div
          style={{
            position: 'absolute', top: 2, left: checked ? 20 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: 'white', transition: 'left 0.2s',
          }}
        />
      </button>
    </div>
  )
}
