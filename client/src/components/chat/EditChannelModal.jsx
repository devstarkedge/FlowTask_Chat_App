import { useState } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { X, Hash, Lock, Globe } from 'lucide-react'

export default function EditChannelModal({ channel, onClose }) {
  const { editChannel } = useChannelStore()
  const [name, setName] = useState(channel.name || '')
  const [description, setDescription] = useState(channel.description || '')
  const [topic, setTopic] = useState(channel.topic || '')
  const [visibility, setVisibility] = useState(channel.visibility || 'public')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isSystem = channel.type === 'system'
  const isProject = channel.type === 'project'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isSystem && !isProject && !name.trim()) {
      setError('Channel name is required')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const data = { description: description.trim(), topic: topic.trim() }
      // Only allow renaming for non-system, non-project channels
      if (!isSystem && !isProject) {
        data.name = name.trim()
        data.visibility = visibility
      }
      await editChannel(channel._id, data)
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update channel')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 0,
          maxWidth: 480,
          width: '90vw',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-secondary)' }}
        >
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Edit Channel
          </h2>
          <button
            onClick={onClose}
            aria-label="Close Edit Channel modal"
            className="p-1 rounded-md cursor-pointer transition-colors"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Channel Name */}
          <div>
            <label
              htmlFor="channel-name-input"
              className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              Name
            </label>
            <div className="relative">
              {visibility === 'private' ? (
                <Lock
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                />
              ) : (
                <Hash
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                />
              )}
              <input
                id="channel-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))}
                className="input-field pl-8"
                placeholder="channel-name"
                disabled={isSystem || isProject}
                maxLength={50}
              />
            </div>
            {(isSystem || isProject) && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                {isSystem ? 'System channel names cannot be modified' : 'Project channel names are synced from FlowTask'}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label
              className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              placeholder="What is this channel about?"
              rows={3}
              maxLength={250}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Topic */}
          <div>
            <label
              className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              Topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="input-field"
              placeholder="Current discussion topic"
              maxLength={250}
            />
          </div>

          {/* Visibility */}
          {!isSystem && !isProject && (
            <div>
              <label
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
                style={{ color: 'var(--text-secondary)' }}
              >
                Visibility
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className="flex-1 flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: visibility === 'public' ? 'var(--bg-active)' : 'var(--bg-tertiary)',
                    border: `1px solid ${visibility === 'public' ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                    color: 'var(--text-primary)',
                  }}
                >
                  <Globe size={16} style={{ color: visibility === 'public' ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                  <div className="text-left">
                    <div className="text-sm font-medium">Public</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Anyone can join</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className="flex-1 flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: visibility === 'private' ? 'var(--bg-active)' : 'var(--bg-tertiary)',
                    border: `1px solid ${visibility === 'private' ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                    color: 'var(--text-primary)',
                  }}
                >
                  <Lock size={16} style={{ color: visibility === 'private' ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                  <div className="text-left">
                    <div className="text-sm font-medium">Private</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Invite only</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm" style={{ color: 'var(--accent-red)' }}>
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary px-4 py-2 text-sm"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
