import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AtSign,
  Bell,
  Clock,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Hash,
  Link as LinkIcon,
  Loader2,
  Lock,
  MessageSquare,
  Search,
  Settings,
  Star,
  User,
  Users,
  X,
} from 'lucide-react'
import { searchAPI } from '../../services/api'
import { Avatar } from '../chat/MemberAvatarGroup'
import logger from '../../utils/logger'
import './GlobalSearch.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_RESULTS = {
  topMatches: [],
  users: [],
  messages: [],
  channels: [],
  files: [],
  links: [],
  pages: [],
}

const SECTION_CONFIG = [
  { key: 'topMatches', title: 'Top Matches' },
  { key: 'users', title: 'People' },
  { key: 'messages', title: 'Messages' },
  { key: 'channels', title: 'Channels' },
  { key: 'files', title: 'Files' },
  { key: 'links', title: 'Links' },
  { key: 'pages', title: 'Quick Navigation' },
]

// ─── Local-Storage Recent Searches ───────────────────────────────────────────

function recentKey(userId, workspaceId) {
  return `global_search_recent_${userId || 'anon'}_${workspaceId || 'workspace'}`
}

function readRecent(userId, workspaceId) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(recentKey(userId, workspaceId)) || '[]',
    )
    return Array.isArray(parsed) ? parsed.slice(0, 10) : []
  } catch {
    return []
  }
}

function saveRecent(userId, workspaceId, query) {
  const value = query.trim()
  if (!value) return
  const next = [
    value,
    ...readRecent(userId, workspaceId).filter(
      (item) => item.toLowerCase() !== value.toLowerCase(),
    ),
  ].slice(0, 10)
  localStorage.setItem(recentKey(userId, workspaceId), JSON.stringify(next))
}

// ─── Flatten Results → flat row array for keyboard navigation ────────────────

function flattenResults(results) {
  const rows = []
  for (const section of SECTION_CONFIG) {
    const items = results[section.key] || []
    for (const item of items) {
      rows.push({ ...item, section: section.key })
    }
  }
  return rows
}

// ─── Quick Navigation Pages ───────────────────────────────────────────────────

function quickPages() {
  return [
    { id: 'profile', label: 'Profile', type: 'page', path: 'profile', iconKey: 'user' },
    { id: 'settings', label: 'Settings', type: 'page', path: 'settings', iconKey: 'settings' },
    { id: 'notifications', label: 'Notifications', type: 'page', path: 'activity', iconKey: 'bell' },
    { id: 'threads', label: 'Threads', type: 'page', path: 'threads', iconKey: 'message' },
    { id: 'starred', label: 'Starred', type: 'page', path: 'starred', iconKey: 'star' },
    { id: 'directories', label: 'Directories', type: 'page', path: 'directories', iconKey: 'users' },
  ]
}

// ─── Keyboard shortcut label (Mac vs Windows/Linux) ──────────────────────────

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)

const SHORTCUT_LABEL = IS_MAC ? '⌘K' : 'Ctrl K'

// ─── Main Component ───────────────────────────────────────────────────────────

