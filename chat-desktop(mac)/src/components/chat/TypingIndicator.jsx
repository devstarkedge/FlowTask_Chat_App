import { useLiveProfileData } from '../../hooks/useLiveProfileData';
import { useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'

const EMPTY = {}

export default function TypingIndicator({ channelId }) {
  const cid = channelId != null ? String(channelId) : null
  const typingMap = useChatStore((s) => (cid && s.typingByChannel?.[cid]) || EMPTY)
  const userId = useAuthStore((s) => s.user?._id)

  // Filter out self (normalize IDs — socket payloads are always strings)
  const typingUsers = useMemo(() => {
    const selfId = userId != null ? String(userId) : null
    return Object.entries(typingMap)
      .filter(([id]) => id !== selfId)
      .map(([id, name]) => ({ _id: id, name }))
  }, [typingMap, userId])
  const typers = useLiveProfileData(typingUsers).map((user) => user.name)

  const text =
    typers.length === 1
      ? `${typers[0]} is typing`
      : typers.length === 2
        ? `${typers[0]} and ${typers[1]} are typing`
        : `${typers[0]} and ${typers.length - 1} others are typing`

  return (
    <div
      className="chat-layout-grid py-1"
      style={{ height: 24, flexShrink: 0, overflow: 'hidden', visibility: typers.length ? 'visible' : 'hidden' }}
      aria-hidden={typers.length === 0}
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
          {text}
        </span>
      </div>
    </div>
  )
}
