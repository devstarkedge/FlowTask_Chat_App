import { useState, useEffect, useRef, useCallback } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { usePresenceStore } from '../../stores/presenceStore'
import { userAPI } from '../../services/api'
import { joinChannel } from '../../services/socket'
import { X, Search, MessageCircle, User, Zap } from 'lucide-react';
import Loader from '../shared/Loader';
import { Avatar } from './MemberAvatarGroup'
import toast from 'react-hot-toast'
import logger from '../../utils/logger'

/**
 * UserPickerModal — modal for selecting a user to start a DM conversation.
 * Enhanced UI with:
 *  - Frosted glass overlay
 *  - Animated entrance
 *  - Category headers (Online / Offline)
 *  - Smooth keyboard navigation highlight
 *  - 400ms debounced search
 *  - Double-click protection
 */
export default function UserPickerModal({ onClose, onSelect }) {
  const { user } = useAuthStore()
  const { channels, createDM } = useChannelStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [flowTaskFetchFailed, setFlowTaskFetchFailed] = useState(false)
  const [mounted, setMounted] = useState(false)
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

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!searchQuery.trim()) {
      debounceRef.current = setTimeout(() => fetchUsers(''), 100)
      return
    }
    debounceRef.current = setTimeout(() => fetchUsers(searchQuery.trim()), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery])

  const fetchUsers = async (query) => {
    setIsLoading(true)
    try {
      const { data } = await userAPI.getDMContacts(query)
      const contacts = data.data?.contacts || []
      setFlowTaskFetchFailed(Boolean(data.data?.meta?.flowTaskFetchFailed))
      
      // Hydrate presence store
      usePresenceStore.getState().updateFromUsers(contacts)
      
      setUsers(contacts)
      setSelectedIndex(0)
    } catch (error) {
      logger.error('Failed to fetch DM contacts:', error)
      setFlowTaskFetchFailed(false)
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectUser = useCallback(async (targetUser) => {
    if (isCreating) return
    const targetId = targetUser.chatUserId || targetUser.flowTaskUserId
    if (!targetId) {
      logger.error('Cannot start DM: user has no valid identifier', targetUser)
      toast.error('Unable to start conversation with this user')
      return
    }
    setIsCreating(true)
    try {
      const currentUserId = user?._id?.toString?.()
      const isTargetSelf = currentUserId && targetId?.toString?.() === currentUserId

      let existingDM = null
      if (isTargetSelf) {
        existingDM = channels.find(
          (c) => c.type === 'dm' && (c.isSelfDM || c.isSelf) && (c.dmParticipants || []).length === 1 && (c.dmParticipants || [])[0]?.toString?.() === targetId?.toString?.()
        )
      } else {
        existingDM = channels.find(
          (c) => c.type === 'dm' && c.dmParticipants?.includes(targetId)
        )
      }

      if (existingDM) { onSelect(existingDM._id); return }
      const channel = await createDM(targetId)
      joinChannel(channel._id)
      onSelect(channel._id)
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to start conversation')
      setIsCreating(false)
    }
  }, [isCreating, channels, createDM, onSelect])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(selectedIndex + 1, users.length - 1)
      setSelectedIndex(next)
      scrollToSelected(next)
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(selectedIndex - 1, 0)
      setSelectedIndex(prev)
      scrollToSelected(prev)
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

  const presenceMap = usePresenceStore((state) => state.presence)
  const isUserOnline = (u) => {
    const status = presenceMap[u.chatUserId] || presenceMap[u.flowTaskUserId] || presenceMap[u._id]
    return status === 'online'
  }

  const onlineList = users.filter(isUserOnline)
  const offlineList = users.filter(u => !isUserOnline(u))

  /* ─── flat ordered list for keyboard nav ─── */
  const flatUsers = [...onlineList, ...offlineList]

  return (
    <>
      <style>{`
        @keyframes upm-overlay-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes upm-modal-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97) }
          to   { opacity: 1; transform: translateY(0)   scale(1) }
        }
        @keyframes upm-spin { to { transform: rotate(360deg) } }
        .upm-overlay {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          animation: upm-overlay-in 0.18s ease;
        }
        .upm-modal {
          width: 100%; max-width: 440px; margin: 0 1rem;
          max-height: min(72vh, 640px);
          display: flex; flex-direction: column;
          background: var(--bg-secondary, #1e1f24);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.05) inset;
          animation: upm-modal-in 0.22s cubic-bezier(0.16,1,0.3,1);
        }
        .upm-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .upm-title { font-size: 15px; font-weight: 700; color: var(--text-white, #f1f1f1); letter-spacing: -0.01em; margin: 0; }
        .upm-subtitle { font-size: 11px; color: var(--text-muted, #888); margin: 2px 0 0; }
        .upm-close {
          width: 28px; height: 28px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; cursor: pointer;
          color: var(--text-muted, #888);
          transition: background 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .upm-close:hover { background: rgba(255,255,255,0.08); color: var(--text-white, #f1f1f1); }
        .upm-warn {
          margin: 10px 16px 0;
          padding: 9px 12px;
          border-radius: 8px;
          font-size: 11px; line-height: 1.5;
          background: rgba(255,165,0,0.1);
          border: 1px solid rgba(255,165,0,0.25);
          color: #f5a623;
          display: flex; gap: 7px; align-items: flex-start;
          flex-shrink: 0;
        }
        .upm-search-wrap {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0;
        }
        .upm-search-box {
          display: flex; align-items: center; gap: 8px;
          padding: 0 12px;
          height: 38px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .upm-search-box:focus-within {
          border-color: var(--accent-primary, #5865f2);
          box-shadow: 0 0 0 3px rgba(88,101,242,0.18);
        }
        .upm-search-input {
          flex: 1; background: transparent; border: none; outline: none;
          font-size: 13px; color: var(--text-primary, #ddd);
          caret-color: var(--accent-primary, #5865f2);
        }
        .upm-search-input::placeholder { color: var(--text-muted, #666); }
        .upm-list { flex: 1; overflow-y: auto; padding: 6px 0; }
        .upm-list::-webkit-scrollbar { width: 4px; }
        .upm-list::-webkit-scrollbar-track { background: transparent; }
        .upm-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .upm-section-label {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px 4px;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--text-muted, #666);
        }
        .upm-section-label .dot {
          width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
        }
        .upm-section-divider {
          height: 1px; background: rgba(255,255,255,0.05);
          margin: 4px 16px;
        }
        .upm-user-btn {
          display: flex; align-items: center; gap: 11px;
          width: 100%; padding: 7px 16px;
          background: transparent; border: none;
          cursor: pointer; text-align: left;
          transition: background 0.1s;
          position: relative;
        }
        .upm-user-btn:hover,
        .upm-user-btn.is-selected { background: rgba(255,255,255,0.06); }
        .upm-user-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .upm-user-btn.is-selected::before {
          content: '';
          position: absolute; left: 0; top: 50%; transform: translateY(-50%);
          width: 3px; height: 60%; border-radius: 0 3px 3px 0;
          background: var(--accent-primary, #5865f2);
        }
        .upm-avatar-wrap { position: relative; flex-shrink: 0; }
        .upm-online-dot {
          position: absolute; bottom: -1px; right: -1px;
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--status-online, #3ba55d);
          border: 2px solid var(--bg-secondary, #1e1f24);
        }
        .upm-user-name {
          font-size: 13px; font-weight: 600;
          color: var(--text-white, #f1f1f1);
          truncate: clip;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 180px;
        }
        .upm-user-sub {
          font-size: 11px; color: var(--text-muted, #888);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 200px;
        }
        .upm-badge-online {
          font-size: 10px; font-weight: 600; padding: 2px 7px;
          border-radius: 20px;
          background: rgba(59,165,93,0.15);
          color: var(--status-online, #3ba55d);
          flex-shrink: 0;
        }
        .upm-badge-existing {
          display: flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 500; padding: 2px 8px;
          border-radius: 20px; flex-shrink: 0;
          background: rgba(255,255,255,0.06);
          color: var(--text-muted, #888);
          border: 1px solid rgba(255,255,255,0.08);
          white-space: nowrap;
        }
        .upm-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 40px 20px; gap: 8px;
          color: var(--text-muted, #666);
        }
        .upm-empty-icon {
          width: 44px; height: 44px; border-radius: 12px;
          background: rgba(255,255,255,0.05);
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 4px;
        }
        .upm-empty-title { font-size: 13px; font-weight: 600; color: var(--text-secondary, #aaa); }
        .upm-empty-sub { font-size: 12px; color: var(--text-muted, #666); }
        .upm-footer {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 12px 20px;
          border-top: 1px solid rgba(255,255,255,0.06);
          font-size: 12px; color: var(--text-muted, #888);
          flex-shrink: 0;
        }
        .upm-spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.15);
          border-top-color: var(--accent-primary, #5865f2);
          animation: upm-spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        .upm-kbd {
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 600;
          padding: 1px 5px; border-radius: 4px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-muted, #666);
          font-family: monospace;
        }
      `}</style>

      <div
        className="upm-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="upm-modal" role="dialog" aria-modal="true" aria-label="New message">

          {/* ── Header ── */}
          <div className="upm-header">
            <div>
              <p className="upm-title">New message</p>
              <p className="upm-subtitle">Start a direct message conversation</p>
            </div>
            <button className="upm-close" onClick={onClose} aria-label="Close">
              <X size={15} />
            </button>
          </div>

          {/* ── FlowTask warning ── */}
          {flowTaskFetchFailed && (
            <div className="upm-warn">
              <Zap size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>FlowTask sync failed — showing workspace users only.</span>
            </div>
          )}

          {/* ── Search ── */}
          <div className="upm-search-wrap">
            <div className="upm-search-box">
              <Search size={13} style={{ color: 'var(--text-muted, #666)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                className="upm-search-input"
                type="text"
                placeholder="Search by name or email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
              />
              {isLoading && <div className="upm-spinner" />}
            </div>
          </div>

          {/* ── User list ── */}
          <div className="upm-list" ref={listRef}>

            {/* Loading skeleton */}
            {isLoading && users.length === 0 && (
              <div className="upm-empty">
                <div className="upm-spinner" style={{ width: 22, height: 22 }} />
              </div>
            )}

            {/* Empty state */}
            {!isLoading && users.length === 0 && (
              <div className="upm-empty">
                <div className="upm-empty-icon">
                  <User size={20} style={{ color: 'var(--text-muted, #666)' }} />
                </div>
                <p className="upm-empty-title">
                  {searchQuery ? 'No users found' : 'No users available'}
                </p>
                {searchQuery && (
                  <p className="upm-empty-sub">Try a different name or email</p>
                )}
              </div>
            )}

            {/* Online section */}
            {onlineList.length > 0 && (
              <>
                <div className="upm-section-label">
                  <span className="dot" style={{ background: 'var(--status-online, #3ba55d)' }} />
                  Online — {onlineList.length}
                </div>
                {onlineList.map((u) => {
                  const flatIdx = flatUsers.indexOf(u)
                  const uId = u.chatUserId || u.flowTaskUserId
                  const existingDM = channels.find((c) => dmMatchesTarget(c, uId))
                  return (
                    <UserRow
                      key={u.chatUserId || u.flowTaskUserId || u.email}
                      u={u}
                      isSelected={flatIdx === selectedIndex}
                      isOnline
                      existingDM={existingDM}
                      isCreating={isCreating}
                      onSelect={() => handleSelectUser(u)}
                      onHover={() => setSelectedIndex(flatIdx)}
                    />
                  )
                })}
              </>
            )}

            {/* Divider between sections */}
            {onlineList.length > 0 && offlineList.length > 0 && (
              <div className="upm-section-divider" />
            )}

            {/* Offline section */}
            {offlineList.length > 0 && (
              <>
                <div className="upm-section-label">
                  <span className="dot" style={{ background: 'rgba(255,255,255,0.2)' }} />
                  Offline — {offlineList.length}
                </div>
                {offlineList.map((u) => {
                  const flatIdx = flatUsers.indexOf(u)
                  const uId = u.chatUserId || u.flowTaskUserId
                  const existingDM = channels.find((c) => dmMatchesTarget(c, uId))
                  return (
                    <UserRow
                      key={u.chatUserId || u.flowTaskUserId || u.email}
                      u={u}
                      isSelected={flatIdx === selectedIndex}
                      isOnline={false}
                      existingDM={existingDM}
                      isCreating={isCreating}
                      onSelect={() => handleSelectUser(u)}
                      onHover={() => setSelectedIndex(flatIdx)}
                    />
                  )
                })}
              </>
            )}
          </div>

          {/* ── Creating footer ── */}
          {isCreating ? (
            <div className="upm-footer">
              <div className="upm-spinner" />
              Starting conversation…
            </div>
          ) : users.length > 0 && (
            <div className="upm-footer" style={{ gap: 6 }}>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ─── Extracted row component for cleanliness ─── */
function UserRow({ u, isSelected, isOnline, existingDM, isCreating, onSelect, onHover }) {
  return (
    <button
      className={`upm-user-btn${isSelected ? ' is-selected' : ''}`}
      onClick={onSelect}
      disabled={isCreating}
      onMouseEnter={onHover}
    >
      {/* Avatar */}
      <div className="upm-avatar-wrap">
        <Avatar
          member={{ name: u.name, avatar: u.avatar, onlineStatus: isOnline ? 'online' : 'offline' }}
          size={34}
          showStatus={false}
        />
        {isOnline && <span className="upm-online-dot" />}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="upm-user-name">{u.name}</span>
          {isOnline && <span className="upm-badge-online">Online</span>}
        </div>
        <span className="upm-user-sub">
          {u.email || u.title || (u.role && u.role !== 'employee' ? u.role : '')}
        </span>
      </div>

      {/* Existing DM badge */}
      {existingDM && (
        <span className="upm-badge-existing">
          <MessageCircle size={9} />
          Existing
        </span>
      )}
    </button>
  )
}