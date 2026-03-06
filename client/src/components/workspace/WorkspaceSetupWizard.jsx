import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWorkspaceStore } from '../../stores/workspaceStore'
 import {
   ArrowRight, ArrowLeft, Check, Users, Settings, Zap, Loader2,
   Mail, Plus, X, Copy,
 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

const STEPS = [
  { id: 'info', label: 'Workspace Info', icon: Settings },
  { id: 'invite', label: 'Invite Team', icon: Users },
  { id: 'preferences', label: 'Preferences', icon: Settings },
  { id: 'integration', label: 'Integration', icon: Zap },
  { id: 'complete', label: 'Complete', icon: Check },
]

export default function WorkspaceSetupWizard({ onComplete }) {
  const { workspaceId: paramWorkspaceId } = useParams()
  const navigate = useNavigate()
  const { activeWorkspace, updateWorkspace, switchWorkspace } = useWorkspaceStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // Step 1: Info
  const [name, setName] = useState(activeWorkspace?.name || '')
  const [description, setDescription] = useState(activeWorkspace?.description || '')

  // Step 2: Invite
  const [emailInput, setEmailInput] = useState('')
  const [inviteEmails, setInviteEmails] = useState([])
  const [inviteRole, setInviteRole] = useState('member')
  const [isSendingInvites, setIsSendingInvites] = useState(false)

  // Step 3: Preferences
  const [defaultChannelVisibility, setDefaultChannelVisibility] = useState('public')
  const [notifyOnMention, setNotifyOnMention] = useState(true)
  const [notifyOnDM, setNotifyOnDM] = useState(true)

  // Step 4: Integration
  const [flowTaskEnabled, setFlowTaskEnabled] = useState(false)
  const [autoCreateChannels, setAutoCreateChannels] = useState(true)

  const id = paramWorkspaceId || activeWorkspace?._id

  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>No workspace selected.</p>
      </div>
    )
  }
  const handleNext = async () => {
    setIsLoading(true)
    if (currentStep === 0) {
      try {
        await updateWorkspace(id, { name: name.trim(), description: description.trim() })
      } catch (err) {
        toast.error('Failed to save workspace info')
        setIsLoading(false)
        return
      }
    }
    if (currentStep === 1) {
      // Send pending invites
      if (inviteEmails.length > 0) {
        setIsSendingInvites(true)
        for (const email of inviteEmails) {
          try {
            await api.post(`/workspaces/${id}/invite-email`, { email, role: inviteRole })
          } catch {
            // continue with remaining invites
          }
        }
        setIsSendingInvites(false)
        toast.success(`${inviteEmails.length} invite(s) sent`)
      }
    }
    setIsLoading(false)
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 0))
  }

  const handleComplete = async () => {
    // Switch to the workspace and navigate to chat
    await switchWorkspace(id)
    onComplete?.()
    navigate('/chat')
  }

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Invalid email address')
      return
    }
    if (inviteEmails.includes(email)) {
      toast.error('Email already added')
      return
    }
    setInviteEmails((prev) => [...prev, email])
    setEmailInput('')
  }

  const removeEmail = (email) => {
    setInviteEmails((prev) => prev.filter((e) => e !== email))
  }

  const handleCopyInviteCode = () => {
    if (activeWorkspace?.inviteCode) {
      navigator.clipboard.writeText(activeWorkspace.inviteCode)
      toast.success('Invite code copied!')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div
        className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
      >
        {/* Progress Bar */}
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between mb-6">
            {STEPS.map((step, i) => (
              <div key={step.id} className="flex items-center" style={{ flex: i < STEPS.length - 1 ? 1 : 0 }}>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{
                    background: i <= currentStep
                      ? 'var(--accent-primary)'
                      : 'var(--bg-tertiary)',
                    color: i <= currentStep ? 'white' : 'var(--text-muted)',
                    transition: 'all 0.3s',
                  }}
                >
                  {i < currentStep ? <Check size={14} /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="flex-1 h-0.5 mx-2"
                    style={{
                      background: i < currentStep ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      transition: 'background 0.3s',
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-white)' }}>
            {STEPS[currentStep].label}
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            {currentStep === 0 && 'Set up your workspace identity'}
            {currentStep === 1 && 'Invite your team members'}
            {currentStep === 2 && 'Configure default preferences'}
            {currentStep === 3 && 'Connect external tools'}
            {currentStep === 4 && 'Your workspace is ready!'}
          </p>
        </div>

        {/* Step Content */}
        <div className="px-6 pb-3" style={{ minHeight: 240 }}>
          {/* Step 1: Workspace Info */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Workspace Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Team"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-white)',
                  }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this workspace for?"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-white)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Step 2: Invite Team */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Invite by email
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                    placeholder="colleague@company.com"
                    className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--text-white)',
                    }}
                  />
                  <button
                    onClick={addEmail}
                    className="px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: 'var(--accent-primary)',
                      color: 'white',
                      border: 'none',
                    }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Pending emails */}
              {inviteEmails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {inviteEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                      style={{
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-secondary)',
                      }}
                    >
                      <Mail size={12} />
                      {email}
                      <button
                        onClick={() => removeEmail(email)}
                        className="p-0 cursor-pointer"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Role selector */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Default role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none cursor-pointer"
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
              </div>

              {/* Or share invite code */}
              {activeWorkspace?.inviteCode && (
                <div
                  className="p-3 rounded-lg"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}
                >
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    Or share the invite code:
                  </p>
                  <div className="flex items-center gap-2">
                    <code
                      className="flex-1 text-sm font-mono px-3 py-1.5 rounded"
                      style={{ background: 'var(--bg-primary)', color: 'var(--text-white)' }}
                    >
                      {activeWorkspace.inviteCode}
                    </code>
                    <button
                      onClick={handleCopyInviteCode}
                      className="p-2 rounded cursor-pointer transition-colors"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preferences */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Default channel visibility
                </label>
                <select
                  value={defaultChannelVisibility}
                  onChange={(e) => setDefaultChannelVisibility(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none cursor-pointer"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-white)',
                  }}
                >
                  <option value="public">Public — Anyone in the workspace can join</option>
                  <option value="private">Private — Invite only</option>
                </select>
              </div>

              <ToggleRow
                label="Notify on @mentions"
                description="Get notified when someone mentions you"
                checked={notifyOnMention}
                onChange={setNotifyOnMention}
              />
              <ToggleRow
                label="Notify on direct messages"
                description="Get notified for new direct messages"
                checked={notifyOnDM}
                onChange={setNotifyOnDM}
              />
            </div>
          )}

          {/* Step 4: Integration */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <ToggleRow
                label="FlowTask Integration"
                description="Connect with FlowTask for project management sync"
                checked={flowTaskEnabled}
                onChange={setFlowTaskEnabled}
              />
              {flowTaskEnabled && (
                <ToggleRow
                  label="Auto-create project channels"
                  description="Automatically create channels when new projects are created in FlowTask"
                  checked={autoCreateChannels}
                  onChange={setAutoCreateChannels}
                />
              )}
              {!flowTaskEnabled && (
                <div
                  className="p-4 rounded-lg text-center"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}
                >
                  <Zap size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    You can enable FlowTask integration later in workspace settings.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Complete */}
          {currentStep === 4 && (
            <div className="text-center py-6">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
                }}
              >
                <Check size={28} color="white" />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-white)' }}>
                You're all set!
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Your workspace "{name}" is ready. Start chatting with your team.
              </p>
              <button
                onClick={handleComplete}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold cursor-pointer transition-opacity"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
                  color: 'white',
                  border: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Open Workspace <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {currentStep < 4 && (
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderTop: '1px solid var(--border-secondary)' }}
          >
            <button
              onClick={currentStep === 0 ? () => navigate('/chat') : handleBack}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
              style={{
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: '1px solid var(--border-secondary)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <ArrowLeft size={14} />
              {currentStep === 0 ? 'Skip' : 'Back'}
            </button>
            <button
              onClick={handleNext}
              disabled={isLoading || isSendingInvites}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity disabled:opacity-50"
              style={{
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
              }}
            >
              {(isLoading || isSendingInvites) && <Loader2 size={14} className="animate-spin" />}
              {currentStep === 3 ? 'Finish' : 'Next'}
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg"
      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}
    >
      <div className="flex-1 min-w-0 mr-3">
        <p className="text-sm font-medium" style={{ color: 'var(--text-white)' }}>{label}</p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5.5 rounded-full cursor-pointer transition-colors shrink-0"
        style={{
          background: checked ? 'var(--accent-primary)' : 'var(--bg-primary)',
          border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
          padding: 0,
          width: 40, height: 22,
        }}
      >
        <div
          style={{
            position: 'absolute', top: 2, left: checked ? 20 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: 'white',
            transition: 'left 0.2s',
          }}
        />
      </button>
    </div>
  )
}
