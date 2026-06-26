import { useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'

const EMPTY = {}

export default function TypingIndicator({ channelId }) {
  const typingMap = useChatStore((s) => s.typingByChannel?.[channelId] ?? EMPTY)
  const userId = useAuthStore((s) => s.user?._id)

  // Filter out self
  const typers = useMemo(() => {
    return Object.entries(typingMap)
      .filter(([id]) => id !== userId)
      .map(([, name]) => name)
  }, [typingMap, userId])

  if (typers.length === 0) return null

  const text =
    typers.length === 1
      ? `${typers[0]} is typing`
      : typers.length === 2
        ? `${typers[0]} and ${typers[1]} are typing`
        : `${typers[0]} and ${typers.length - 1} others are typing`

  return (
    <div
      className="chat-layout-grid py-1 animate-fade-in"
      style={{ minHeight: 24 }}
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
