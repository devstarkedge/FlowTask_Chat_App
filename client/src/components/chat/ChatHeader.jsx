import { useMemo, useState, useRef, useEffect } from 'react'
import {
  Hash,
  Lock,
  Users,
  MessageCircle,
  Search,
  Info,
  Menu,
  Pin,
  FileText,
  Star,
  Headphones,
  Plus,
  MoreVertical,
} from 'lucide-react'
import MemberAvatarGroup from './MemberAvatarGroup'
import TabBar from '../ui/TabBar'
import ChannelMemberCount from './ChannelMemberCount'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { channelAPI } from '../../services/api'
import toast from 'react-hot-toast'
import logger from '../../utils/logger'

const TYPE_ICONS = {
  project: Hash,
  department: Users,
  team: Users,
  dm: MessageCircle,
  system: Hash,
}

const EMPTY_PINS = []

const HEADER_TABS = [
  { id: 'messages', label: 'Messages', icon: MessageCircle },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'untitled', label: 'Untitled', icon: FileText },
]

export default function ChatHeader({
  channel,
  onToggleSearch,
  onOpenMobileSidebar,
  onTogglePins,
  activeTab = 'messages',
  onTabChange,
}) {
  const { membersByChannel, toggleInfoPanel, updateChannel, showInfoPanel } =
    useChannelStore()
  const activeThread = useChatStore((s) => s.activeThread)
  const pinnedMessages =
    useChatStore((s) => s.pinnedMessagesByChannel[channel?._id]) ?? EMPTY_PINS
  const [showMoreActions, setShowMoreActions] = useState(false)
  const moreMenuRef = useRef(null)

  const isConstrained = showInfoPanel || !!activeThread

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreActions(false)
      }
    }
    if (showMoreActions) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMoreActions])

  const [editingTopic, setEditingTopic] = useState(false)
  const [topicValue, setTopicValue] = useState('')
  const [isStarred, setIsStarred] = useState(false)
  const topicInputRef = useRef(null)

  const handleToggleStar = () => {
    setIsStarred((s) => !s)
  }

  const handleHuddleClick = () => {
    // TODO: implement huddle feature
    logger.log('Huddle clicked for channel:', channel?._id)
  }

  if (!channel) return null

  let Icon = TYPE_ICONS[channel.type] || Hash
  const isPrivate =
    channel.visibility?.toLowerCase() === 'private' ||
    channel.type?.toLowerCase() === 'private' ||
    channel.isPrivate
  if (isPrivate) {
    Icon = Lock
  }
  const members = membersByChannel[channel._id] || []
  const isDM = channel.type === 'dm'

  const handleTopicClick = () => {
    setTopicValue(channel.topic || '')
    setEditingTopic(true)
    setTimeout(() => topicInputRef.current?.focus(), 0)
  }

  const handleTopicSave = async () => {
    setEditingTopic(false)
    if (topicValue === (channel.topic || '')) return
    try {
      await channelAPI.update(channel._id, { topic: topicValue })
      if (updateChannel) updateChannel(channel._id, { topic: topicValue })
    } catch {
      toast.error('Failed to update topic')
    }
  }

  return (
    <div
      className="shrink-0 select-none chat-header"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Top row: channel info */}
      <div className="flex items-center px-6 pt-3 pb-2 gap-4">
        {/* Mobile Menu */}
        <button
          onClick={onOpenMobileSidebar}
          className="mobile-menu-btn p-2 rounded-lg cursor-pointer transition-colors"
          style={{
            color: 'var(--text-muted)',
            background: 'transparent',
            border: 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Menu size={20} />
        </button>

        {/* Channel Name & Details */}
        <div
          className="chat-header__channel-trigger flex items-center gap-3 min-w-0 cursor-pointer group py-1.5 px-2 -ml-2 rounded-lg transition-colors"
          onClick={toggleInfoPanel}
        >
          {/* Star moved to the front where the channel type icon used to be. */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleToggleStar()
            }}
            className={`chat-header__star p-1 rounded cursor-pointer transition-colors shrink-0 ${isStarred ? 'is-active' : ''}`}
            aria-pressed={isStarred}
            title={isStarred ? 'Unstar channel' : 'Star channel'}
          >
            <Star size={18} fill={isStarred ? 'currentColor' : 'none'} />
          </button>

          <h2 className="font-bold text-[20px] truncate group-hover:underline" style={{ color: 'var(--text-primary)' }}>
            {channel.name || channel.slug}
          </h2>
        </div>

        {/* Topic — editable on click (placed before right actions so actions align right) */}
        {!isDM && (
          <div className="flex items-center hide-mobile">
            <div className="w-px h-8 mx-4" style={{ background: 'var(--border-color)' }} />
            {editingTopic ? (
              <input
                ref={topicInputRef}
                value={topicValue}
                onChange={(e) => setTopicValue(e.target.value)}
                onBlur={handleTopicSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur()
                  }
                  if (e.key === 'Escape') setEditingTopic(false)
                }}
                placeholder="Add a topic"
                className="text-[15px] bg-transparent outline-none px-2 py-1 rounded"
                style={{
                  color: 'var(--text-primary)',
                  maxWidth: 300,
                  border: '1px solid var(--accent-color)',
                }}
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                className="chat-header__topic text-[15px] truncate cursor-pointer hover:underline px-2 py-1 rounded transition-colors"
                style={{ color: 'var(--text-muted)', maxWidth: 300 }}
                onClick={handleTopicClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleTopicClick()
                  }
                }}
                title={channel.topic || 'Click to add a topic'}
              >
                {channel.topic || 'Add a topic'}
              </span>
            )}
          </div>
        )}

        {/* Right-aligned actions: member count, pin, search, more (top row) */}
        <div className="absolute right-6 top-3 flex items-center gap-2" ref={moreMenuRef}>
          {!isConstrained && (
            <>
              <ChannelMemberCount
                count={members.length}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleInfoPanel()
                }}
                className="hide-mobile"
              />

              <HeaderBtn
                icon={Pin}
                title="Pinned messages"
                label={pinnedMessages.length > 0 ? String(pinnedMessages.length) : undefined}
                onClick={onTogglePins}
              />

              <HeaderBtn icon={Search} title="Search" onClick={onToggleSearch} />
            </>
          )}

          <HeaderBtn icon={MoreVertical} title="More" onClick={() => setShowMoreActions(!showMoreActions)} className={showMoreActions ? 'is-active' : ''} />

          {showMoreActions && (
            <div className="chat-header__menu absolute top-full right-0 mt-2 w-56 rounded-lg py-2 z-50 animate-fade-in-up">
              {isConstrained && (
                <>
                  <button
                    className="chat-header__menu-item w-full flex items-center gap-3 px-4 py-3 transition-colors text-left group"
                    onClick={() => {
                      onTogglePins()
                      setShowMoreActions(false)
                    }}
                  >
                    <Pin size={18} style={{ color: 'var(--text-muted)' }} />
                    <div className="flex flex-col">
                      <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Pinned Messages
                      </span>
                      {pinnedMessages.length > 0 && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{pinnedMessages.length} items pinned</span>}
                    </div>
                  </button>

                  <button
                    className="chat-header__menu-item w-full flex items-center gap-3 px-4 py-3 transition-colors text-left group"
                    onClick={() => {
                      onToggleSearch()
                      setShowMoreActions(false)
                    }}
                  >
                    <Search size={18} style={{ color: 'var(--text-muted)' }} />
                    <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Search Messages</span>
                  </button>

                  <button
                    className="chat-header__menu-item w-full flex items-center gap-3 px-4 py-3 transition-colors text-left group md:hidden"
                    onClick={() => {
                      handleHuddleClick()
                      setShowMoreActions(false)
                    }}
                  >
                    <Headphones size={18} style={{ color: 'var(--text-muted)' }} />
                    <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Huddle</span>
                  </button>

                  <div className="h-px my-2 mx-2" style={{ background: 'var(--border-color)' }} />
                </>
              )}

              <button
                className="chat-header__menu-item w-full flex items-center gap-3 px-4 py-3 transition-colors text-left group"
                onClick={() => {
                  toggleInfoPanel()
                  setShowMoreActions(false)
                }}
              >
                <Info size={18} style={{ color: 'var(--text-muted)' }} />
                <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Channel Details</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs & Actions row as slim tab bar */}
      <div className="px-6 pb-4">
          <div className="chat-header__toolbar flex items-center px-3 h-12 relative">
            <div className="min-w-0">
              <TabBar tabs={HEADER_TABS} activeTab={activeTab} onTabChange={onTabChange} compact={isConstrained} />
            </div>
          </div>
      </div>
    </div>
  )
}

function HeaderBtn({ icon: Icon, title, label, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`chat-header__icon-btn shrink-0 flex items-center justify-center gap-2 ${label ? 'px-4' : 'w-8'} h-8 rounded-lg cursor-pointer transition-all ${className}`}
    >
      <Icon size={16} />
      {label && (
        <span className="text-[14px] font-bold hide-mobile ml-0.5">{label}</span>
      )}
    </button>
  )
}
