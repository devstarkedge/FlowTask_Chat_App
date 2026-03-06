import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { authAPI } from '../../services/api'
import { X, Search, Loader2, UserPlus, Check } from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'

/**
 * AddMemberModal — modal for adding users to a channel.
 * Searches users, excludes existing members, allows adding.
 */
export default function AddMemberModal({ channel, onClose }) {
  const { user } = useAuthStore()
  const { membersByChannel, addMember } = useChannelStore()
  const { onlineUsers } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [addingId, setAddingId] = useState(null)
  const [addedIds, setAddedIds] = useState(new Set())
  const searchInputRef = useRef(null)
  const modalRef = useRef(null)
  const debounceRef = useRef(null)

  const channelMembers = (channel && membersByChannel?.[channel._id]) || []
  const memberIds = new Set(channelMembers.map((m) => m._id))

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const previousActive = document.activeElement

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key !== 'Tab' || !modalRef.current) return

      const focusable = modalRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )

      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousActive && typeof previousActive.focus === 'function') {
        previousActive.focus()
      }
    }
  }, [onClose])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchUsers(searchQuery.trim())
    }, searchQuery.trim() ? 400 : 100)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery])

  const fetchUsers = async (query) => {
    setIsLoading(true)
    try {
      const { data } = await authAPI.searchUsers(query)
      const allUsers = data.data?.users || data.data || []
      // Exclude current user and existing members
      const filtered = allUsers.filter(
        (u) => u._id !== user?._id && !memberIds.has(u._id)
      )
      setUsers(filtered)
    } catch (error) {
      console.error('Failed to search users:', error)
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdd = async (targetUser) => {
    if (addingId) return
    setAddingId(targetUser._id)
    try {
      await addMember(channel._id, targetUser._id)
      setAddedIds((prev) => new Set([...prev, targetUser._id]))
      // Remove from list
      setUsers((prev) => prev.filter((u) => u._id !== targetUser._id))
    } catch {
      // toast is handled in store
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-member-modal-title"
        className="w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          maxHeight: '70vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <div>
            <h2 id="add-member-modal-title" className="text-base font-semibold" style={{ color: 'var(--text-white)' }}>
              Add Members
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Add people to <strong>#{channel.name}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Add Member modal"
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 shrink-0">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="flex-1 bg-transparent border-none outline-none text-sm"
              style={{ color: 'var(--text-white)' }}
            />
            {isLoading && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 pb-3" style={{ minHeight: 0 }}>
          {users.length === 0 && !isLoading && (
            <div className="text-center py-8">
              <UserPlus size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {searchQuery ? 'No users found' : 'Type to search for users'}
              </p>
            </div>
          )}

          {users.map((u) => {
            const isAdding = addingId === u._id
            const wasAdded = addedIds.has(u._id)

            return (
              <div
                key={u._id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors"
                style={{ cursor: 'default' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Avatar member={u} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-white)' }}>
                    {u.name || u.displayName}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                    {u.email}
                  </p>
                </div>

                {wasAdded ? (
                  <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--status-online)' }}>
                    <Check size={14} /> Added
                  </span>
                ) : (
                  <button
                    onClick={() => handleAdd(u)}
                    disabled={isAdding}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                    style={{
                      background: 'var(--accent-primary)',
                      color: 'white',
                    }}
                    onMouseEnter={(e) => { if (!isAdding) e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                  >
                    {isAdding ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <UserPlus size={14} />
                    )}
                    Add
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