const GlobalSearch = forwardRef(function GlobalSearch(
  { user, workspaceId, onOpenResult },
  ref,
) {
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const panelRef = useRef(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState(EMPTY_RESULTS)
  const [recent, setRecent] = useState(() => readRecent(user?._id, workspaceId))
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [error, setError] = useState('')

  const rows = useMemo(() => flattenResults(results), [results])

  // ─── Open / Close ──────────────────────────────────────────────────────────

  const open = useCallback(() => {
    setIsOpen(true)
    setRecent(readRecent(user?._id, workspaceId))
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [user?._id, workspaceId])

  const close = useCallback(() => {
    setIsOpen(false)
    setActiveIndex(0)
    inputRef.current?.blur()
  }, [])

  // ─── Expose ref API ───────────────────────────────────────────────────────

  useImperativeHandle(
    ref,
    () => ({ open, close, focus: open }),
    [open, close],
  )

  // ─── Click-outside to close ──────────────────────────────────────────────

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [close])

  // ─── Debounced Search ─────────────────────────────────────────────────────

  useEffect(() => {
    const value = query.trim()
    setActiveIndex(0)
    setError('')

    if (!isOpen || value.length < 1) {
      setResults(EMPTY_RESULTS)
      setIsLoading(false)
      return undefined
    }

    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const { data } = await searchAPI.global(value)
        setResults(data?.data || EMPTY_RESULTS)
      } catch (searchError) {
        logger.error('Global search failed:', searchError)
        setError('Search is unavailable right now. Please try again.')
        setResults(EMPTY_RESULTS)
      } finally {
        setIsLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [isOpen, query])

  // ─── Scroll active row into view ─────────────────────────────────────────

  useEffect(() => {
    if (!panelRef.current) return
    const selected = panelRef.current.querySelector('[aria-selected="true"]')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeIndex])

  // ─── Handle result click ─────────────────────────────────────────────────

  const handleOpenResult = useCallback(
    (item) => {
      const value = query.trim()
      if (value) {
        saveRecent(user?._id, workspaceId, value)
        setRecent(readRecent(user?._id, workspaceId))
      }
      onOpenResult?.(item)
      close()
    },
    [close, onOpenResult, query, user?._id, workspaceId],
  )

  // ─── Keyboard navigation inside input ────────────────────────────────────

  const handleKeyDown = (event) => {
    if (!isOpen && ['ArrowDown', 'Enter'].includes(event.key)) {
      open()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (query) {
        setQuery('')
      } else {
        close()
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (event.key === 'Enter' && rows[activeIndex]) {
      event.preventDefault()
      handleOpenResult(rows[activeIndex])
    }
  }

  const hasQuery = query.trim().length > 0
  const showEmpty =
    hasQuery && !isLoading && !error && rows.length === 0

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`global-search${isOpen ? ' is-open' : ''}`}
    >
      {/* ── Input Control ─────────────────────────────────────────────── */}
      <div className="global-search__control" onClick={open}>
        <span className="global-search__search-icon">
          <Search size={15} />
        </span>

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={open}
          onKeyDown={handleKeyDown}
          placeholder="Search messages, files, and people"
          aria-label="Search messages, files, and people"
          aria-expanded={isOpen}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
        />

        {query ? (
          <button
            type="button"
            className="global-search__clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation()
              setQuery('')
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        ) : (
          <kbd className="global-search__kbd">{SHORTCUT_LABEL}</kbd>
        )}
      </div>

      {/* ── Dropdown Panel ─────────────────────────────────────────────── */}
      {isOpen && (
        <div
          id="global-search-results"
          ref={panelRef}
          className="global-search__panel"
          role="listbox"
          aria-label="Search results"
        >
          {/* Mobile header */}
          <div className="global-search__mobile-header">
            <div className="global-search__mobile-title">
              <Search size={16} />
              <span>Search</span>
            </div>
            <button
              className="global-search__mobile-close"
              onClick={close}
              aria-label="Close search"
            >
              <X size={18} />
            </button>
          </div>

          {/* Mobile sticky input */}
          <div className="global-search__mobile-input-wrap">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search messages, files, and people"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear">
                <X size={13} />
              </button>
            )}
          </div>

          {/* ── Empty query: recent + quick nav ─────────────────────── */}
          {!hasQuery && (
            <>
              <ResultSection title="Recent Searches">
                {recent.length === 0 ? (
                  <p className="global-search__empty">
                    Your recent searches will appear here
                  </p>
                ) : (
                  recent.map((item) => (
                    <button
                      key={item}
                      className="global-search-row"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQuery(item)
                        inputRef.current?.focus()
                      }}
                    >
                      <span className="global-search-row__icon global-search-row__icon--muted">
                        <Clock size={15} />
                      </span>
                      <span className="global-search-row__main">
                        <span className="global-search-row__title">{item}</span>
                        <span className="global-search-row__sub">Recent search</span>
                      </span>
                    </button>
                  ))
                )}
              </ResultSection>

              <ResultSection title="Quick Navigation">
                {quickPages().map((page) => (
                  <ResultRow
                    key={page.id}
                    item={page}
                    selected={false}
                    onClick={() => handleOpenResult(page)}
                  />
                ))}
              </ResultSection>
            </>
          )}

          {/* ── Loading ─────────────────────────────────────────────── */}
          {hasQuery && isLoading && (
            <div className="global-search__state">
              <Loader2 size={16} className="global-search__spinner" />
              <span>Searching…</span>
            </div>
          )}

          {/* ── Error ───────────────────────────────────────────────── */}
          {hasQuery && error && (
            <div className="global-search__state global-search__state--error">
              {error}
            </div>
          )}

          {/* ── No results ──────────────────────────────────────────── */}
          {showEmpty && (
            <div className="global-search__state">
              <Search size={28} style={{ opacity: 0.25, marginBottom: 6 }} />
              <span>No results for <strong>"{query}"</strong></span>
            </div>
          )}

          {/* ── Results ─────────────────────────────────────────────── */}
          {hasQuery &&
            !isLoading &&
            !error &&
            SECTION_CONFIG.map((section) => {
              const items = results[section.key] || []
              if (items.length === 0) return null
              return (
                <ResultSection key={section.key} title={section.title}>
                  {items.map((item) => {
                    const rowIndex = rows.findIndex(
                      (r) => r.section === section.key && r.id === item.id,
                    )
                    return (
                      <ResultRow
                        key={`${section.key}-${item.id}`}
                        item={{ ...item, section: section.key }}
                        selected={rowIndex === activeIndex}
                        onClick={() =>
                          handleOpenResult({ ...item, section: section.key })
                        }
                      />
                    )
                  })}
                </ResultSection>
              )
            })}
        </div>
      )}
    </div>
  )
})

