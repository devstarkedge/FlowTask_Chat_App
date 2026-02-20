import { useEffect, useState } from 'react'
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

  useEffect(() => {
    loadThread()
  }, [thread.rootMessageId])

  const loadThread = async () => {
    setIsLoading(true)
    try {
      // Get thread data
      const { data } = await threadAPI.get(thread.rootMessageId)
      setThreadData(data.data.thread)

      // Get replies
      const { data: repliesData } = await threadAPI.replies(thread.rootMessageId)
      setReplies(repliesData.data.messages || [])
    } catch (error) {
      console.error('Failed to load thread:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Find root message from store
  const rootMessage = messagesByChannel[thread.channelId]?.find(
    (m) => m._id === thread.rootMessageId
  )

  return (
    <div className="flex flex-col h-full animate-slide-in"
      style={{
        width: 'var(--thread-panel-width)',
        minWidth: 'var(--thread-panel-width)',
        borderLeft: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
      }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-primary)',
        }}>
        <div className="flex items-center gap-2">
          <MessageSquare size={16} style={{ color: 'var(--text-white)' }} />
          <span className="font-bold text-sm" style={{ color: 'var(--text-white)' }}>
            Thread
          </span>
          {threadData?.replyCount > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {threadData.replyCount} {threadData.replyCount === 1 ? 'reply' : 'replies'}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:opacity-80 cursor-pointer"
          style={{ color: 'var(--text-muted)' }}>
          <X size={18} />
        </button>
      </div>

      {/* Thread Content */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <>
            {/* Root message */}
            {rootMessage && (
              <div style={{ borderBottom: '1px solid var(--border-primary)' }} className="pb-3 mb-3">
                <MessageItem message={rootMessage} isGrouped={false} />
              </div>
            )}

            {/* Replies */}
            {replies.map((reply) => (
              <MessageItem key={reply._id} message={reply} isGrouped={false} />
            ))}

            {replies.length === 0 && (
              <p className="text-center py-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                No replies yet
              </p>
            )}
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
