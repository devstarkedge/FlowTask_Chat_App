import { format } from 'date-fns'
import { Avatar } from '../chat/MemberAvatarGroup'
import HighlightText from './HighlightText'
import './UnifiedSearch.css'

function formatTimestamp(value) {
  if (!value) return ''
  try {
    return format(new Date(value), 'MMM d, h:mm a')
  } catch {
    return ''
  }
}

export default function SearchResultItem({
  item,
  query,
  selected = false,
  onClick,
  showChannel = false,
}) {
  if (!item) return null

  return (
    <button
      type="button"
      className={`channel-search-result ${selected ? 'is-selected' : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onClick?.(item)}
    >
      <span className="channel-search-result__avatar">
        <Avatar
          member={{
            name: item.senderName,
            avatar: item.senderAvatar,
            onlineStatus: 'offline',
          }}
          size={32}
          showStatus={false}
        />
      </span>

      <span className="channel-search-result__body">
        <span className="channel-search-result__top">
          <span className="channel-search-result__sender">{item.senderName}</span>
          {item.reasonLabel && (
            <span className="channel-search-result__badge">{item.reasonLabel}</span>
          )}
          <span className="channel-search-result__time">{formatTimestamp(item.createdAt)}</span>
        </span>

        <span className="channel-search-result__preview">
          <HighlightText text={item.snippet || 'Message'} query={query} />
        </span>

        <span className="channel-search-result__meta">
          {showChannel ? item.channelName : item.channelType === 'dm' ? 'Direct message' : 'Channel message'}
        </span>
      </span>

      {selected && <span className="channel-search-result__enter">↵</span>}
    </button>
  )
}