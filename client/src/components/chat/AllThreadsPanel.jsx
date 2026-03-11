import { useEffect, useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useChannelStore } from '../../stores/channelStore'
import { useAuthStore } from '../../stores/authStore'
import { X, MessageSquareText, Hash, Lock, Loader2 } from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'
import { sanitizeHtml } from '../../utils/sanitize'
import { formatDistanceToNowStrict } from 'date-fns'

/**
 * AllThreadsPanel — Lists all threads the current user participates in.
 * Renders in a side panel similar to Pinned Messages / Search.
 */
export default function AllThreadsPanel({ onClose, onOpenThread }) {
  const { allThreads, allThreadsLoading, fetchAllThreads } = useChatStore()
  const { channels } = useChannelStore()
  const { user } = useAuthStore()

  useEffect(() => {
    fetchAllThreads()
  }, [fetchAllThreads])

  const channelMap = useMemo(() => {
    const m = {}
    channels.forEach((c) => { m[c._id] = c })
    return m
  }, [channels])

  const sortedThreads = useMemo(() => {
    if (!Array.isArray(allThreads)) return []
    return [...allThreads].sort((a, b) => {
      const aTime = a.lastReplyAt || a.updatedAt || a.createdAt
      const bTime = b.lastReplyAt || b.updatedAt || b.createdAt
      return new Date(bTime) - new Date(aTime)
    })
  }, [allThreads])

  return (
    <div
      className="flex flex-col h-full animate-slide-in-right"
      style={{
        width: 'var(--thread-panel-width)',
        minWidth: 'var(--thread-panel-width)',
        borderLeft: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        <div className="flex items-center gap-2">
          <MessageSquareText size={18} style={{ color: 'var(--accent-primary)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>
            Threads
          </h2>
          {sortedThreads.length > 0 && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              {sortedThreads.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg transition-colors cursor-pointer"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {allThreadsLoading && sortedThreads.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}

        {!allThreadsLoading && sortedThreads.length === 0 && (
          <div className="text-center py-12 px-6">
            <MessageSquareText
              size={36}
              style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.5 }}
            />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-white)' }}>
              No threads yet
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Start a thread by replying to any message.
              Threads you create or participate in will appear here.
            </p>
          </div>
        )}

        <div className="px-3 py-2 flex flex-col gap-1">
          {sortedThreads.map((thread) => (
            <ThreadCard
              key={thread._id}
              thread={thread}
              channel={channelMap[typeof thread.channelId === 'object' ? thread.channelId._id : thread.channelId]}
              currentUser={user}
              onClick={() => {
                onOpenThread({
                  rootMessageId: (
                    thread.rootMessageId?._id ??
                    thread.rootMessageId ??
                    thread.parentMessage?._id ??
                    thread._id
                  )?.toString(),
                  channelId: thread.channelId?.toString?.() ?? thread.channelId,
                })
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ThreadCard({ thread, channel, currentUser, onClick }) {
  const rootMsg = (typeof thread.rootMessageId === 'object' && thread.rootMessageId !== null) ? thread.rootMessageId : (thread.parentMessage || thread)
  const rootContent = rootMsg.content || thread.rootContent || ''
  const rootHtml = rootMsg.htmlContent || thread.rootHtmlContent || ''
  const author = rootMsg.senderSnapshot || rootMsg.author || rootMsg.sender || thread.createdBy || {}
  const replyCount = thread.replyCount || thread.replies?.length || 0
  const lastReplyAt = thread.lastReplyAt || thread.updatedAt || thread.createdAt
  const lastReplyDate = lastReplyAt ? new Date(lastReplyAt) : null
  const hasValidLastReplyDate = lastReplyDate && !Number.isNaN(lastReplyDate.getTime())
  
  // thread.channelId might be populated from the backend
  const resolvedChannel = channel || (typeof thread.channelId === 'object' ? thread.channelId : null)
  const channelName = resolvedChannel?.name || 'unknown'
  const isPrivate = resolvedChannel?.visibility === 'private' || resolvedChannel?.type === 'dm'

  const displayContent = rootHtml
    ? sanitizeHtml(rootHtml)
    : rootContent

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg p-3 transition-all cursor-pointer"
      style={{
        background: 'transparent',
        border: '1px solid var(--border-secondary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.borderColor = 'var(--border-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'var(--border-secondary)'
      }}
    >
      {/* Channel tag */}
      <div className="flex items-center gap-1 mb-2">
        {isPrivate ? (
          <Lock size={11} style={{ color: 'var(--text-muted)' }} />
        ) : (
          <Hash size={11} style={{ color: 'var(--text-muted)' }} />
        )}
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
          {channelName}
        </span>
      </div>

      {/* Root message */}
      <div className="flex items-start gap-2 mb-2">
        <Avatar
          member={{ name: author.name || 'Unknown', avatar: author.avatar }}
          size={24}
          showStatus={false}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-white)' }}>
              {author.name || 'Unknown'}
            </span>
          </div>
          {rootHtml ? (
            <div
              className="text-xs line-clamp-2"
              style={{ color: 'var(--text-secondary)' }}
              dangerouslySetInnerHTML={{ __html: displayContent }}
            />
          ) : (
            <p className="text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
              {displayContent || <em className="opacity-50">No content</em>}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 mt-1">
        <span className="text-[11px] font-medium" style={{ color: 'var(--accent-primary)' }}>
          {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
        </span>
        {hasValidLastReplyDate && (
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Last reply {formatDistanceToNowStrict(lastReplyDate, { addSuffix: true })}
          </span>
        )}
      </div>
    </button>
  )
}
