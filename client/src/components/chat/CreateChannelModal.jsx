import { useState } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { X, Hash, Lock, Globe, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CreateChannelModal({ onClose }) {
  const { createChannel } = useChannelStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || name.trim().length < 2) {
      toast.error('Channel name must be at least 2 characters')
      return
    }

    setIsSubmitting(true)
    try {
      const channel = await createChannel({
        name: name.trim(),
        description: description.trim(),
        visibility,
      })
      toast.success(`Channel #${channel.name} created!`)
      onClose()
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Failed to create channel'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const slugPreview = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80)

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-content w-full max-w-md mx-4">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-secondary)' }}
        >
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>
              Create a channel
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Channels are where your team communicates
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md cursor-pointer transition-colors"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Channel Name */}
          <div>
            <label
              className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              Channel Name
            </label>
            <div
              className="flex items-center gap-2 rounded-md px-3 py-2"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-primary)',
                transition: 'border-color var(--transition-fast)',
              }}
            >
              <Hash size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. marketing-team"
                maxLength={80}
                autoFocus
                className="flex-1 bg-transparent border-none outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              {slugPreview && (
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Slug: <span style={{ color: 'var(--text-secondary)' }}>#{slugPreview}</span>
                </p>
              )}
              <p className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>
                {name.length}/80
              </p>
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              Description <span className="font-normal opacity-60">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about?"
              maxLength={500}
              rows={2}
              className="input-field resize-none"
              style={{ fontSize: 13 }}
            />
          </div>

          {/* Visibility */}
          <div>
            <label
              className="block text-xs font-semibold mb-2 uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              Visibility
            </label>
            <div className="space-y-2">
              <VisibilityOption
                icon={Globe}
                label="Public"
                description="Anyone in the workspace can view and join"
                value="public"
                selected={visibility === 'public'}
                onSelect={setVisibility}
              />
              <VisibilityOption
                icon={Lock}
                label="Private"
                description="Only invited members can access"
                value="private"
                selected={visibility === 'private'}
                onSelect={setVisibility}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name.trim().length < 2 || isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Creating...
                </div>
              ) : (
                'Create Channel'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function VisibilityOption({ icon: Icon, label, description, value, selected, onSelect }) {
  return (
    <label
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
      style={{
        background: selected ? 'rgba(18,100,163,0.1)' : 'transparent',
        border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
      }}
    >
      <input
        type="radio"
        name="visibility"
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        className="hidden"
      />
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        style={{
          background: selected ? 'rgba(18,100,163,0.15)' : 'var(--bg-hover)',
        }}
      >
        <Icon
          size={16}
          style={{ color: selected ? 'var(--accent-primary)' : 'var(--text-muted)' }}
        />
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-white)' }}>
          {label}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      </div>
    </label>
  )
}
