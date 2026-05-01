import { useEffect, useState, useRef, useCallback } from 'react'
import { Bookmark, X, Loader2, Search, Hash, MessageSquare, Clock, ChevronRight, Filter } from 'lucide-react'
import { format, isToday, isYesterday, isThisWeek } from 'date-fns'
import { Avatar } from './MemberAvatarGroup'
import { sanitizeHtml } from '../../utils/sanitize'
import { savedMessageAPI } from '../../services/api'
import toast from 'react-hot-toast'

/* ─── helpers ─────────────────────────────────────────────────────────── */
function groupByDate(messages) {
  const groups = {}
  messages.forEach((saved) => {
    const msg = saved.messageId
    if (!msg) return
    const d = new Date(msg.createdAt)
    let label = 'Older'
    if (!isNaN(d.getTime())) {
      if (isToday(d)) label = 'Today'
      else if (isYesterday(d)) label = 'Yesterday'
      else if (isThisWeek(d)) label = format(d, 'EEEE')
      else label = format(d, 'MMMM d, yyyy')
    }
    if (!groups[label]) groups[label] = []
    groups[label].push(saved)
  })
  return groups
}

function formatTime(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`
  return format(d, 'MMM d, h:mm a')
}

/* ─── Sub-components ──────────────────────────────────────────────────── */
function MessageCard({ saved, index, onJump, onUnsave, unsaving }) {
  const msg = saved.messageId
  if (!msg) return null
  const author = msg.senderSnapshot || msg.authorId || {}
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="smp-card"
      style={{ animationDelay: `${index * 40}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onJump?.({ channelId: msg.channelId, _id: msg._id })}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onJump?.({ channelId: msg.channelId, _id: msg._id })}
    >
      {/* accent stripe */}
      <div className="smp-card__stripe" />

      {/* avatar column */}
      <div className="smp-card__avatar">
        <Avatar
          member={{ name: author.name || 'Unknown', avatar: author.avatar }}
          size={34}
          showStatus={false}
        />
      </div>

      {/* body */}
      <div className="smp-card__body">
        <div className="smp-card__meta">
          <span className="smp-card__name">{author.name || 'Unknown'}</span>
          <div className="smp-card__meta-right">
            {msg.channelId && (
              <span className="smp-card__channel">
                <Hash size={10} strokeWidth={2.5} />
                channel
              </span>
            )}
            <span className="smp-card__time">
              <Clock size={10} strokeWidth={2} />
              {formatTime(msg.createdAt)}
            </span>
          </div>
        </div>

        <div className="smp-card__content message-content">
          {msg.htmlContent ? (
            <div
              className="smp-card__text"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.htmlContent) }}
            />
          ) : (
            <p className="smp-card__text">{msg.content || 'Attachment'}</p>
          )}
        </div>

        <div className="smp-card__footer">
          <span className="smp-card__jump-hint">
            <ChevronRight size={12} />
            Jump to message
          </span>
        </div>
      </div>

      {/* actions */}
      <div className={`smp-card__actions ${hovered ? 'is-visible' : ''}`}>
        <button
          className="smp-card__unsave-btn"
          onClick={(e) => { e.stopPropagation(); onUnsave(msg._id) }}
          disabled={unsaving}
          title="Remove bookmark"
        >
          {unsaving
            ? <Loader2 size={13} className="smp-spin" />
            : <Bookmark size={13} />}
        </button>
      </div>
    </div>
  )
}

function DateGroup({ label, messages, onJump, onUnsave, unsavingIds, baseIndex }) {
  return (
    <div className="smp-group">
      <div className="smp-group__header">
        <div className="smp-group__line" />
        <span className="smp-group__label">{label}</span>
        <div className="smp-group__line" />
      </div>
      {messages.map((saved, i) => (
        <MessageCard
          key={saved._id}
          saved={saved}
          index={baseIndex + i}
          onJump={onJump}
          onUnsave={(id) => onUnsave(id)}
          unsaving={unsavingIds.has(saved.messageId?._id)}
        />
      ))}
    </div>
  )
}

