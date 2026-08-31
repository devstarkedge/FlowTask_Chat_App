/**
 * SearchDropdown — shared sections renderer for both global and channel modes.
 *
 * Global mode (no query): Recent Searches + Suggested Results
 * Global mode (with query): Top Matches, People, Messages, Channels, DMs, Files, Links, Pages
 * Channel mode (no query): Recent Messages only
 * Channel mode (with query): "Show results in this channel for: X" action + Messages
 *
 * Props:
 *   scope            {'global'|'channel'}
 *   query            {string}
 *   results          {object|array}   — object for global, array for channel
 *   searchMeta       {object}         — global mode meta (limits / sections)
 *   emptyStateResults {object}        — global mode { recentSearches, suggestedResults }
 *   loading          {boolean}
 *   error            {string}
 *   activeIndex      {number}
 *   rows             {array}          — flat keyboard-nav row list
 *   scopeTargetLabel {string}         — "channel" | "conversation"
 *   onSelect         {function(item)}
 *   onShowResultsPage {function}      — channel mode "Show results" action
 */

import { AtSign, Bell, Clock, FileAudio, FileImage, FileText, FileVideo, Hash, Link as LinkIcon, Lock, MessageSquare, Search, Settings, Sparkles, Star, User, Users, X } from 'lucide-react';
import Loader from '../shared/Loader';
import { Avatar } from '../chat/MemberAvatarGroup'
import SearchResultItem from './SearchResultItem'

// ─── Section config ──────────────────────────────────────────────────────────

const GLOBAL_SECTIONS = [
  { key: 'topMatches', title: 'Top Matches' },
  { key: 'users', title: 'People' },
  { key: 'messages', title: 'Messages' },
  { key: 'channels', title: 'Channels' },
  { key: 'dms', title: 'Projects' },
  { key: 'files', title: 'Files' },
  { key: 'links', title: 'Links' },
  { key: 'pages', title: 'Pages' },
]

// ─── Icon helpers ────────────────────────────────────────────────────────────

function getFileIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return <FileImage size={16} />
  if (mimeType.startsWith('video/')) return <FileVideo size={16} />
  if (mimeType.startsWith('audio/')) return <FileAudio size={16} />
  return <FileText size={16} />
}

function getPageIcon(item) {
  switch (item.iconKey || item.path) {
    case 'settings': return <Settings size={16} />
    case 'star':
    case 'starred': return <Star size={16} />
    case 'users':
    case 'directories': return <Users size={16} />
    case 'message':
    case 'threads': return <MessageSquare size={16} />
    case 'activity': return <Bell size={16} />
    case 'files': return <FileText size={16} />
    default: return <AtSign size={16} />
  }
}

function getIcon(item) {
  switch (item.type) {
    case 'message': return <MessageSquare size={16} />
    case 'channel':
      return item.visibility === 'private' ? <Lock size={16} /> : <Hash size={16} />
    case 'dm': return <Lock size={16} />
    case 'file': return getFileIcon(item.mimeType)
    case 'link': return <LinkIcon size={16} />
    case 'page': return getPageIcon(item)
    case 'recentSearch': return <Clock size={16} />
    default: return <User size={16} />
  }
}

// ─── Title / Subtitle helpers ────────────────────────────────────────────────

function getTitle(item) {
  switch (item.type) {
    case 'recentSearch': return item.label || 'Recent search'
    case 'user': return item.name || item.email || 'Unknown User'
    case 'message': return item.snippet || 'Message'
    case 'channel':
      return item.visibility === 'private'
        ? `🔒 ${item.name || item.slug}`
        : `# ${item.name || item.slug}`
    case 'dm': return `🔒 ${item.name || item.slug || 'Direct Message'}`
    case 'file': return item.name || 'Untitled file'
    case 'link': return item.title || item.url
    case 'page': return item.label
    default: return item.name || 'Untitled'
  }
}

function getSubtitle(item) {
  const detail = (() => {
    switch (item.type) {
      case 'recentSearch': return 'Press enter to search again'
      case 'user':
        return ''
      case 'message':
        return [item.senderName || 'Someone', item.channelName ? `in ${item.channelName}` : null]
          .filter(Boolean).join(' ')
      case 'channel':
      case 'dm':
        return [
          item.topic || item.description,
          item.memberCount != null && item.type === 'channel' ? `${item.memberCount} members` : null,
        ].filter(Boolean).join(' · ')
      case 'file':
        return [
          item.uploadedBy ? `Uploaded by ${item.uploadedBy}` : null,
          item.channelName ? `in ${item.channelName}` : null,
        ].filter(Boolean).join(' · ')
      case 'link': return item.url
      case 'page': return 'Go to page'
      default: return ''
    }
  })()

  return [
    item.reasonLabel && item.type !== 'recentSearch' ? item.reasonLabel : null,
    detail,
  ].filter(Boolean).join(' · ')
}

function getItemKey(item) {
  return [item?.type, item?.referenceId, item?.messageId, item?.channelId, item?.path, item?.id, item?.url, item?.label]
    .filter(Boolean).join(':')
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, hint, children }) {
  return (
    <section className="global-search-section">
      <div className="global-search-section__header">
        <h3 className="global-search-section__title">{title}</h3>
        {hint && <span className="global-search-section__hint">{hint}</span>}
      </div>
      <div>{children}</div>
    </section>
  )
}

