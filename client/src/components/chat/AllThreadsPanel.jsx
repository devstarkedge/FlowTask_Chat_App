import { useEffect, useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useChannelStore } from '../../stores/channelStore'
import { useAuthStore } from '../../stores/authStore'
import { X, MessageSquareText, Hash, Lock, Loader2, MessagesSquare, Paperclip, File } from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'
import { sanitizeHtml } from '../../utils/sanitize'
import { handleDownload } from '../../utils/handleDownload'
import { formatDistanceToNowStrict } from 'date-fns'

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
    <div className="atp-root">
      {/* ── Header ── */}
      <div className="atp-header">
        <div className="atp-header-left">
          <div className="atp-header-icon">
            <MessagesSquare size={15} />
          </div>
          <h2 className="atp-header-title">Threads</h2>
          {sortedThreads.length > 0 && (
            <span className="atp-header-count">{sortedThreads.length}</span>
          )}
        </div>
        <button className="atp-close-btn" onClick={onClose} title="Close">
          <X size={15} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="atp-body">

        {/* Loading */}
        {allThreadsLoading && sortedThreads.length === 0 && (
          <div className="atp-loading">
            <Loader2 size={18} className="atp-spinner" />
            <span>Loading threads…</span>
          </div>
        )}

        {/* Empty */}
        {!allThreadsLoading && sortedThreads.length === 0 && (
          <div className="atp-empty">
            <div className="atp-empty-icon">
              <MessagesSquare size={28} />
            </div>
            <p className="atp-empty-title">No threads yet</p>
            <p className="atp-empty-desc">
              Reply to any message to start a thread. Threads you create or join will appear here.
            </p>
          </div>
        )}

        {/* Thread list */}
        {sortedThreads.length > 0 && (
          <div className="atp-list">
            {sortedThreads.map((thread, index) => (
              <ThreadCard
                key={thread._id}
                thread={thread}
                index={index}
                channel={channelMap[
                  typeof thread.channelId === 'object'
                    ? thread.channelId._id
                    : thread.channelId
                ]}
                currentUser={user}
                onClick={() => {
                  // Pass true for withHighlight to scroll & highlight parent message
                  onOpenThread({
                    rootMessageId: (
                      thread.rootMessageId?._id ??
                      thread.rootMessageId ??
                      thread.parentMessage?._id ??
                      thread._id
                    )?.toString(),
                    channelId: (
                      typeof thread.channelId === 'object'
                        ? thread.channelId._id
                        : thread.channelId
                    )?.toString(),
                  }, true)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ThreadCard({ thread, channel, currentUser, onClick, index }) {
  const rootMsg = (typeof thread.rootMessageId === 'object' && thread.rootMessageId !== null)
    ? thread.rootMessageId
    : (thread.parentMessage || thread)

  const rootContent  = rootMsg.content || thread.rootContent || ''
  const rootHtml     = rootMsg.htmlContent || thread.rootHtmlContent || ''
  const author       = rootMsg.senderSnapshot || rootMsg.author || rootMsg.sender || thread.createdBy || {}
  const replyCount   = thread.replyCount || thread.replies?.length || 0
  const lastReplyAt  = thread.lastReplyAt || thread.updatedAt || thread.createdAt
  const lastReplyDate = lastReplyAt ? new Date(lastReplyAt) : null
  const hasValidDate  = lastReplyDate && !Number.isNaN(lastReplyDate.getTime())

  const resolvedChannel = channel || (typeof thread.channelId === 'object' ? thread.channelId : null)
  const channelName     = resolvedChannel?.name || 'unknown'
  const isPrivate       = resolvedChannel?.visibility === 'private' || resolvedChannel?.type === 'dm'

  const displayContent = rootHtml ? sanitizeHtml(rootHtml) : rootContent

  // Derive attachments (same logic as ThreadPanel)
  const derivedAttachments =
    rootMsg.fileReferences?.length > 0
      ? rootMsg.fileReferences
          .map((ref) =>
            ref.fileId
              ? { ...ref.fileId, url: ref.fileId.secureUrl || ref.fileId.url }
              : null,
          )
          .filter(Boolean)
      : rootMsg.attachments || []

  return (
    <button
      onClick={onClick}
      className="atp-card"
      style={{ animationDelay: `${Math.min(index * 35, 400)}ms` }}
    >
      {/* Channel pill */}
      <div className="atp-card-channel">
        {isPrivate
          ? <Lock size={10} className="atp-card-channel-icon" />
          : <Hash size={10} className="atp-card-channel-icon" />
        }
        <span>{channelName}</span>
      </div>

      {/* Root message row */}
      <div className="atp-card-message">
        <Avatar
          member={{ name: author.name || 'Unknown', avatar: author.avatar }}
          size={26}
          showStatus={false}
        />
        <div className="atp-card-message-body">
          <span className="atp-card-author">{author.name || 'Unknown'}</span>
          {rootHtml ? (
            <div
              className="atp-card-content"
              dangerouslySetInnerHTML={{ __html: displayContent }}
            />
          ) : (
            <p className="atp-card-content">
              {displayContent || <em className="atp-card-empty">No content</em>}
            </p>
          )}
        </div>
      </div>

      {/* Attachment thumbnails */}
      {derivedAttachments.length > 0 && (
        <div className="atp-card-attachments">
          {derivedAttachments.slice(0, 3).map((att, i) => (
            <div key={att._id || att.referenceId || i} className="atp-card-attachment-chip" onClick={(e) => { e.stopPropagation(); handleDownload(att); }}>
              <File size={11} />
              <span className="atp-card-attachment-name">{att.originalName || att.name || 'file'}</span>
            </div>
          ))}
          {derivedAttachments.length > 3 && (
            <span className="atp-card-attachment-more">+{derivedAttachments.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="atp-card-footer">
        <div className="atp-card-replies">
          <MessageSquareText size={11} />
          <span>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
        </div>
        {hasValidDate && (
          <span className="atp-card-time">
            {formatDistanceToNowStrict(lastReplyDate, { addSuffix: true })}
          </span>
        )}
      </div>
    </button>
  )
}