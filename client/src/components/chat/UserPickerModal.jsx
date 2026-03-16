import { useState, useEffect, useRef, useCallback } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { userAPI } from '../../services/api'
import { joinChannel } from '../../services/socket'
import { X, Search, Loader2, MessageCircle, User } from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'
import toast from 'react-hot-toast'
import logger from '../../utils/logger'

/**
 * UserPickerModal — modal for selecting a user to start a DM conversation.
 * Features:
 *  - Search with 400ms debounce
 *  - Excludes current user
 *  - Shows online indicators
 *  - Deduplicates existing DM channels
 *  - Double-click protection
 *  - Keyboard navigation (arrows + Enter + Escape)
 */
export default function UserPickerModal({ onClose, onSelect }) {
  const { user } = useAuthStore()
  const { channels, createDM } = useChannelStore()
  const { onlineUsers } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchInputRef = useRef(null)
  const listRef = useRef(null)
  const debounceRef = useRef(null)

  const dmMatchesTarget = useCallback((channel, target) => {
    if (!channel || channel.type !== 'dm') return false
    const ids = new Set(
      (channel.dmParticipants || []).map((p) => p?.toString?.() || String(p))
    )
    if (channel.dmRecipientId) {
      ids.add(channel.dmRecipientId?.toString?.() || String(channel.dmRecipientId))
    }
    return ids.has(target?.toString?.() || String(target))
  }, [])

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Search users with 400ms debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!searchQuery.trim()) {
      // Load initial users without query
      debounceRef.current = setTimeout(() => {
        fetchUsers('')
      }, 100)
      return
    }

    debounceRef.current = setTimeout(() => {
      fetchUsers(searchQuery.trim())
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery])

  const fetchUsers = async (query) => {
    setIsLoading(true)
    try {
      const { data } = await userAPI.getDMContacts(query)
      // dm-contacts returns { data: { contacts: [...], meta: {...} } }
      // Server already excludes the current user and deduplicates
      const contacts = data.data?.contacts || []
      setUsers(contacts)
      setSelectedIndex(0)
    } catch (error) {
      logger.error('Failed to fetch DM contacts:', error)
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectUser = useCallback(async (targetUser) => {
    if (isCreating) return // Double-click guard

    // dm-contacts returns chatUserId (ChatApp _id) and/or flowTaskUserId
    const targetId = targetUser.chatUserId || targetUser.flowTaskUserId
   
    if (!targetId) {
      logger.error('Cannot start DM: user has no valid identifier', targetUser)
      toast.error('Unable to start conversation with this user')
      return
    }

    setIsCreating(true)
    try {
      // Check if DM already exists in local state
      const existingDM = channels.find(
        (c) => c.type === 'dm' && c.dmParticipants?.includes(targetId)      )

      if (existingDM) {
        onSelect(existingDM._id)
        return
      }

      // Create new DM
      const channel = await createDM(targetId)
      // Join socket room
      joinChannel(channel._id)
      onSelect(channel._id)
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Failed to start conversation'
      toast.error(msg)
      setIsCreating(false)
    }
  }, [isCreating, channels, createDM, onSelect, dmMatchesTarget])

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, users.length - 1))
      scrollToSelected(selectedIndex + 1)
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
      scrollToSelected(selectedIndex - 1)
    }
    if (e.key === 'Enter' && users[selectedIndex]) {
      e.preventDefault()
      handleSelectUser(users[selectedIndex])
    }
  }

  const scrollToSelected = (index) => {
    const list = listRef.current
    if (!list) return
    const item = list.children[index]
    if (item) item.scrollIntoView({ block: 'nearest' })
  }

  const isUserOnline = (u) => {
    return onlineUsers?.has?.(u.chatUserId) || onlineUsers?.has?.(u.flowTaskUserId) || u.onlineStatus === 'online'
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-content w-full max-w-md mx-4" style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-secondary)' }}
        >
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>
              New message
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Start a direct message conversation
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md cursor-pointer transition-colors"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent border-none outline-none text-sm"
              style={{ color: 'var(--text-primary)' }}
            />
            {isLoading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
          </div>
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto py-1" ref={listRef}>
          {isLoading && users.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <User size={32} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {searchQuery ? 'No users found' : 'No users available'}
              </p>
            </div>
          ) : (
            users.map((u, index) => {
              const online = isUserOnline(u)
              const isSelected = index === selectedIndex
              const uId = u.chatUserId || u.flowTaskUserId
              // Check if DM already exists
              const existingDM = channels.find(
                (c) => dmMatchesTarget(c, uId)
              )

              return (
                <button
                  key={u.chatUserId || u.flowTaskUserId || u.email}
                  onClick={() => handleSelectUser(u)}
                  disabled={isCreating}
                  className="flex items-center gap-3 w-full px-5 py-2.5 text-left cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? 'var(--bg-hover)' : 'transparent',
                    border: 'none',
                    opacity: isCreating ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)'
                    setSelectedIndex(index)
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div className="relative shrink-0">
                    <Avatar
                      member={{ name: u.name, avatar: u.avatar, onlineStatus: online ? 'online' : 'offline' }}
                      size={36}
                      showStatus={false}
                    />
                    {online && (
                      <span
                        className="absolute rounded-full"
                        style={{
                          width: 9, height: 9,
                          background: 'var(--status-online)',
                          border: '2px solid var(--bg-primary)',
                          bottom: -1, right: -1,
                        }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-semibold truncate"
                        style={{ color: 'var(--text-white)' }}
                      >
                        {u.name}
                      </span>
                      {online && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                          background: 'rgba(46, 160, 67, 0.15)',
                          color: 'var(--status-online)',
                          fontWeight: 600,
                        }}>
                          Online
                        </span>
                      )}
                    </div>
                    <span className="text-xs truncate block" style={{ color: 'var(--text-muted)' }}>
                      {u.email || u.title || (u.role && u.role !== 'employee' ? u.role : '')}
                    </span>
                  </div>
                  {existingDM && (
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full" style={{
                      background: 'var(--bg-hover)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-secondary)',
                    }}>
                      <MessageCircle size={10} className="inline mr-1" style={{ verticalAlign: 'middle' }} />
                      Existing
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        {isCreating && (
          <div
            className="flex items-center justify-center gap-2 px-5 py-3 shrink-0"
            style={{ borderTop: '1px solid var(--border-secondary)' }}
          >
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Starting conversation...</span>
          </div>
        )}
      </div>
    </div>
  )
}
