import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Lock,
  MessageCircle,
  Search,
  Menu,
  Pin,
  FileText,
  Star,
  Headphones,
  Info,
  MoreVertical,
  ChevronDown,
} from 'lucide-react'
import ChannelMemberCount from './ChannelMemberCount'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { channelAPI } from '../../services/api'
import toast from 'react-hot-toast'
import logger from '../../utils/logger'

const EMPTY_PINS = []

const HEADER_TABS = [
  { id: 'messages', label: 'Messages', icon: MessageCircle },
  { id: 'files',    label: 'Files',    icon: FileText },
  // { id: 'untitled', label: 'Untitled', icon: FileText },
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
  const activeThread   = useChatStore((s) => s.activeThread)
  const pinnedMessages =
    useChatStore((s) => s.pinnedMessagesByChannel[channel?._id]) ?? EMPTY_PINS

  const [showMoreActions, setShowMoreActions] = useState(false)
  const [showTabsDropdown, setShowTabsDropdown] = useState(false)
  const [isStarred, setIsStarred]             = useState(false)
  const [narrowTabs, setNarrowTabs]           = useState(false)

  const moreMenuRef    = useRef(null)
  const tabsMenuRef    = useRef(null)
  const headerRef      = useRef(null)

  const isConstrained = showInfoPanel || !!activeThread

  // Measure header width — collapse tabs when < 480px
  useEffect(() => {
    if (!headerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      setNarrowTabs(entry.contentRect.width < 480)
    })
    ro.observe(headerRef.current)
    return () => ro.disconnect()
  }, [])

  // Close action dropdown on outside click
  useEffect(() => {
    if (!showMoreActions) return
    const fn = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target))
        setShowMoreActions(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showMoreActions])

  // Close tabs dropdown on outside click
  useEffect(() => {
    if (!showTabsDropdown) return
    const fn = (e) => {
      if (tabsMenuRef.current && !tabsMenuRef.current.contains(e.target))
        setShowTabsDropdown(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showTabsDropdown])

  if (!channel) return null

  const isPrivate =
    channel.visibility?.toLowerCase() === 'private' ||
    channel.type?.toLowerCase()       === 'private' ||
    channel.isPrivate

  const members  = membersByChannel[channel._id] || []
  const pinCount = pinnedMessages.length

  const activeTabObj   = HEADER_TABS.find((t) => t.id === activeTab) || HEADER_TABS[0]
  const overflowTabs   = HEADER_TABS.filter((t) => t.id !== activeTab)

  // Dynamic padding — reduced from before
  const hPad = isConstrained ? 8 : 14

  return (
    <div
      ref={headerRef}
      className="shrink-0 select-none chat-header"
      style={{ position: 'sticky', top: 0, zIndex: 20 }}
    >
      {/* ══════════════════════════════════════════════════════════════
          TOP ROW — [mobile-btn] [name: flex-1] [actions: shrink-0]
      ══════════════════════════════════════════════════════════════ */}
      <div
        className="flex items-center"
        style={{ padding: `8px ${hPad}px 4px`, gap: 3, minHeight: 48 }}
      >
        {/* Mobile sidebar toggle */}
        <HdrBtn
          icon={Menu}
          title="Open sidebar"
          onClick={onOpenMobileSidebar}
          className="mobile-menu-btn"
          size={18}
        />

        {/* Channel name */}
        <button
          className="chat-header__channel-trigger flex items-center gap-1.5 min-w-0 flex-1 text-left rounded-lg group"
          style={{ padding: '3px 6px', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onClick={toggleInfoPanel}
          title={channel.name || channel.slug}
        >
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); setIsStarred((s) => !s) }}
            className={`chat-header__star shrink-0${isStarred ? ' is-active' : ''}`}
            title={isStarred ? 'Unstar' : 'Star channel'}
          >
            <Star size={14} fill={isStarred ? 'currentColor' : 'none'} />
          </span>

          <h2
            className="font-bold truncate group-hover:underline"
            style={{
              fontSize: isConstrained ? 14 : 17,
              color: 'var(--text-primary)',
              lineHeight: 1.3,
              minWidth: 0,
            }}
          >
            {channel.name || channel.slug}
          </h2>

          {isPrivate && (
            <Lock size={10} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
          )}
        </button>

        {/* Right actions */}
        <div
          className="flex items-center flex-shrink-0"
          ref={moreMenuRef}
          style={{ gap: 2, position: 'relative' }}
        >
          {!isConstrained && (
            <ChannelMemberCount
              count={members.length}
              onClick={(e) => { e.stopPropagation(); toggleInfoPanel() }}
              className="hide-mobile"
            />
          )}

          <HdrBtn
            icon={Pin}
            title="Pinned messages"
            label={pinCount > 0 && !isConstrained ? String(pinCount) : undefined}
            onClick={onTogglePins}
            size={14}
          />

          {!isConstrained && (
            <HdrBtn
              icon={Search}
              title="Search messages"
              onClick={onToggleSearch}
              className="hide-mobile"
              size={14}
            />
          )}

          <HdrBtn
            icon={MoreVertical}
            title="More options"
            onClick={() => setShowMoreActions((v) => !v)}
            className={showMoreActions ? 'is-active' : ''}
            size={14}
          />

          {showMoreActions && (
            <div
              className="chat-header__menu absolute py-1 z-50 animate-fade-in-up"
              style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 196 }}
            >
              {isConstrained && (
                <>
                  <DropItem
                    icon={Search}
                    label="Search Messages"
                    onClick={() => { onToggleSearch(); setShowMoreActions(false) }}
                  />
                  <DropItem
                    icon={Pin}
                    label="Pinned Messages"
                    sublabel={pinCount > 0 ? `${pinCount} pinned` : undefined}
                    onClick={() => { onTogglePins(); setShowMoreActions(false) }}
                  />
                  <DropItem
                    icon={Headphones}
                    label="Huddle"
                    onClick={() => { logger.log('Huddle', channel?._id); setShowMoreActions(false) }}
                    className="md:hidden"
                  />
                  <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 10px' }} />
                </>
              )}
              <DropItem
                icon={Info}
                label="Channel Details"
                onClick={() => { toggleInfoPanel(); setShowMoreActions(false) }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB BAR
          Wide  → all tabs shown with labels (normal)
          Narrow → only the active tab shown + "More ▾" button
                   clicking More reveals the other tabs in a dropdown
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ padding: `0 ${hPad}px 8px` }}>
        <div className="flex items-center" style={{ minHeight: 34, gap: 2 }}>

          {narrowTabs ? (
            /* ── Narrow mode: active tab + overflow dropdown ── */
            <>
              {/* Active tab — always visible */}
              <SlimTab
                tab={activeTabObj}
                isActive={true}
                onClick={() => {}} /* already active */
              />

              {/* More tabs dropdown */}
              <div ref={tabsMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowTabsDropdown((v) => !v)}
                  className={`slim-tab${showTabsDropdown ? ' slim-tab--active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <span className="slim-tab__label">More</span>
                  <ChevronDown
                    size={12}
                    style={{
                      transform: showTabsDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 180ms ease',
                    }}
                  />
                </button>

                {showTabsDropdown && (
                  <div
                    className="chat-header__menu absolute py-1 z-50 animate-fade-in-up"
                    style={{ top: 'calc(100% + 4px)', left: 0, minWidth: 160 }}
                  >
                    {overflowTabs.map((tab) => (
                      <DropItem
                        key={tab.id}
                        icon={tab.icon}
                        label={tab.label}
                        onClick={() => {
                          onTabChange?.(tab.id)
                          setShowTabsDropdown(false)
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Full mode: all tabs with labels ── */
            HEADER_TABS.map((tab) => (
              <SlimTab
                key={tab.id}
                tab={tab}
                isActive={activeTab === tab.id}
                onClick={() => onTabChange?.(tab.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ── SlimTab ────────────────────────────────────────────────────────────── */
function SlimTab({ tab, isActive, onClick }) {
  const Icon = tab.icon
  return (
    <button
      onClick={onClick}
      className={`slim-tab${isActive ? ' slim-tab--active' : ''}`}
    >
      <Icon size={13} className="slim-tab__icon shrink-0" />
      <span className="slim-tab__label">{tab.label}</span>
    </button>
  )
}

/* ── HdrBtn ─────────────────────────────────────────────────────────────── */
function HdrBtn({ icon: Icon, title, label, onClick, className = '', size = 14 }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'chat-header__icon-btn shrink-0 inline-flex items-center justify-center gap-1',
        'rounded-lg cursor-pointer transition-all',
        label ? 'h-7 px-2' : 'h-7 w-7',
        className,
      ].join(' ')}
    >
      <Icon size={size} />
      {label && (
        <span className="font-bold hide-mobile leading-none" style={{ fontSize: 11 }}>
          {label}
        </span>
      )}
    </button>
  )
}

/* ── DropItem ────────────────────────────────────────────────────────────── */
function DropItem({ icon: Icon, label, sublabel, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={[
        'chat-header__menu-item w-full flex items-center gap-3',
        'px-3 py-2 text-left transition-colors',
        className,
      ].join(' ')}
    >
      <Icon size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
      <span className="flex flex-col min-w-0">
        <span className="font-semibold truncate" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
          {label}
        </span>
        {sublabel && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {sublabel}
          </span>
        )}
      </span>
    </button>
  )
}