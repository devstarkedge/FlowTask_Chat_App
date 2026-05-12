import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { formatDistanceToNowStrict } from 'date-fns'
import { useChannelStore } from '../../stores/channelStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../chat/MemberAvatarGroup'
import { Bell, FileText, FolderOpen, MessageSquare, Video, Image as ImageIcon } from 'lucide-react'
import { fileAPI } from '../../services/api'
import { getActivityPath, getDMPath, getFilesPath } from '../../utils/chatRoutes'
import { getNotificationText, normalizeNotification } from '../../utils/notificationFormat'

const PANEL_WIDTH = 352
const PANEL_MAX_HEIGHT = 540
const GAP = 10
const INSET = 12
const PREVIEW_LIMIT = 14
const FILE_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const BOUNDARY_BUFFER = 12

function getFileKind(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}

function KindIcon({ kind }) {
  if (kind === 'image') return <ImageIcon size={14} style={{ color: 'var(--accent-primary)' }} />
  if (kind === 'video') return <Video size={14} style={{ color: 'var(--accent-purple)' }} />
  return <FileText size={14} style={{ color: 'var(--text-muted)' }} />
}

function formatTime(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDistanceToNowStrict(parsed, { addSuffix: true })
}

function sortDMs(channels, unreads) {
  return [...channels].sort((a, b) => {
    const aUnread = unreads[a._id] || 0
    const bUnread = unreads[b._id] || 0
    if (aUnread > 0 && bUnread === 0) return -1
    if (aUnread === 0 && bUnread > 0) return 1

    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
    if (aTime !== bTime) return bTime - aTime

    return (a.name || '').localeCompare(b.name || '')
  })
}

function getActivityStatus(type) {
  if (type === 'mention') return { label: 'Mentioned', className: 'mentioned' }
  if (type === 'thread_reply') return { label: 'Replied', className: 'replied' }
  if (type === 'dm') return { label: 'DM', className: 'dm' }
  if (type === 'system') return { label: 'System', className: 'system' }
  return null
}

function resolvePanelPosition(anchorRect, panelHeight = PANEL_MAX_HEIGHT) {
  const next = { left: INSET, top: INSET }
  if (!anchorRect) return next

  const preferredRight = anchorRect.right + GAP
  const rightOverflow = preferredRight + PANEL_WIDTH > window.innerWidth - INSET

  next.left = rightOverflow
    ? Math.max(INSET, anchorRect.left - PANEL_WIDTH - GAP)
    : preferredRight

  const maxTop = Math.max(INSET, window.innerHeight - panelHeight - INSET)
  next.top = Math.min(maxTop, Math.max(INSET, anchorRect.top - 4))

  return next
}