/* ─── Main Panel ──────────────────────────────────────────────────────── */
export default function SavedMessagesPanel({ onClose, onJumpToMessage }) {
  const [savedMessages, setSavedMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [unsavingIds, setUnsavingIds] = useState(new Set())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'text' | 'media'
  const searchRef = useRef(null)

  /* fetch */
  useEffect(() => {
    let cancelled = false
    async function fetch() {
      try {
        const { data } = await savedMessageAPI.list()
        if (!cancelled) {
          setSavedMessages(data.data?.messages || (Array.isArray(data.data) ? data.data : []))
        }
      } catch {
        toast.error('Failed to load saved messages')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [])

  /* unsave */
  const handleUnsave = useCallback(async (messageId) => {
    if (unsavingIds.has(messageId)) return
    setUnsavingIds((prev) => new Set(prev).add(messageId))
    try {
      await savedMessageAPI.toggle(messageId)
      setSavedMessages((prev) => prev.filter((s) => s.messageId?._id !== messageId))
      toast.success('Bookmark removed', { duration: 1500 })
    } catch {
      toast.error('Failed to remove bookmark')
    } finally {
      setUnsavingIds((prev) => { const n = new Set(prev); n.delete(messageId); return n })
    }
  }, [unsavingIds])

  /* filter + search */
  const filtered = savedMessages.filter((saved) => {
    const msg = saved.messageId
    if (!msg) return false
    const q = search.toLowerCase()
    const textMatch = !q
      || (msg.content || '').toLowerCase().includes(q)
      || (msg.htmlContent || '').toLowerCase().includes(q)
      || (msg.senderSnapshot?.name || '').toLowerCase().includes(q)
    if (filter === 'media') {
      return textMatch && (msg.attachments?.length > 0 || msg.files?.length > 0)
    }
    return textMatch
  })

  const groups = groupByDate(filtered)
  const groupKeys = Object.keys(groups)

  let cardIndex = 0

  return (
    <>
      {/* Injected styles */}
      <style>{`
        /* ── Panel shell ── */
        .smp-panel {
          display: flex;
          flex-direction: column;
          width: 380px;
          max-width: 100vw;
          height: 100%;
          background: var(--bg-primary);
          border-left: 1px solid var(--border-primary);
          animation: slideInRight var(--transition-slow) forwards;
          overflow: hidden;
        }

        /* ── Header ── */
        .smp-header {
          flex-shrink: 0;
          padding: 0 16px;
          background: var(--surface-primary, var(--bg-primary));
          border-bottom: 1px solid var(--border-primary);
        }

        .smp-header__top {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 52px;
        }

        .smp-header__icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 9px;
          background: color-mix(in srgb, var(--accent-primary) 14%, transparent);
          color: var(--accent-primary);
          flex-shrink: 0;
        }

        .smp-header__title {
          flex: 1;
          font-size: 15px;
          font-weight: 700;
          color: var(--text-white);
          letter-spacing: -0.02em;
        }

        .smp-header__count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 22px;
          padding: 0 6px;
          border-radius: 11px;
          background: var(--accent-primary);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          transition: transform 200ms cubic-bezier(0.34,1.56,0.64,1);
        }

        .smp-header__close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: background 140ms ease, color 140ms ease, transform 160ms ease;
        }

        .smp-header__close:hover {
          background: var(--surface-hover, var(--bg-hover));
          color: var(--text-primary);
          transform: rotate(90deg) scale(1.1);
        }

        /* ── Search bar ── */
        .smp-search {
          position: relative;
          padding-bottom: 12px;
        }

        .smp-search__icon {
          position: absolute;
          left: 11px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .smp-search__input {
          width: 100%;
          height: 34px;
          padding: 0 32px;
          border-radius: 8px;
          border: 1px solid var(--border-primary);
          background: var(--surface-secondary, var(--bg-secondary));
          color: var(--text-primary);
          font-size: 13px;
          font-family: var(--font-sans);
          outline: none;
          transition: border-color 180ms ease, box-shadow 180ms ease, background 160ms ease;
        }

        .smp-search__input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 14%, transparent);
          background: var(--surface-primary, var(--bg-primary));
        }

        .smp-search__input::placeholder { color: var(--text-muted); }

        .smp-search__clear {
          position: absolute;
          right: 9px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border: none;
          border-radius: 50%;
          background: var(--text-muted);
          color: var(--bg-primary);
          cursor: pointer;
          opacity: 0.7;
          padding: 0;
          transition: opacity 140ms ease, transform 140ms ease;
        }

        .smp-search__clear:hover { opacity: 1; transform: translateY(-50%) scale(1.15); }

        /* ── Filter chips ── */
        .smp-filters {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--border-primary);
          flex-shrink: 0;
          overflow-x: auto;
        }
        .smp-filters::-webkit-scrollbar { display: none; }

        .smp-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 20px;
          border: 1px solid var(--border-primary);
          background: transparent;
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          font-family: var(--font-sans);
          white-space: nowrap;
          transition: all 180ms cubic-bezier(0.34,1.2,0.64,1);
        }

        .smp-filter-chip:hover {
          background: var(--surface-hover, var(--bg-hover));
          color: var(--text-primary);
        }

        .smp-filter-chip.active {
          background: var(--accent-primary);
          color: #fff;
          border-color: var(--accent-primary);
          font-weight: 600;
          box-shadow: 0 2px 10px color-mix(in srgb, var(--accent-primary) 30%, transparent);
        }

        /* ── Scroll body ── */
        .smp-body {
          flex: 1;
          overflow-y: auto;
          padding: 8px 12px 16px;
          scroll-behavior: smooth;
        }

        /* ── Date group ── */
        .smp-group { margin-bottom: 4px; }

        .smp-group__header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 2px 8px;
        }

        .smp-group__line {
          flex: 1;
          height: 1px;
          background: var(--border-primary);
          opacity: 0.5;
        }

        .smp-group__label {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          color: var(--text-muted);
          white-space: nowrap;
          user-select: none;
        }

        /* ── Card ── */
        .smp-card {
          position: relative;
          display: flex;
          align-items: flex-start;
          gap: 11px;
          padding: 12px 13px;
          margin-bottom: 6px;
          border-radius: 12px;
          border: 1px solid var(--border-primary);
          background: var(--surface-secondary, var(--bg-secondary));
          cursor: pointer;
          overflow: hidden;
          outline: none;
          transition:
            transform 220ms cubic-bezier(0.34,1.2,0.64,1),
            box-shadow 220ms ease,
            border-color 220ms ease,
            background 160ms ease;
          animation: smp-card-in 320ms ease both;
        }

        @keyframes smp-card-in {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }

        /* left accent stripe */
        .smp-card__stripe {
          position: absolute;
          left: 0; top: 14%; bottom: 14%;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: var(--accent-primary);
          opacity: 0;
          transform: scaleY(0.3);
          transition: opacity 220ms ease, transform 260ms cubic-bezier(0.34,1.56,0.64,1);
        }

        .smp-card:hover .smp-card__stripe { opacity: 1; transform: scaleY(1); }

        .smp-card:hover {
          transform: translateY(-2px) translateX(2px);
          box-shadow: 0 8px 28px rgba(0,0,0,0.13), 0 2px 6px rgba(0,0,0,0.07);
          border-color: color-mix(in srgb, var(--accent-primary) 38%, var(--border-primary));
          background: var(--surface-primary, var(--bg-primary));
        }

        .smp-card:focus-visible {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 18%, transparent);
        }

        /* avatar */
        .smp-card__avatar {
          flex-shrink: 0;
          padding-top: 1px;
          transition: transform 220ms cubic-bezier(0.34,1.56,0.64,1);
        }
        .smp-card:hover .smp-card__avatar { transform: scale(1.06); }

        /* body */
        .smp-card__body { flex: 1; min-width: 0; }

        .smp-card__meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          margin-bottom: 5px;
        }

        .smp-card__name {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-white);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: -0.01em;
        }

        .smp-card__meta-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .smp-card__channel {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px 6px;
          border-radius: 5px;
          background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
          color: var(--accent-primary);
          font-size: 10.5px;
          font-weight: 600;
        }

        .smp-card__time {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        /* content */
        .smp-card__text {
          font-size: 13px;
          line-height: 1.55;
          color: var(--text-secondary);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0;
        }

        .smp-card__text p { margin: 0; }
        .smp-card__text strong { color: var(--text-white); font-weight: 600; }
        .smp-card__text em { color: var(--text-muted); }
        .smp-card__text code {
          background: var(--bg-hover);
          padding: 1px 4px;
          border-radius: 4px;
          font-size: 12px;
          font-family: var(--font-mono);
          color: var(--accent-primary);
        }

        /* footer hint */
        .smp-card__footer {
          margin-top: 7px;
          padding-top: 7px;
          border-top: 1px solid var(--border-secondary, var(--border-primary));
        }

        .smp-card__jump-hint {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--accent-primary);
          font-weight: 600;
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 180ms ease, transform 200ms ease;
        }

        .smp-card:hover .smp-card__jump-hint {
          opacity: 1;
          transform: translateX(0);
        }

        /* ── Action button ── */
        .smp-card__actions {
          position: absolute;
          top: 10px;
          right: 10px;
          opacity: 0;
          transform: translateY(-4px) scale(0.88);
          pointer-events: none;
          transition: opacity 180ms ease, transform 220ms cubic-bezier(0.34,1.56,0.64,1);
        }

        .smp-card__actions.is-visible {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }

        .smp-card__unsave-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid var(--border-primary);
          background: var(--surface-primary, var(--bg-primary));
          color: var(--accent-primary);
          cursor: pointer;
          padding: 0;
          transition: all 160ms cubic-bezier(0.34,1.3,0.64,1);
          backdrop-filter: blur(8px);
        }

        .smp-card__unsave-btn:hover {
          background: color-mix(in srgb, var(--accent-red) 14%, transparent);
          color: var(--accent-red);
          border-color: color-mix(in srgb, var(--accent-red) 36%, transparent);
          transform: scale(1.1);
        }

        .smp-card__unsave-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        /* ── Loading ── */
        .smp-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 60px 24px;
          animation: fadeIn var(--transition-normal) forwards;
        }

        .smp-loading__dots {
          display: flex;
          gap: 6px;
        }

        .smp-loading__dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--accent-primary);
          animation: smp-bounce 1.4s infinite ease-in-out both;
        }

        .smp-loading__dot:nth-child(1) { animation-delay: 0s; }
        .smp-loading__dot:nth-child(2) { animation-delay: 0.16s; }
        .smp-loading__dot:nth-child(3) { animation-delay: 0.32s; }

        @keyframes smp-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%           { transform: translateY(-8px); }
        }

        .smp-loading__text {
          font-size: 13px;
          color: var(--text-muted);
        }

        /* ── Empty state ── */
        .smp-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 58px 24px 40px;
          text-align: center;
          animation: fadeInUp var(--transition-slow) forwards;
        }

        .smp-empty__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 64px; height: 64px;
          border-radius: 20px;
          background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
          color: var(--accent-primary);
          margin-bottom: 18px;
          animation: smp-float 3.2s ease-in-out infinite;
          border: 1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent);
        }

        @keyframes smp-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          40%       { transform: translateY(-7px) rotate(-4deg); }
          65%       { transform: translateY(-4px) rotate(2deg); }
        }

        .smp-empty__title {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-white);
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }

        .smp-empty__desc {
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.6;
          margin: 0;
          max-width: 240px;
        }

        /* ── Footer ── */
        .smp-footer {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          border-top: 1px solid var(--border-primary);
          flex-shrink: 0;
          font-size: 11.5px;
          color: var(--text-muted);
        }

        .smp-footer__dot {
          width: 3px; height: 3px;
          border-radius: 50%;
          background: var(--border-primary);
        }

        /* ── Spin ── */
        .smp-spin { animation: smp-spin 700ms linear infinite; }
        @keyframes smp-spin { to { transform: rotate(360deg); } }

        /* ── Skeleton cards ── */
        .smp-skeleton {
          padding: 12px 13px;
          margin-bottom: 6px;
          border-radius: 12px;
          border: 1px solid var(--border-primary);
          background: var(--surface-secondary, var(--bg-secondary));
          display: flex;
          gap: 11px;
          animation: smp-card-in 300ms ease both;
        }

        .smp-skeleton__lines { flex: 1; display: flex; flex-direction: column; gap: 8px; padding-top: 3px; }

        .smp-skeleton__line {
          border-radius: 6px;
          background: linear-gradient(90deg,
            var(--surface-secondary, var(--bg-secondary)) 25%,
            var(--surface-hover, var(--bg-hover)) 50%,
            var(--surface-secondary, var(--bg-secondary)) 75%);
          background-size: 200% 100%;
          animation: smp-shimmer 1.6s infinite linear;
        }

        @keyframes smp-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }

        /* ── No-result ── */
        .smp-no-result {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 24px;
          gap: 10px;
          text-align: center;
          animation: fadeIn var(--transition-normal) forwards;
        }
        .smp-no-result p { font-size: 13px; color: var(--text-muted); margin: 0; }
      `}</style>

      <div className="smp-panel">
        {/* Header */}
        <div className="smp-header">
          <div className="smp-header__top">
            <div className="smp-header__icon-wrap">
              <Bookmark size={16} strokeWidth={2.5} />
            </div>
            <span className="smp-header__title">Saved Messages</span>
            {!loading && (
              <span className="smp-header__count">{filtered.length}</span>
            )}
            <button className="smp-header__close" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>

          {/* Search */}
          <div className="smp-search">
            <Search size={14} className="smp-search__icon" />
            <input
              ref={searchRef}
              className="smp-search__input"
              placeholder="Search saved messages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="smp-search__clear" onClick={() => setSearch('')}>
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Filter chips */}
        <div className="smp-filters">
          <Filter size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          {['all', 'text', 'media'].map((f) => (
            <button
              key={f}
              className={`smp-filter-chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'text' ? 'Text' : 'Media'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="smp-body">
          {loading ? (
            <div className="smp-loading">
              <div className="smp-loading__dots">
                <div className="smp-loading__dot" />
                <div className="smp-loading__dot" />
                <div className="smp-loading__dot" />
              </div>
              <span className="smp-loading__text">Loading saved messages…</span>
            </div>
          ) : savedMessages.length === 0 ? (
            <div className="smp-empty">
              <div className="smp-empty__icon">
                <Bookmark size={28} strokeWidth={1.5} />
              </div>
              <p className="smp-empty__title">No saved messages yet</p>
              <p className="smp-empty__desc">
                Hover any message and click the bookmark icon to save it here for later.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="smp-no-result">
              <Search size={28} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p>No messages match your search.</p>
            </div>
          ) : (
            groupKeys.map((label) => {
              const msgs = groups[label]
              const startIdx = cardIndex
              cardIndex += msgs.length
              return (
                <DateGroup
                  key={label}
                  label={label}
                  messages={msgs}
                  onJump={onJumpToMessage}
                  onUnsave={handleUnsave}
                  unsavingIds={unsavingIds}
                  baseIndex={startIdx}
                />
              )
            })
          )}
        </div>

        {/* Footer */}
        {!loading && savedMessages.length > 0 && (
          <div className="smp-footer">
            <Bookmark size={12} style={{ color: 'var(--accent-primary)' }} />
            <span>{savedMessages.length} saved</span>
            {search && (
              <>
                <div className="smp-footer__dot" />
                <span>{filtered.length} shown</span>
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}