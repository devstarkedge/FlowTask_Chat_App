import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Search, Forward, Loader2, Hash, MessageCircle, Lock, Check,
  Paperclip, FileText, Image, Film, Music, Archive, CheckSquare, Square,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useChannelStore } from '../../stores/channelStore'
import { useAuthStore } from '../../stores/authStore'
import { messageAPI } from '../../services/api'
import logger from '../../utils/logger'

/**
 * ForwardMessageModal — select one or more channels/DMs to forward message(s) to.
 * Accepts `messages` (array) for multi-message or `message` (single) for single-message forwarding.
 * DM names are derived from `channel.name` which is already decorated by the backend.
 */
export default function ForwardMessageModal({ message, messages, onClose, onForwardComplete }) {
  const { user } = useAuthStore()
  const channels = useChannelStore((s) => s.channels)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [isForwarding, setIsForwarding] = useState(false)
  const [mounted, setMounted] = useState(false)
  const searchInputRef = useRef(null)

  // Normalise to array
  const messagesToForward = useMemo(() => {
    if (messages && Array.isArray(messages) && messages.length > 0) return messages
    if (message) return [message]
    return []
  }, [message, messages])

  const isMulti = messagesToForward.length > 1

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
    searchInputRef.current?.focus()
  }, [])

  // Filter channels: include DMs, public, private, project, team, department
  const filteredChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return channels
      .filter((c) => !c.isArchived)
      .filter((c) => {
        if (!q) return true
        if (c.type === 'dm') {
          // Use channel.name (already decorated by backend) + avatar as fallback match
          const name = (c.name || '').toLowerCase()
          return name.includes(q)
        }
        return (c.name || '').toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (a.type === 'dm' && b.type !== 'dm') return -1
        if (a.type !== 'dm' && b.type === 'dm') return 1
        return (a.name || '').localeCompare(b.name || '')
      })
  }, [channels, searchQuery])

  const toggleSelection = useCallback((channelId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(channelId)) next.delete(channelId)
      else next.add(channelId)
      return next
    })
  }, [])

  const handleForward = useCallback(async () => {
    if (selectedIds.size === 0 || messagesToForward.length === 0) return
    setIsForwarding(true)
    try {
      const destinationIds = Array.from(selectedIds)
      if (isMulti) {
        const messageIds = messagesToForward.map(m => m._id)
        await messageAPI.forwardBulk(messageIds, destinationIds)
      } else {
        await messageAPI.forward(messagesToForward[0]._id, destinationIds)
      }
      const msgLabel = isMulti ? `${messagesToForward.length} messages` : 'Message'

      if (destinationIds.length === 1) {
        // Single destination: navigate to conversation (no toast — parent handles it)
        if (onForwardComplete) {
          onForwardComplete(destinationIds[0])
        } else {
          onClose()
        }
      } else {
        // Multiple destinations: stay on current chat, show toast
        toast.success(`${msgLabel} forwarded to ${destinationIds.length} conversations`)
        onClose()
      }
    } catch (err) {
      logger.error('Forward message failed:', err)
      toast.error(err.response?.data?.error?.message || 'Failed to forward message')
      setIsForwarding(false)
    }
  }, [selectedIds, messagesToForward, isMulti, onClose])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
  }

  // Build preview content for the modal
  const previewData = useMemo(() => {
    if (messagesToForward.length === 0) return { text: '', totalAttachments: 0 }
    if (messagesToForward.length === 1) {
      const msg = messagesToForward[0]
      const text = msg.content
        ? (msg.content.length > 150 ? msg.content.slice(0, 150) + '...' : msg.content)
        : ''
      return { text, totalAttachments: (msg.attachments || []).length, attachments: msg.attachments || [] }
    }
    // Multi-message summary
    const totalAttachments = messagesToForward.reduce(
      (sum, m) => sum + (m.attachments?.length || 0), 0
    )
    return { text: `${messagesToForward.length} messages selected`, totalAttachments, attachments: [] }
  }, [messagesToForward])

  const getChannelLabel = (c) => {
    // channel.name is already decorated by _decorateDMChannels (recipient name for DMs)
    if (c.type === 'dm') {
      return c.name || 'Direct Message'
    }
    return c.name || 'Unnamed'
  }

  const getChannelIcon = (c) => {
    if (c.type === 'dm') return <MessageCircle size={14} />
    if (c.type === 'private' || c.visibility === 'private') return <Lock size={14} />
    return <Hash size={14} />
  }

  if (messagesToForward.length === 0) return null

  return createPortal(
    <>
      <style>{`
        @keyframes fm-overlay-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fm-modal-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97) }
          to   { opacity: 1; transform: translateY(0)   scale(1) }
        }
        @keyframes fm-spin { to { transform: rotate(360deg) } }
        .fm-overlay {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          animation: fm-overlay-in 0.18s ease;
        }
        .fm-modal {
          width: 100%; max-width: 480px; margin: 0 1rem;
          max-height: min(78vh, 680px);
          display: flex; flex-direction: column;
          background: var(--bg-secondary, #1e1f24);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.05) inset;
          animation: fm-modal-in 0.22s cubic-bezier(0.16,1,0.3,1);
        }
        .fm-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .fm-title { font-size: 15px; font-weight: 700; color: var(--text-white, #f1f1f1); letter-spacing: -0.01em; margin: 0; }
        .fm-subtitle { font-size: 11px; color: var(--text-muted, #888); margin: 2px 0 0; }
        .fm-close {
          width: 28px; height: 28px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; cursor: pointer;
          color: var(--text-muted, #888);
          transition: background 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .fm-close:hover { background: rgba(255,255,255,0.08); color: var(--text-white, #f1f1f1); }
        .fm-preview {
          margin: 12px 16px 0;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .fm-preview-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--text-muted, #666);
          margin-bottom: 6px; display: flex; align-items: center; gap: 5px;
        }
        .fm-preview-text {
          font-size: 13px; color: var(--text-primary, #ddd);
          line-height: 1.5; word-break: break-word;
          max-height: 60px; overflow: hidden;
        }
        .fm-preview-attachments {
          display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
        }
        .fm-preview-att {
          display: flex; align-items: center; gap: 4px;
          font-size: 11px; color: var(--text-secondary, #aaa);
          padding: 3px 8px; border-radius: 6px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .fm-search-wrap {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0;
        }
        .fm-search-box {
          display: flex; align-items: center; gap: 8px;
          padding: 0 12px; height: 38px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .fm-search-box:focus-within {
          border-color: var(--accent-primary, #5865f2);
          box-shadow: 0 0 0 3px rgba(88,101,242,0.18);
        }
        .fm-search-input {
          flex: 1; background: transparent; border: none; outline: none;
          font-size: 13px; color: var(--text-primary, #ddd);
          caret-color: var(--accent-primary, #5865f2);
        }
        .fm-search-input::placeholder { color: var(--text-muted, #666); }
        .fm-selected-bar {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
          padding: 8px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0; min-height: 36px;
        }
        .fm-selected-chip {
          display: flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 500;
          padding: 3px 8px 3px 10px; border-radius: 20px;
          background: rgba(88,101,242,0.15);
          color: var(--accent-primary, #5865f2);
          border: 1px solid rgba(88,101,242,0.25);
        }
        .fm-selected-chip button {
          display: flex; align-items: center; justify-content: center;
          background: none; border: none; cursor: pointer;
          color: inherit; padding: 0; margin-left: 2px;
          opacity: 0.7; transition: opacity 0.15s;
        }
        .fm-selected-chip button:hover { opacity: 1; }
        .fm-selected-label { font-size: 11px; color: var(--text-muted, #666); }
        .fm-list { flex: 1; overflow-y: auto; padding: 6px 0; }
        .fm-list::-webkit-scrollbar { width: 4px; }
        .fm-list::-webkit-scrollbar-track { background: transparent; }
        .fm-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .fm-channel-btn {
          display: flex; align-items: center; gap: 11px;
          width: 100%; padding: 8px 16px;
          background: transparent; border: none;
          cursor: pointer; text-align: left;
          transition: background 0.1s;
        }
        .fm-channel-btn:hover { background: rgba(255,255,255,0.06); }
        .fm-channel-icon {
          width: 32px; height: 32px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.06);
          color: var(--text-secondary, #aaa);
          flex-shrink: 0;
        }
        .fm-channel-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          object-fit: cover; flex-shrink: 0;
        }
        .fm-channel-name {
          font-size: 13px; font-weight: 600;
          color: var(--text-white, #f1f1f1);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 220px;
        }
        .fm-channel-type { font-size: 11px; color: var(--text-muted, #888); }
        .fm-checkbox {
          width: 18px; height: 18px; border-radius: 5px;
          border: 2px solid rgba(255,255,255,0.2);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: all 0.15s;
        }
        .fm-checkbox.is-checked {
          background: var(--accent-primary, #5865f2);
          border-color: var(--accent-primary, #5865f2);
        }
        .fm-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 40px 20px; gap: 8px;
          color: var(--text-muted, #666);
        }
        .fm-empty-title { font-size: 13px; font-weight: 600; color: var(--text-secondary, #aaa); }
        .fm-empty-sub { font-size: 12px; color: var(--text-muted, #666); }
        .fm-footer {
          display: flex; align-items: center; justify-content: flex-end; gap: 10px;
          padding: 14px 20px;
          border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .fm-btn {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 13px; font-weight: 600;
          padding: 8px 18px; border-radius: 10px;
          border: none; cursor: pointer; transition: all 0.15s;
        }
        .fm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .fm-btn-cancel {
          background: rgba(255,255,255,0.07);
          color: var(--text-primary, #ddd);
        }
        .fm-btn-cancel:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
        .fm-btn-forward {
          background: var(--accent-primary, #5865f2);
          color: #fff;
        }
        .fm-btn-forward:hover:not(:disabled) { background: var(--accent-primary-hover, #4752c4); }
        .fm-spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.15);
          border-top-color: #fff;
          animation: fm-spin 0.7s linear infinite;
        }
      `}</style>

      <div
        className="fm-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        onKeyDown={handleKeyDown}
      >
        <div className="fm-modal" role="dialog" aria-modal="true" aria-label="Forward message">

          {/* Header */}
          <div className="fm-header">
            <div>
              <p className="fm-title">
                {isMulti ? `Forward ${messagesToForward.length} messages` : 'Forward message'}
              </p>
              <p className="fm-subtitle">Select conversations to forward to</p>
            </div>
            <button className="fm-close" onClick={onClose} aria-label="Close">
              <X size={15} />
            </button>
          </div>

          {/* Message Preview */}
          <div className="fm-preview">
            <div className="fm-preview-label">
              <Forward size={11} /> Forwarding
            </div>
            {previewData.text && (
              <div className="fm-preview-text">{previewData.text}</div>
            )}
            {previewData.totalAttachments > 0 && (
              <div className="fm-preview-attachments">
                {isMulti ? (
                  <span className="fm-preview-att">
                    <Paperclip size={11} />
                    {previewData.totalAttachments} attachment{previewData.totalAttachments !== 1 ? 's' : ''}
                  </span>
                ) : (
                  (previewData.attachments || []).map((att, i) => (
                    <span key={i} className="fm-preview-att">
                      <AttachmentIcon mimeType={att.mimeType} />
                      {att.originalName || att.fileName}
                    </span>
                  ))
                )}
              </div>
            )}
            {!previewData.text && previewData.totalAttachments === 0 && (
              <div className="fm-preview-text" style={{ opacity: 0.5 }}>Empty message</div>
            )}
          </div>

          {/* Search */}
          <div className="fm-search-wrap">
            <div className="fm-search-box">
              <Search size={13} style={{ color: 'var(--text-muted, #666)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                className="fm-search-input"
                type="text"
                placeholder="Search channels or people..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Selected chips */}
          {selectedIds.size > 0 && (
            <div className="fm-selected-bar">
              <span className="fm-selected-label">{selectedIds.size} selected</span>
              {Array.from(selectedIds).map((id) => {
                const ch = channels.find((c) => c._id === id)
                if (!ch) return null
                return (
                  <span key={id} className="fm-selected-chip">
                    {getChannelLabel(ch)}
                    <button onClick={() => toggleSelection(id)} aria-label="Remove">
                      <X size={11} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {/* Channel list */}
          <div className="fm-list">
            {filteredChannels.length === 0 && (
              <div className="fm-empty">
                <p className="fm-empty-title">
                  {searchQuery ? 'No channels found' : 'No channels available'}
                </p>
                {searchQuery && <p className="fm-empty-sub">Try a different search term</p>}
              </div>
            )}

            {filteredChannels.map((c) => {
              const isSelected = selectedIds.has(c._id)
              const hasAvatar = c.type === 'dm' && c.avatar
              return (
                <button
                  key={c._id}
                  className="fm-channel-btn"
                  onClick={() => toggleSelection(c._id)}
                >
                  {hasAvatar ? (
                    <img
                      className="fm-channel-avatar"
                      src={c.avatar}
                      alt={getChannelLabel(c)}
                    />
                  ) : (
                    <div className="fm-channel-icon">
                      {getChannelIcon(c)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fm-channel-name">{getChannelLabel(c)}</div>
                    <div className="fm-channel-type">
                      {c.type === 'dm' ? 'Direct message' : c.type === 'private' ? 'Private channel' : c.type}
                    </div>
                  </div>
                  <div className={`fm-checkbox${isSelected ? ' is-checked' : ''}`}>
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="fm-footer">
            <button
              className="fm-btn fm-btn-cancel"
              onClick={onClose}
              disabled={isForwarding}
            >
              Cancel
            </button>
            <button
              className="fm-btn fm-btn-forward"
              onClick={handleForward}
              disabled={selectedIds.size === 0 || isForwarding}
            >
              {isForwarding ? (
                <>
                  <div className="fm-spinner" />
                  Forwarding...
                </>
              ) : (
                <>
                  <Forward size={14} />
                  Forward{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

/** Small helper to pick the right icon for an attachment MIME type */
function AttachmentIcon({ mimeType }) {
  if (!mimeType) return <Paperclip size={11} />
  if (mimeType.startsWith('image/')) return <Image size={11} />
  if (mimeType.startsWith('video/')) return <Film size={11} />
  if (mimeType.startsWith('audio/')) return <Music size={11} />
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('7z'))
    return <Archive size={11} />
  return <FileText size={11} />
}