export default function HoverPreview({
  section,
  anchorRect,
  onClose,
  onPanelMouseEnter,
  onPanelMouseLeave,
}) {
  const ref = useRef(null)
  const boundaryActiveRef = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { workspaceId } = useParams()
  const channels = useChannelStore((s) => s.channels)
  const unreads = useChannelStore((s) => s.unreads)
  const activeChannelId = useChannelStore((s) => s.activeChannelId)
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel)
  const { onlineUsers } = useChatStore()
  const { user } = useAuthStore()
  const {
    notifications,
    unreadCount,
    isLoading: notificationsLoading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
  } = useNotificationStore()

  const [dmUnreadOnly, setDmUnreadOnly] = useState(false)
  const [activityTab, setActivityTab] = useState('all')
  const [files, setFiles] = useState([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesStarredOnly, setFilesStarredOnly] = useState(false)
  const [position, setPosition] = useState({ left: INSET, top: INSET })

  const focusableSelector = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

  useEffect(() => {
    if (!anchorRect) return

    const updatePosition = () => {
      const panelHeight = ref.current?.offsetHeight || PANEL_MAX_HEIGHT
      setPosition(resolvePanelPosition(anchorRect, panelHeight))
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [anchorRect, section])

  useEffect(() => {
    if (!anchorRect) return undefined

    const isWithinExpandedRect = (x, y, rect, buffer = 0) => (
      x >= rect.left - buffer &&
      x <= rect.right + buffer &&
      y >= rect.top - buffer &&
      y <= rect.bottom + buffer
    )

    const handlePointerMove = (event) => {
      const panelRect = ref.current?.getBoundingClientRect()
      if (!panelRect) return

      const inAnchor = isWithinExpandedRect(event.clientX, event.clientY, anchorRect, BOUNDARY_BUFFER)
      const inPanel = isWithinExpandedRect(event.clientX, event.clientY, panelRect, BOUNDARY_BUFFER)

      const panelOnRight = panelRect.left >= anchorRect.right
      const anchorEdgeX = panelOnRight ? anchorRect.right : anchorRect.left
      const panelEdgeX = panelOnRight ? panelRect.left : panelRect.right

      const corridorRect = {
        left: Math.min(anchorEdgeX, panelEdgeX),
        right: Math.max(anchorEdgeX, panelEdgeX),
        top: Math.min(anchorRect.top, panelRect.top),
        bottom: Math.max(anchorRect.bottom, panelRect.bottom),
      }

      const inCorridor = isWithinExpandedRect(event.clientX, event.clientY, corridorRect, BOUNDARY_BUFFER)
      const inBoundary = inAnchor || inPanel || inCorridor

      if (inBoundary && !boundaryActiveRef.current) {
        boundaryActiveRef.current = true
        onPanelMouseEnter?.()
      } else if (!inBoundary && boundaryActiveRef.current) {
        boundaryActiveRef.current = false
        onPanelMouseLeave?.()
      }
    }

    document.addEventListener('pointermove', handlePointerMove)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      boundaryActiveRef.current = false
    }
  }, [anchorRect, onPanelMouseEnter, onPanelMouseLeave, position.left, position.top])

  useEffect(() => {
    if (!anchorRect) return undefined

    const isWithinRect = (x, y, rect, buffer = 0) => (
      x >= rect.left - buffer &&
      x <= rect.right + buffer &&
      y >= rect.top - buffer &&
      y <= rect.bottom + buffer
    )

    const handlePointerDown = (event) => {
      const panelRect = ref.current?.getBoundingClientRect()
      if (!panelRect) return

      const target = event.target
      if (target instanceof Node && ref.current?.contains(target)) return

      const inPanelRect = isWithinRect(event.clientX, event.clientY, panelRect, 2)
      const inAnchorRect = isWithinRect(event.clientX, event.clientY, anchorRect, 2)

      if (!inPanelRect && !inAnchorRect) {
        onClose?.()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [anchorRect, onClose])

  useEffect(() => {
    if (section !== 'activity') return
    if (notifications.length > 0) return
    fetchNotifications(true)
    fetchUnreadCount()
  }, [fetchNotifications, fetchUnreadCount, notifications.length, section])

  const loadFiles = useCallback(async () => {
    setFilesLoading(true)
    try {
      const { data } = await fileAPI.listWorkspace({ limit: 24 })
      const items = data?.data?.items || []
      setFiles(items)
    } catch {
      setFiles([])
    } finally {
      setFilesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (section !== 'files') return
    if (files.length > 0 || filesLoading) return
    loadFiles()
  }, [files.length, filesLoading, loadFiles, section])

  if (!anchorRect) return null

  const currentChatId = user?._id?.toString?.()
  const currentFlowTaskId = user?.flowTaskUserId?.toString?.()
  const selfIds = new Set([currentChatId, currentFlowTaskId].filter(Boolean))

  const dmChannels = useMemo(() => {
    const mapped = channels
      .filter((channel) => channel.type === 'dm' && !channel.isArchived)
      .map((channel) => {
        const participants = Array.isArray(channel.dmParticipants)
          ? channel.dmParticipants.map((p) => p?.toString?.() || String(p))
          : []
        const recipientId = channel.dmRecipientId || participants.find((p) => p && !selfIds.has(p)) || null
        
        // Extract DM participant names and filter out current user
        let displayName = channel.name
        if (channel.dmParticipantNames && Array.isArray(channel.dmParticipantNames)) {
          const otherNames = channel.dmParticipantNames.filter(name => {
            const userName = user?.name || ''
            return name !== userName
          })
          if (otherNames.length > 0) {
            displayName = otherNames.join(', ')
          }
        } else if (channel.name && channel.name.includes(',')) {
          // Fallback: parse comma-separated names
          const names = channel.name.split(',').map(n => n.trim())
          const userName = user?.name || ''
          const otherNames = names.filter(name => name !== userName)
          if (otherNames.length > 0) {
            displayName = otherNames.join(', ')
          }
        }
        
        return { ...channel, dmRecipientId: recipientId, name: displayName }
      })

    const sorted = sortDMs(mapped, unreads)
    const filtered = dmUnreadOnly ? sorted.filter((item) => (unreads[item._id] || 0) > 0) : sorted
    return filtered.slice(0, PREVIEW_LIMIT)
  }, [channels, dmUnreadOnly, selfIds, unreads, user])

  const filteredNotifications = useMemo(() => {
    const map = {
      all: null,
      mentions: ['mention'],
      dms: ['dm'],
      replies: ['thread_reply'],
      system: ['system'],
    }
    const allowed = map[activityTab]
    const list = allowed ? notifications.filter((n) => allowed.includes(n.type)) : notifications
    return list.slice(0, PREVIEW_LIMIT)
  }, [activityTab, notifications])

  const visibleFiles = useMemo(() => {
    const source = filesStarredOnly
      ? files.filter((file) => Boolean(file.isStarred || file.starred))
      : files
    return source.slice(0, PREVIEW_LIMIT)
  }, [files, filesStarredOnly])

  const groupedFiles = useMemo(() => {
    const now = Date.now()
    return visibleFiles.reduce((acc, file) => {
      const updatedAt = new Date(file.uploadedAt || file.updatedAt || file.createdAt).getTime()
      const key = Number.isFinite(updatedAt) && now - updatedAt <= FILE_RECENT_WINDOW_MS ? 'recent' : 'older'
      acc[key].push(file)
      return acc
    }, { recent: [], older: [] })
  }, [visibleFiles])

  const openDM = useCallback((channel) => {
    if (!workspaceId || !channel?._id) return
    setActiveChannel(channel._id)
    navigate(getDMPath(workspaceId, channel._id))
    onClose?.()
  }, [navigate, onClose, setActiveChannel, workspaceId])

  const openNotification = useCallback(async (notification) => {
    if (!workspaceId || !notification?._id) return
    if (!notification.isRead) {
      await markAsRead(notification._id)
    }
    const channelId = notification?.channelId?._id || notification?.channelId
    if (channelId) setActiveChannel(channelId)
    navigate(getActivityPath(workspaceId, notification._id))
    onClose?.()
  }, [markAsRead, navigate, onClose, workspaceId, setActiveChannel])

  const openFile = useCallback((file) => {
    if (!workspaceId || !file?.referenceId) return
    navigate(getFilesPath(workspaceId, file.referenceId))
    onClose?.()
  }, [navigate, onClose, workspaceId])

  const moveKeyboardFocus = useCallback((direction) => {
    if (!ref.current) return
    const focusable = Array.from(ref.current.querySelectorAll(focusableSelector))
      .filter((element) => element instanceof HTMLElement)
    if (focusable.length === 0) return

    const currentIndex = focusable.indexOf(document.activeElement)
    if (currentIndex === -1) {
      focusable[0].focus()
      return
    }

    const offset = direction === 'next' ? 1 : -1
    const nextIndex = (currentIndex + offset + focusable.length) % focusable.length
    focusable[nextIndex].focus()
  }, [focusableSelector])

  const handlePanelKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose?.()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveKeyboardFocus('next')
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveKeyboardFocus('prev')
    }
  }, [moveKeyboardFocus, onClose])

  const handlePanelBlur = useCallback((event) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && ref.current?.contains(nextTarget)) {
      return
    }
    onPanelMouseLeave?.()
  }, [onPanelMouseLeave])

  let content = null

  if (section === 'dms') {
    content = (
      <>
        <div className="hover-preview-header">
          <div className="hover-preview-heading">
            <MessageSquare size={14} style={{ color: 'var(--accent-primary)' }} />
            <span>Direct Messages</span>
          </div>
          <button
            className={`hover-preview-toggle ${dmUnreadOnly ? 'active' : ''}`}
            onClick={() => setDmUnreadOnly((value) => !value)}
            type="button"
          >
            Unread
          </button>
        </div>

        <div className="hover-preview-body" role="listbox" aria-label="Direct messages preview">
          {dmChannels.length === 0 && (
            <p className="hover-preview-empty">No recent DMs.</p>
          )}

          {dmChannels.map((channel) => {
            const unread = unreads[channel._id] || 0
            const isActive = activeChannelId === channel._id || location.pathname.includes(`/dms/${channel._id}`)
            const dmStatus = onlineUsers?.has?.(channel.dmRecipientId) ? 'online' : 'offline'
            return (
              <button
                key={channel._id}
                className={`hover-preview-item ${isActive ? 'active' : ''}`}
                onClick={() => openDM(channel)}
                type="button"
              >
                <Avatar
                  member={{ name: channel.name, avatar: channel.avatar, onlineStatus: dmStatus }}
                  size={30}
                  showStatus={true}
                />

                <span className="hover-preview-item-content">
                  <span className="hover-preview-item-row">
                    <span className="hover-preview-item-title">{channel.name}</span>
                    <span className="hover-preview-item-time">{formatTime(channel.lastMessageAt)}</span>
                  </span>
                  <span className="hover-preview-item-subtitle">
                    {channel.lastMessagePreview || 'Start a conversation'}
                  </span>
                </span>

                <span className="hover-preview-item-indicators">
                  {dmStatus === 'online' && <span className="hover-preview-dot online" />}
                  {unread > 0 && <span className="badge badge-red">{unread > 99 ? '99+' : unread}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </>
    )
  }

  if (section === 'activity') {
    const tabs = [
      { id: 'all', label: 'All' },
      { id: 'mentions', label: 'Mentions' },
      { id: 'dms', label: 'DMs' },
      { id: 'replies', label: 'Replies' },
      { id: 'system', label: 'System' },
    ]

    content = (
      <>
        <div className="hover-preview-header">
          <div className="hover-preview-heading">
            <Bell size={14} style={{ color: 'var(--accent-primary)' }} />
            <span>Activity</span>
            {unreadCount > 0 && (
              <span className="hover-preview-count">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </div>
        </div>

        <div className="hover-preview-tabs" role="tablist" aria-label="Activity tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`hover-preview-tab ${activityTab === tab.id ? 'active' : ''}`}
              onClick={() => setActivityTab(tab.id)}
              role="tab"
              aria-selected={activityTab === tab.id}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="hover-preview-body" role="listbox" aria-label="Activity preview">
          {notificationsLoading && filteredNotifications.length === 0 && (
            <p className="hover-preview-empty">Loading activity...</p>
          )}

          {!notificationsLoading && filteredNotifications.length === 0 && (
            <p className="hover-preview-empty">No activity in this tab.</p>
          )}

          {filteredNotifications.map((notification) => {
            const normalized = normalizeNotification(notification)
            const status = getActivityStatus(notification.type)
            const isActive = location.pathname.includes(`/activity/${notification._id}`)
            const context = notification.type === 'dm'
              ? 'DM'
              : notification.channelId?.name || notification.channelName
                ? `#${notification.channelId?.name || notification.channelName}`
                : 'Workspace'

            return (
              <button
                key={notification._id}
                className={`hover-preview-item ${isActive ? 'active' : ''}`}
                onClick={() => openNotification(notification)}
                type="button"
              >
                <Avatar
                  member={{
                    name: normalized?.senderName || 'System',
                    avatar: normalized?.senderAvatar,
                  }}
                  size={30}
                  showStatus={false}
                />

                <span className="hover-preview-item-content">
                  <span className="hover-preview-item-row">
                    <span className="hover-preview-item-title">{getNotificationText(notification)}</span>
                    <span className="hover-preview-item-time">{formatTime(notification.createdAt)}</span>
                  </span>

                  <span className="hover-preview-item-subtitle">
                    {notification.body || context}
                  </span>
                </span>

                <span className="hover-preview-item-indicators">
                  {status && <span className={`hover-preview-status ${status.className}`}>{status.label}</span>}
                  {!notification.isRead && <span className="hover-preview-dot unread" />}
                </span>
              </button>
            )
          })}
        </div>
      </>
    )
  }

  if (section === 'files') {
    const renderFileGroup = (label, items) => (
      <div className="hover-preview-group" key={label}>
        <p className="hover-preview-group-title">{label}</p>
        {items.map((file) => {
          const isActive = location.pathname.includes(`/files/${file.referenceId}`)
          const source = file.channel?.type === 'dm'
            ? 'DM'
            : file.channel?.name
              ? `#${file.channel.name}`
              : 'Workspace'

          return (
            <button
              key={file.referenceId}
              className={`hover-preview-item ${isActive ? 'active' : ''}`}
              onClick={() => openFile(file)}
              type="button"
            >
              <span className="hover-preview-file-icon" aria-hidden="true">
                <KindIcon kind={getFileKind(file.mimeType)} />
              </span>

              <span className="hover-preview-item-content">
                <span className="hover-preview-item-row">
                  <span className="hover-preview-item-title">{file.fileName}</span>
                  <span className="hover-preview-item-time">{formatTime(file.uploadedAt || file.updatedAt)}</span>
                </span>
                <span className="hover-preview-item-subtitle">{source}</span>
              </span>
            </button>
          )
        })}
      </div>
    )

    content = (
      <>
        <div className="hover-preview-header">
          <div className="hover-preview-heading">
            <FolderOpen size={14} style={{ color: 'var(--accent-primary)' }} />
            <span>Files</span>
          </div>
          {/* <button
            className={`hover-preview-toggle ${filesStarredOnly ? 'active' : ''}`}
            onClick={() => setFilesStarredOnly((value) => !value)}
            type="button"
          >
            Starred
          </button> */}
        </div>

        <div className="hover-preview-body" role="listbox" aria-label="Files preview">
          {filesLoading && <p className="hover-preview-empty">Loading files...</p>}
          {!filesLoading && visibleFiles.length === 0 && (
            <p className="hover-preview-empty">No files found.</p>
          )}

          {!filesLoading && groupedFiles.recent.length > 0 && renderFileGroup('Recent', groupedFiles.recent)}
          {!filesLoading && groupedFiles.older.length > 0 && renderFileGroup('Older', groupedFiles.older)}
        </div>
      </>
    )
  }

  if (!content) return null

  if (typeof document === 'undefined' || !document.body) return null

  return createPortal(
    <div
      ref={ref}
      className="hover-preview"
      style={{ top: position.top, left: position.left, width: PANEL_WIDTH, maxHeight: PANEL_MAX_HEIGHT }}
      onMouseEnter={onPanelMouseEnter}
      onMouseLeave={onPanelMouseLeave || onClose}
      onPointerEnter={onPanelMouseEnter}
      onPointerLeave={onPanelMouseLeave || onClose}
      onFocusCapture={onPanelMouseEnter}
      onBlurCapture={handlePanelBlur}
      onKeyDown={handlePanelKeyDown}
      role="dialog"
      aria-label={`${section} preview`}
      tabIndex={-1}
    >
      {content}
    </div>,
    document.body,
  )
}