function GlobalRow({ item, selected, onClick }) {
  return (
    <button
      className={`global-search-row${selected ? ' is-selected' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      role="option"
      aria-selected={selected}
    >
      <span className="global-search-row__icon">
        {item.type === 'recentSearch' ? (
          <Clock size={16} />
        ) : item.type === 'user' ? (
          <Avatar
            member={{ name: item.name, avatar: item.avatar, onlineStatus: item.status }}
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

      {item.reasonLabel && (
        <span className="global-search-row__reason">{item.reasonLabel}</span>
      )}

      {selected && <span className="global-search-row__enter-hint">↵</span>}
    </button>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SearchDropdown({
  scope,
  query,
  results,
  searchMeta,
  emptyStateResults,
  loading,
  error,
  activeIndex,
  rows,
  scopeTargetLabel,
  scopeLabel,
  onSelect,
  onShowResultsPage,
}) {
  const trimmed = query.trim()
  const hasQuery = trimmed.length > 0
  const contextualActionRows = hasQuery
    ? [
        {
          id: '__show-scoped__',
          label: `Show results in this ${scopeTargetLabel} for`,
          query: trimmed,
        },
        {
          id: '__show-filtered__',
          label: 'Show results for',
          query: [scopeLabel, trimmed].filter(Boolean).join(' '),
        },
      ]
    : []
  const contextualActionCount = contextualActionRows.length

  // ── Channel mode ────────────────────────────────────────────────────────
  if (scope === 'channel') {
    const channelResults = Array.isArray(results) ? results : []

    return (
      <>
        {contextualActionRows.map((action, index) => (
          <button
            key={action.id}
            type="button"
            className={`channel-search-popup__action${activeIndex === index ? ' is-selected' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onShowResultsPage}
          >
            <span className="channel-search-popup__action-copy">
              <span className="channel-search-popup__action-label">{action.label}</span>
              <span className="channel-search-popup__action-query">{action.query}</span>
            </span>
            <span className="channel-search-popup__action-enter">↵</span>
          </button>
        ))}

        <div className="channel-search-popup__section-label">
          {hasQuery ? 'Messages' : 'Recent messages'}
        </div>

        <div className="channel-search-popup__results">
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="channel-search-skeleton" />
          ))}

          {!loading && error && (
            <div className="channel-search-state">
              <Search size={28} className="channel-search-state__icon" />
              <p className="channel-search-state__title">Search unavailable</p>
              <p className="channel-search-state__copy">{error}</p>
            </div>
          )}

          {!loading && !error && channelResults.length === 0 && (
            <div className="channel-search-state">
              {hasQuery
                ? <Sparkles size={28} className="channel-search-state__icon" />
                : <Search size={28} className="channel-search-state__icon" />
              }
              <p className="channel-search-state__title">
                {hasQuery ? 'No matches in this scope' : 'Start with a recent message'}
              </p>
              <p className="channel-search-state__copy">
                {hasQuery
                  ? 'Try another phrase, or press Enter to open the full scoped results page.'
                  : `Open recent messages in this ${scopeTargetLabel}, or type to search right away.`}
              </p>
            </div>
          )}

          {!loading && !error && channelResults.map((item, index) => (
            <SearchResultItem
              key={item.id}
              item={item}
              query={trimmed}
              selected={activeIndex === (hasQuery ? index + contextualActionCount : index)}
              onClick={onSelect}
            />
          ))}
        </div>

        <div className="global-search__footer" aria-hidden="true">
          <span>↑ ↓ Select</span>
          <span>Enter Open</span>
          <span>Tab Actions</span>
          <span>Esc Close</span>
        </div>
      </>
    )
  }

  // ── Global mode ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Empty state: recent searches + suggested results */}
      {!hasQuery && (
        <>
          <Section title="Recent Searches">
            {!emptyStateResults?.recentSearches?.length ? (
              <p className="global-search__empty">Your recent searches will appear here</p>
            ) : (
              emptyStateResults.recentSearches.map((item) => (
                <GlobalRow
                  key={item.id}
                  item={item}
                  selected={rows[activeIndex]?.id === item.id}
                  onClick={() => onSelect(item)}
                />
              ))
            )}
          </Section>

          <Section title="Suggested Results">
            {emptyStateResults?.suggestedResults?.map((item) => (
              <GlobalRow
                key={getItemKey(item)}
                item={item}
                selected={rows[activeIndex] && getItemKey(rows[activeIndex]) === getItemKey(item)}
                onClick={() => onSelect(item)}
              />
            ))}
          </Section>
        </>
      )}

      {/* Loading */}
      {hasQuery && loading && (
        <div className="global-search__state">
          <Loader size={16} className="global-search__spinner" />
          <span>Searching…</span>
        </div>
      )}

      {/* Error */}
      {hasQuery && error && (
        <div className="global-search__state global-search__state--error">{error}</div>
      )}

      {/* No results */}
      {hasQuery && !loading && !error && rows.length === 0 && (
        <div className="global-search__state">
          <Search size={28} style={{ opacity: 0.25, marginBottom: 6 }} />
          <span>No results for <strong>"{query}"</strong></span>
        </div>
      )}

      {/* Results by section */}
      {hasQuery && !loading && !error && GLOBAL_SECTIONS.map((section) => {
        const items = (results && results[section.key]) || []
        if (!items.length) return null
        const hint = searchMeta?.sections?.[section.key]?.hasMore
          ? `Showing top ${searchMeta?.limits?.[section.key] || items.length}`
          : ''

        return (
          <Section key={section.key} title={section.title} hint={hint}>
            {items.map((item) => {
              const rowIndex = rows.findIndex(
                (r) => r.section === section.key && r.id === item.id,
              )
              return (
                <GlobalRow
                  key={`${section.key}-${item.id}`}
                  item={{ ...item, section: section.key }}
                  selected={rowIndex === activeIndex}
                  onClick={() => onSelect({ ...item, section: section.key })}
                />
              )
            })}
          </Section>
        )
      })}

      <div className="global-search__footer" aria-hidden="true">
        <span>↑ ↓ Select</span>
        <span>Enter Open</span>
        <span>Esc Close</span>
      </div>
    </>
  )
}