// ─── ResultSection ────────────────────────────────────────────────────────────

function ResultSection({ title, children }) {
  return (
    <section className="global-search-section">
      <h3 className="global-search-section__title">{title}</h3>
      <div>{children}</div>
    </section>
  )
}

// ─── ResultRow ────────────────────────────────────────────────────────────────

function ResultRow({ item, selected, onClick }) {
  return (
    <button
      className={`global-search-row${selected ? ' is-selected' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      role="option"
      aria-selected={selected}
    >
      <span className="global-search-row__icon">
        {item.type === 'user' ? (
          <Avatar
            member={{
              name: item.name,
              avatar: item.avatar,
              onlineStatus: item.status,
            }}
            size={28}
            showStatus={false}
          />
        ) : (
          getIcon(item)
        )}
      </span>

      <span className="global-search-row__main">
        <span className="global-search-row__title">{getTitle(item)}</span>
        {getSubtitle(item) && (
          <span className="global-search-row__sub">{getSubtitle(item)}</span>
        )}
      </span>

      {selected && (
        <span className="global-search-row__enter-hint">↵</span>
      )}
    </button>
  )
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function getFileIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return <FileImage size={16} />
  if (mimeType.startsWith('video/')) return <FileVideo size={16} />
  if (mimeType.startsWith('audio/')) return <FileAudio size={16} />
  return <FileText size={16} />
}

function getIcon(item) {
  switch (item.type) {
    case 'message':
      return <MessageSquare size={16} />
    case 'channel':
      return item.visibility === 'private' ? (
        <Lock size={16} />
      ) : (
        <Hash size={16} />
      )
    case 'file':
      return getFileIcon(item.mimeType)
    case 'link':
      return <LinkIcon size={16} />
    case 'page':
      return getPageIcon(item)
    default:
      return <User size={16} />
  }
}

function getPageIcon(item) {
  switch (item.iconKey || item.path) {
    case 'settings':
      return <Settings size={16} />
    case 'star':
    case 'starred':
      return <Star size={16} />
    case 'users':
    case 'directories':
      return <Users size={16} />
    case 'message':
    case 'threads':
      return <MessageSquare size={16} />
    case 'activity':
      return <Bell size={16} />
    default:
      return <AtSign size={16} />
  }
}

// ─── Title / Subtitle helpers ─────────────────────────────────────────────────

function getTitle(item) {
  switch (item.type) {
    case 'user':
      return item.name || item.email || 'Unknown User'
    case 'message':
      return item.snippet || 'Message'
    case 'channel':
      return item.visibility === 'private'
        ? `🔒 ${item.name || item.slug}`
        : `# ${item.name || item.slug}`
    case 'file':
      return item.name || 'Untitled file'
    case 'link':
      return item.title || item.url
    case 'page':
      return item.label
    default:
      return item.name || 'Untitled'
  }
}

function getSubtitle(item) {
  switch (item.type) {
    case 'user':
      return [item.email, item.role, item.status]
        .filter(Boolean)
        .join(' · ')
    case 'message':
      return [
        item.senderName || 'Someone',
        item.channelName ? `in ${item.channelName}` : null,
      ]
        .filter(Boolean)
        .join(' ')
    case 'channel':
      return [
        item.topic || item.description,
        item.memberCount != null ? `${item.memberCount} members` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'file':
      return [
        item.uploadedBy ? `Uploaded by ${item.uploadedBy}` : null,
        item.channelName ? `in ${item.channelName}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'link':
      return item.url
    case 'page':
      return 'Go to page'
    default:
      return ''
  }
}

export default GlobalSearch
