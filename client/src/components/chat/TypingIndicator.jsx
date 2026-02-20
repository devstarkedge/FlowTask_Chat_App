import { useChatStore } from '../../stores/chatStore'

export default function TypingIndicator({ channelId }) {
  const typing = useChatStore((s) => s.typingByChannel[channelId])

  if (!typing) return null

  const names = Object.values(typing)
  if (names.length === 0) return null

  let text
  if (names.length === 1) {
    text = `${names[0]} is typing`
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing`
  } else {
    text = `${names[0]} and ${names.length - 1} others are typing`
  }

  return (
    <div className="flex items-center gap-2 py-1 px-1">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: 'var(--text-muted)', animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: 'var(--text-muted)', animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: 'var(--text-muted)', animationDelay: '300ms' }} />
      </div>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{text}</span>
    </div>
  )
}
