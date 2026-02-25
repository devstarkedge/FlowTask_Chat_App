import { useState, useRef, useCallback } from 'react'
import { X, Search, Loader2, MessageCircle } from 'lucide-react'
import { messageAPI } from '../../services/api'
import { useChannelStore } from '../../stores/channelStore'
import { format } from 'date-fns'
import { Avatar } from './MemberAvatarGroup'

export default function SearchPanel({ channelId, onClose, onJumpToMessage }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const { channels } = useChannelStore()
  const debounceRef = useRef(null)

  const channelMap = Object.fromEntries((channels || []).map((c) => [c._id, c]))

  const doSearch = useCallback(
    async (q) => {
      if (!q || q.trim().length < 2) {
        setResults([])
        setSearched(false)
        return
      }
      setLoading(true)
      setSearched(true)
      try {
        const { data } = await messageAPI.search(q.trim(), channelId || undefined)
        setResults(data.data?.messages || data.messages || data.data || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    },
    [channelId],
  )

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 400)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current)
      doSearch(query)
    }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="flex flex-col h-full animate-slide-in-right"
      style={{
        width: 380,
        minWidth: 380,
        borderLeft: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 shrink-0"
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          autoFocus
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={channelId ? 'Search in channel…' : 'Search all messages…'}
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)', border: 'none' }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setSearched(false) }}
            className="p-1 rounded-md cursor-pointer transition-colors"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={14} />
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 rounded-md cursor-pointer transition-colors"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={16} />
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>Searching…</p>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-12 animate-fade-in">
            <Search size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No messages found for "{query}"
            </p>
          </div>
        )}

        {!loading && !searched && (
          <div className="text-center py-12 animate-fade-in">
            <Search size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Type at least 2 characters to search
            </p>
          </div>
        )}

        {/* Result count */}
        {!loading && searched && results.length > 0 && (
          <p
            className="text-[11px] font-medium px-1 mb-2 animate-fade-in"
            style={{ color: 'var(--text-muted)' }}
          >
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </p>
        )}

        {!loading &&
          results.map((msg) => {
            const ch = channelMap[msg.channelId]
            const authorName = msg.authorId?.name || 'Unknown'
            const authorAvatar = msg.authorId?.avatar
            return (
              <button
                key={msg._id}
                onClick={() => onJumpToMessage?.(msg)}
                className="w-full text-left px-3 py-2.5 rounded-lg mb-1 cursor-pointer transition-colors animate-fade-in-up"
                style={{ color: 'var(--text-primary)', background: 'transparent', border: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Avatar
                    member={{ name: authorName, avatar: authorAvatar, onlineStatus: 'offline' }}
                    size={20}
                    showStatus={false}
                  />
                  <span className="text-sm font-bold truncate" style={{ color: 'var(--text-white)' }}>
                    {authorName}
                  </span>
                  {ch && !channelId && (
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded"
                      style={{ color: 'var(--text-link)', background: 'rgba(29,155,209,0.1)' }}
                    >
                      #{ch.name || ch.slug}
                    </span>
                  )}
                  <span className="text-[11px] ml-auto shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {format(new Date(msg.createdAt), 'MMM d, h:mm a')}
                  </span>
                </div>
                <p
                  className="text-sm leading-snug line-clamp-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {msg.content}
                </p>
              </button>
            )
          })}
      </div>
    </div>
  )
}
