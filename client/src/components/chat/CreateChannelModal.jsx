import { useState } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { X, Hash, Lock, Globe } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * CreateChannelModal — modal form for creating custom channels.
 * Supports name, description, visibility (public/private).
 */
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-md mx-4"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>
            Create a channel
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md cursor-pointer transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Channel Name */}
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Channel Name
            </label>
            <div className="flex items-center gap-2 rounded-md px-3 py-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-primary)' }}>
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
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {name.length}/80 characters
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Description <span className="font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about?"
              maxLength={500}
              rows={2}
              className="w-full bg-transparent border-none outline-none text-sm rounded-md px-3 py-2 resize-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Visibility
            </label>
            <div className="space-y-2">
              <label
                className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors"
                style={{
                  background: visibility === 'public' ? 'var(--bg-active)' : 'transparent',
                  border: visibility === 'public' ? '1px solid var(--accent-primary)' : '1px solid transparent',
                }}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="hidden"
                />
                <Globe size={18} style={{ color: visibility === 'public' ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-white)' }}>Public</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Anyone in the workspace can view and join</p>
                </div>
              </label>

              <label
                className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors"
                style={{
                  background: visibility === 'private' ? 'var(--bg-active)' : 'transparent',
                  border: visibility === 'private' ? '1px solid var(--accent-primary)' : '1px solid transparent',
                }}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="hidden"
                />
                <Lock size={18} style={{ color: visibility === 'private' ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-white)' }}>Private</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Only invited members can access</p>
                </div>
              </label>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name.trim().length < 2 || isSubmitting}
              className="px-4 py-2 rounded-md text-sm font-bold cursor-pointer transition-colors disabled:opacity-40"
              style={{ background: 'var(--accent-green)', color: 'white' }}
            >
              {isSubmitting ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
