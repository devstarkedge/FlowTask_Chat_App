import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDraftStore, getDraftKey } from '../../stores/draftStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useChannelStore } from '../../stores/channelStore'
import { draftAPI } from '../../services/api'
import { isContentEmpty } from '../../utils/draftUtils'
import { getChannelPath, getDMPath } from '../../utils/chatRoutes'
import {
  FileEdit, Trash2, Send, Clock, Paperclip, MessageSquare,
  Search, Loader2, ChevronDown
} from 'lucide-react'
import toast from 'react-hot-toast'

function formatTimeAgo(date) {
  const now = Date.now()
  const diff = now - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

function truncatePreview(text, max = 80) {
  if (!text) return ''
  const stripped = text.replace(/<[^>]*>/g, '').trim()
  return stripped.length > max ? stripped.slice(0, max) + '…' : stripped
}

export default function DraftsSidebar() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const channels = useChannelStore((s) => s.channels)
  const localDrafts = useDraftStore((s) => s.drafts)
  const draftListStale = useDraftStore((s) => s.draftListStale)
  const { setSidebarDrafts, removeServerDraft, clearDraftListStale } = useDraftStore()
  const navigate = useNavigate()

  const [serverDrafts, setServerDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  const skipRef = useRef(0)

  const fetchDrafts = useCallback(async (reset = false) => {
    if (!activeWorkspaceId) return
    const currentSkip = reset ? 0 : skipRef.current
    try {
      if (reset) setLoading(true)
      else setLoadingMore(true)

      const { data } = await draftAPI.getAll({ limit: 30, skip: currentSkip })
      const fetched = data?.data?.drafts || []
      const total = data?.data?.total || 0

      if (reset) {
        setServerDrafts(fetched)
        skipRef.current = fetched.length
      } else {
        setServerDrafts((prev) => [...prev, ...fetched])
        skipRef.current = currentSkip + fetched.length
      }
      setHasMore(currentSkip + fetched.length < total)
      setSidebarDrafts(reset ? fetched : [...serverDrafts, ...fetched], total)
    } catch {
      // Silent fail — show empty state
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [activeWorkspaceId, setSidebarDrafts, serverDrafts])

  useEffect(() => {
    fetchDrafts(true)
  }, [activeWorkspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when draft list is marked stale (after draft save/delete)
  useEffect(() => {
    if (draftListStale) {
      clearDraftListStale()
      fetchDrafts(true)
    }
  }, [draftListStale]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Merge local + server drafts ────────────────────────────────────
  // Local Zustand drafts may not yet be on the server (sync delay).
  // Merge by channelId+threadId key, prefer local if newer.
  const mergedDrafts = useMemo(() => {
    const draftMap = new Map()

    // Add server drafts first (they have _id, full metadata)
    for (const sd of serverDrafts) {
      if (isContentEmpty(sd.htmlContent, sd.content)) continue
      const key = getDraftKey(sd.channelId, sd.workspaceId || activeWorkspaceId, sd.threadId)
      draftMap.set(key, {
        ...sd,
        _key: key,
        _source: 'server',
        _sortTime: new Date(sd.updatedAt).getTime(),
      })
    }

    // Overlay local drafts — add if missing or replace if newer
    const wsPrefix = `${activeWorkspaceId || 'global'}:`
    for (const [key, ld] of Object.entries(localDrafts)) {
      if (!key.startsWith(wsPrefix)) continue
      if (isContentEmpty(ld.html, ld.text)) continue

      const existing = draftMap.get(key)
      if (!existing || ld.timestamp > existing._sortTime) {
        draftMap.set(key, {
          _id: existing?._id || `local-${key}`,
          _key: key,
          _source: existing ? 'server' : 'local',
          channelId: ld.channelId,
          threadId: ld.threadId,
          workspaceId: ld.workspaceId || activeWorkspaceId,
          content: ld.text || '',
          htmlContent: ld.html || '',
          attachments: ld.attachments || existing?.attachments || [],
          mentions: ld.mentions || existing?.mentions || [],
          updatedAt: new Date(ld.timestamp).toISOString(),
          _sortTime: ld.timestamp,
        })
      }
    }

    // Sort by most recent first
    return Array.from(draftMap.values()).sort((a, b) => b._sortTime - a._sortTime)
  }, [serverDrafts, localDrafts, activeWorkspaceId])

  const handleDelete = async (e, draft) => {
    e.stopPropagation()
    try {
      if (draft._id && !draft._id.startsWith('local-')) {
        await draftAPI.delete(draft._id)
      }
      // Remove from local state
      setServerDrafts((prev) => prev.filter((d) => d._id !== draft._id))
      // Remove from Zustand
      removeServerDraft(draft.channelId, draft.threadId, draft.workspaceId || activeWorkspaceId)
      toast.success('Draft deleted')
    } catch {
      toast.error('Failed to delete draft')
    }
  }

  const handleSendNow = async (e, draft) => {
    e.stopPropagation()
    if (!draft._id || draft._id.startsWith('local-')) {
      toast.error('Draft not yet synced to server. Please wait a moment and try again.')
      return
    }
    setSendingId(draft._id)
    try {
      await draftAPI.sendDraft(draft._id)
      // Remove from all states
      setServerDrafts((prev) => prev.filter((d) => d._id !== draft._id))
      removeServerDraft(draft.channelId, draft.threadId, draft.workspaceId || activeWorkspaceId)
      toast.success('Draft sent')
    } catch (err) {
      const msg = err?.response?.data?.error?.message || 'Failed to send draft'
      toast.error(msg)
    } finally {
      setSendingId(null)
    }
  }

  const handleNavigate = (draft) => {
    const channel = channels.find((c) => c._id === draft.channelId)
    if (!channel) {
      toast.error('Channel not found')
      return
    }
    if (channel.type === 'dm') {
      navigate(getDMPath(activeWorkspaceId, draft.channelId))
    } else {
      navigate(getChannelPath(activeWorkspaceId, draft.channelId))
    }
  }

  const getChannelName = (channelId) => {
    const ch = channels.find((c) => c._id === channelId)
    if (!ch) return 'Unknown'
    if (ch.type === 'dm') return ch.dmRecipientName || 'Direct Message'
    return `#${ch.name}`
  }

  const filteredDrafts = searchQuery
    ? mergedDrafts.filter((d) => {
        const content = (d.content || '').toLowerCase()
        const name = getChannelName(d.channelId).toLowerCase()
        const q = searchQuery.toLowerCase()
        return content.includes(q) || name.includes(q)
      })
    : mergedDrafts

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
        <h2 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
          <FileEdit size={15} className="inline mr-1.5" style={{ verticalAlign: '-2px' }} />
          Drafts
          {mergedDrafts.length > 0 && (
            <span
              className="ml-2 px-1.5 py-0.5 text-xs rounded-full font-medium"
              style={{ background: 'var(--accent-primary)', color: 'white' }}
            >
              {mergedDrafts.length}
            </span>
          )}
        </h2>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search drafts..."
            className="w-full text-xs py-1.5 pl-8 pr-3 rounded-md"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-secondary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* Draft List */}
      <div className="flex-1 overflow-y-auto">
        {filteredDrafts.length === 0 ? (
          <div className="text-center py-10 px-4" style={{ color: 'var(--text-muted)' }}>
            <FileEdit size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No drafts</p>
            <p className="text-xs mt-1">Start typing in any chat to create a draft</p>
          </div>
        ) : (
          <div className="py-1">
            {filteredDrafts.map((draft) => (
              <div
                key={draft._id || draft._key}
                onClick={() => handleNavigate(draft)}
                className="group px-4 py-2.5 cursor-pointer transition-colors"
                style={{ borderBottom: '1px solid var(--border-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                    {getChannelName(draft.channelId)}
                  </span>
                  <div className="flex items-center gap-1">
                    {draft.threadId && (
                      <MessageSquare size={11} style={{ color: 'var(--text-muted)' }} title="Thread reply" />
                    )}
                    {draft.attachments?.length > 0 && (
                      <Paperclip size={11} style={{ color: 'var(--text-muted)' }} title="Has attachments" />
                    )}
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {formatTimeAgo(draft.updatedAt)}
                    </span>
                  </div>
                </div>

                <p className="text-xs truncate mb-1" style={{ color: 'var(--text-primary)' }}>
                  {truncatePreview(draft.content || draft.htmlContent)}
                </p>

                {/* Actions (visible on hover) */}
                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={(e) => handleSendNow(e, draft)}
                    disabled={sendingId === draft._id}
                    className="p-1 rounded transition-colors"
                    style={{ color: 'var(--accent-green, #22c55e)', background: 'transparent', border: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    title="Send now"
                  >
                    {sendingId === draft._id
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Send size={12} />}
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, draft)}
                    className="p-1 rounded transition-colors"
                    style={{ color: 'var(--accent-red)', background: 'transparent', border: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    title="Delete draft"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}

            {/* Load More */}
            {hasMore && (
              <button
                onClick={() => fetchDrafts(false)}
                disabled={loadingMore}
                className="w-full py-2 text-xs font-medium transition-colors"
                style={{ color: 'var(--accent-primary)', background: 'transparent', border: 'none' }}
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin mx-auto" />
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    <ChevronDown size={13} /> Load more
                  </span>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
