import { useEffect, useState, useRef } from 'react'
import { threadAPI } from '../../services/api'
import { useChatStore } from '../../stores/chatStore'
import MessageItem from './MessageItem'
import MessageInput from './MessageInput'
import { X, MessageSquare } from 'lucide-react'

export default function ThreadPanel({ thread, onClose }) {
  const [threadData, setThreadData] = useState(null)
  const [replies, setReplies] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const { messagesByChannel } = useChatStore()
  const bottomRef = useRef(null)

  useEffect(() => {
    loadThread()
  }, [thread.rootMessageId])

  useEffect(() => {
    if (replies.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [replies.length])

  const loadThread = async () => {
    setIsLoading(true)
    try {
      const { data } = await threadAPI.get(thread.rootMessageId)
      setThreadData(data.data.thread)

      const { data: repliesData } = await threadAPI.replies(thread.rootMessageId)
      setReplies(repliesData.data.messages || [])
    } catch (error) {
      console.error('Failed to load thread:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const rootMessage = messagesByChannel[thread.channelId]?.find(
    (m) => m._id === thread.rootMessageId
  )

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
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={16} style={{ color: 'var(--text-white)' }} />
          <span className="font-bold text-sm" style={{ color: 'var(--text-white)' }}>
            Thread
          </span>
          {threadData?.replyCount > 0 && (
            <span
              className="badge badge-muted"
              style={{ fontSize: 10 }}
            >
              {threadData.replyCount}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md cursor-pointer transition-colors"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={16} />
        </button>
      </div>

      {/* Thread Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div style={{ padding: '16px 20px' }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0' }} className="animate-fade-in">
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 'var(--radius-lg)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <div className="skeleton" style={{ width: 90, height: 14 }} />
                    <div className="skeleton" style={{ width: 40, height: 14 }} />
                  </div>
                  <div className="skeleton" style={{ width: '75%', height: 14, marginBottom: 4 }} />
                  <div className="skeleton" style={{ width: '50%', height: 14 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Root Message */}
            {rootMessage && (
              <div
                style={{
                  borderBottom: '1px solid var(--border-secondary)',
                  padding: '4px 0 8px',
                  marginBottom: 4,
                }}
              >
                <MessageItem message={rootMessage} compact={false} />
              </div>
            )}

            {/* Reply count divider */}
            {replies.length > 0 && (
              <div
                className="animate-fade-in"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 20px',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, height: 1, background: 'var(--border-secondary)' }} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-link)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-secondary)' }} />
              </div>
            )}

            {/* Replies */}
            {replies.map((reply) => (
              <MessageItem key={reply._id} message={reply} compact={false} />
            ))}

            {replies.length === 0 && !isLoading && (
              <div className="text-center py-8 animate-fade-in">
                <MessageSquare
                  size={28}
                  style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }}
                />
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  No replies yet. Start the conversation!
                </p>
              </div>
            )}

            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Reply Input */}
      <MessageInput
        channelId={thread.channelId}
        threadId={thread.rootMessageId}
        placeholder="Reply in thread..."
      />
    </div>
  )
}
