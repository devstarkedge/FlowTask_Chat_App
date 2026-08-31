import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { useChannelStore } from '../stores/channelStore'
import { searchAPI } from '../services/api'
import SearchInput from '../components/search/SearchInput'
import SearchResultItem from '../components/search/SearchResultItem'
import {
  getScopeLabel,
  getScopeTargetLabel,
  normalizeSearchMessages,
} from '../components/search/searchUtils'
import { getChannelPath, getDMPath } from '../utils/chatRoutes'
import '../components/search/UnifiedSearch.css'

export default function SearchResultsPage() {
  const { workspaceId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const channels = useChannelStore((state) => state.channels)
  const scopeId = searchParams.get('scope') || ''
  const query = searchParams.get('q') || ''
  const [inputValue, setInputValue] = useState(query)
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const channel = useMemo(
    () => channels.find((candidate) => candidate._id === scopeId) || null,
    [channels, scopeId],
  )

  useEffect(() => {
    setInputValue(query)
  }, [query])

  useEffect(() => {
    if (!scopeId || !query.trim()) {
      setResults([])
      setIsLoading(false)
      setError('')
      return undefined
    }

    let cancelled = false
    const controller = new AbortController()
    setIsLoading(true)
    setError('')

    const runSearch = async () => {
      try {
        const { data } = await searchAPI.search({
          q: query,
          scope: scopeId,
          limit: 30,
          signal: controller.signal,
        })
        if (cancelled) return
        setResults(
          normalizeSearchMessages(
            data?.data?.messages || [],
            channel || { _id: scopeId, type: 'channel', name: scopeId },
          ),
        )
      } catch {
        if (controller.signal.aborted || cancelled) return
        if (cancelled) return
        setResults([])
        setError('Search is unavailable right now.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void runSearch()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [channel, query, scopeId])

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextQuery = inputValue.trim()
    const nextParams = new URLSearchParams()
    if (scopeId) nextParams.set('scope', scopeId)
    if (nextQuery) nextParams.set('q', nextQuery)
    setSearchParams(nextParams)
  }

  const handleOpenResult = (item) => {
    if (!workspaceId || !item?.channelId || !item?.id) return
    navigate(
      item.channelType === 'dm'
        ? getDMPath(workspaceId, item.channelId, item.id)
        : getChannelPath(workspaceId, item.channelId, item.id),
    )
  }

  const scopeLabel = getScopeLabel(channel || { type: 'channel', name: scopeId || 'scope' })
  const scopeTargetLabel = getScopeTargetLabel(channel || { type: 'channel' })

  return (
    <div className="channel-search-page">
      <div className="channel-search-page__header">
        <button
          type="button"
          className="channel-search-page__back"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>

        <div>
          <p className="channel-search-page__eyebrow">Scoped results</p>
          <h1 className="channel-search-page__title">
            Search inside {channel?.name || scopeId || `this ${scopeTargetLabel}`}
          </h1>
          <p className="channel-search-page__subtitle">
            Message results only, using the same unified shell and backend ranking.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <SearchInput
          ref={inputRef}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              navigate(-1)
            }
          }}
          onClear={() => setInputValue('')}
          placeholder={`Search in this ${scopeTargetLabel}`}
          scopeLabel={scopeLabel}
          compact
        />
      </form>

      <div className="channel-search-page__summary">
        <span>{query.trim() ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Type a word or phrase to search.'}</span>
        {query.trim() && <span>Scope: {scopeLabel}</span>}
      </div>

      <div className="channel-search-page__section-label">Messages</div>
      <div className="channel-search-page__results">
        {isLoading && Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="channel-search-skeleton" />
        ))}

        {!isLoading && !scopeId && (
          <div className="channel-search-state">
            <Search size={28} className="channel-search-state__icon" />
            <p className="channel-search-state__title">No search scope selected</p>
            <p className="channel-search-state__copy">Open this page from a channel search popup so the scope can be set automatically.</p>
          </div>
        )}

        {!isLoading && scopeId && !query.trim() && (
          <div className="channel-search-state">
            <Search size={28} className="channel-search-state__icon" />
            <p className="channel-search-state__title">Type to search this conversation</p>
            <p className="channel-search-state__copy">Press Enter in the search box to refresh the scoped results list.</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="channel-search-state">
            <Search size={28} className="channel-search-state__icon" />
            <p className="channel-search-state__title">Search unavailable</p>
            <p className="channel-search-state__copy">{error}</p>
          </div>
        )}

        {!isLoading && !error && scopeId && query.trim() && results.length === 0 && (
          <div className="channel-search-state">
            <Search size={28} className="channel-search-state__icon" />
            <p className="channel-search-state__title">No messages matched</p>
            <p className="channel-search-state__copy">Try a different phrase or a shorter keyword.</p>
          </div>
        )}

        {!isLoading && !error && results.map((item) => (
          <SearchResultItem
            key={item.id}
            item={item}
            query={query}
            onClick={handleOpenResult}
          />
        ))}
      </div>
    </div>
  )
}