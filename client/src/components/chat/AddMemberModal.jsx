import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { authAPI } from '../../services/api'
import {
  X, Search, Loader2, UserPlus, Check,
  Users, Hash, Mail, UserCheck,
} from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'
import { motion, AnimatePresence } from 'framer-motion'
import logger from '../../utils/logger'

/* ─── Animation variants ──────────────────────────────────────────── */
const overlayV = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: .2 } },
  exit:    { opacity: 0, transition: { duration: .18 } },
}
const modalV = {
  hidden:  { opacity: 0, scale: .96, y: 20 },
  visible: { opacity: 1, scale: 1,   y: 0,
    transition: { duration: .3, ease: [.22,1,.36,1] } },
  exit:    { opacity: 0, scale: .96, y: 14,
    transition: { duration: .2 } },
}
const listV = {
  hidden:  {},
  visible: { transition: { staggerChildren: .045, delayChildren: .05 } },
}
const rowV = {
  hidden:  { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: .22, ease: [.22,1,.36,1] } },
  exit:    { opacity: 0, x: 8, scale: .95, transition: { duration: .18 } },
}
const badgeV = {
  hidden:  { scale: 0, opacity: 0 },
  visible: { scale: 1, opacity: 1,
    transition: { type: 'spring', stiffness: 420, damping: 18 } },
  exit:    { scale: 0, opacity: 0, transition: { duration: .14 } },
}
const emptyV = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: .28, ease: [.22,1,.36,1] } },
}
const shimmerKeyframes = `
@keyframes amm-shimmer {
  0%   { background-position: -400% 0; }
  100% { background-position:  400% 0; }
}
@keyframes amm-spin { to { transform: rotate(360deg); } }
`

function useStylesInjected() {
  const ref = useRef(false)
  useEffect(() => {
    if (ref.current) return
    ref.current = true
    if (document.getElementById('amm2-styles')) return
    const el = document.createElement('style')
    el.id = 'amm2-styles'
    el.textContent = shimmerKeyframes
    document.head.appendChild(el)
  }, [])
}

/* ─── Skeleton ────────────────────────────────────────────────────── */
function SkeletonRow({ index = 0 }) {
  const skel = {
    background: 'linear-gradient(90deg, var(--surface-secondary) 25%, var(--surface-hover) 50%, var(--surface-secondary) 75%)',
    backgroundSize: '400% 100%',
    animation: 'amm-shimmer 1.8s infinite linear',
    borderRadius: 6,
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '9px 10px', borderRadius: 10,
      animationDelay: `${index * 45}ms`,
    }}>
      <div style={{ ...skel, width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ ...skel, height: 11, width: '50%' }} />
        <div style={{ ...skel, height: 9,  width: '68%' }} />
      </div>
      <div style={{ ...skel, height: 32, width: 70, borderRadius: 8, flexShrink: 0 }} />
    </div>
  )
}

/* ─── Online dot ──────────────────────────────────────────────────── */
function OnlineDot({ isOnline }) {
  if (!isOnline) return null
  return (
    <div style={{
      position: 'absolute', bottom: 0, right: 0,
      width: 9, height: 9, borderRadius: '50%',
      background: 'var(--status-online, #22c55e)',
      border: '2px solid var(--surface-primary)',
    }} />
  )
}

/* ─── User row ────────────────────────────────────────────────────── */
function UserRow({ u, isOnline, isAdding, wasAdded, addingAny, onAdd, index }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      layout
      variants={rowV}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 10px', borderRadius: 10,
        border: `1px solid ${hovered
          ? 'var(--border-color)'
          : 'transparent'}`,
        background: hovered
          ? 'var(--surface-hover)'
          : 'transparent',
        transition: 'background 140ms ease, border-color 140ms ease',
        cursor: 'default',
      }}
    >
      {/* Avatar with online dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar member={u} size={38} />
        <OnlineDot isOnline={isOnline} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{
            fontSize: 13.5, fontWeight: 600, lineHeight: 1.25,
            color: 'var(--text-primary)', letterSpacing: '-.01em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            margin: 0,
          }}>
            {u.name || u.displayName}
          </p>
          {isOnline && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 5px',
              borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.05em',
              background: 'color-mix(in srgb, var(--status-online, #22c55e) 14%, transparent)',
              color: 'var(--status-online, #22c55e)',
              border: '1px solid color-mix(in srgb, var(--status-online, #22c55e) 22%, transparent)',
              flexShrink: 0,
            }}>
              Online
            </span>
          )}
        </div>
        <p style={{
          fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0',
          lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          <Mail size={9} style={{ flexShrink: 0, opacity: .6 }} />
          {u.email}
        </p>
      </div>

      {/* Action */}
      <AnimatePresence mode="wait">
        {wasAdded ? (
          <motion.div
            key="added"
            variants={badgeV}
            initial="hidden" animate="visible" exit="exit"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 11px', borderRadius: 8, flexShrink: 0,
              fontSize: 12, fontWeight: 700,
              color: 'var(--success-color, #2eb67d)',
              background: 'color-mix(in srgb, var(--success-color, #2eb67d) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--success-color, #2eb67d) 24%, transparent)',
            }}
          >
            <UserCheck size={13} />
            Added
          </motion.div>
        ) : (
          <motion.button
            key="add"
            initial={{ opacity: 0, scale: .9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: .9 }}
            transition={{ duration: .15 }}
            onClick={() => onAdd(u)}
            disabled={!!addingAny}
            whileHover={addingAny ? {} : { y: -1, scale: 1.03 }}
            whileTap={addingAny ? {} : { scale: .95 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '7px 13px', borderRadius: 8, border: 'none',
              fontSize: 12, fontWeight: 700, cursor: addingAny ? 'not-allowed' : 'pointer',
              flexShrink: 0, fontFamily: 'inherit',
              background: isAdding
                ? 'color-mix(in srgb, var(--accent-color) 80%, transparent)'
                : 'var(--accent-color)',
              color: '#fff',
              opacity: (addingAny && !isAdding) ? .55 : 1,
              boxShadow: isAdding
                ? 'none'
                : '0 2px 8px color-mix(in srgb, var(--accent-color) 32%, transparent)',
              transition: 'background 140ms ease, opacity 140ms ease, box-shadow 140ms ease',
            }}
          >
            {isAdding
              ? <Loader2 size={12} style={{ animation: 'amm-spin .8s linear infinite' }} />
              : <UserPlus size={12} />
            }
            {isAdding ? 'Adding…' : 'Add'}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── Main component ──────────────────────────────────────────────── */
export default function AddMemberModal({ channel, onClose }) {
  useStylesInjected()

  const { user }    = useAuthStore()
  const { membersByChannel, addMember } = useChannelStore()
  const { onlineUsers } = useChatStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [users,       setUsers]       = useState([])
  const [isLoading,   setIsLoading]   = useState(false)
  const [addingId,    setAddingId]    = useState(null)
  const [addedIds,    setAddedIds]    = useState(new Set())
  const [addedCount,  setAddedCount]  = useState(0)
  const [searchFocused, setSearchFocused] = useState(false)

  const searchRef = useRef(null)
  const modalRef  = useRef(null)
  const debRef    = useRef(null)

  const channelMembers = (channel && membersByChannel?.[channel._id]) || []
  const memberIds = useMemo(
    () => new Set(channelMembers.map(m => m._id)),
    [channelMembers],
  )
  const onlineSet = useMemo(
    () => new Set(onlineUsers?.map?.(u => u._id || u) || []),
    [onlineUsers],
  )

  /* Auto-focus + focus trap + ESC */
  useEffect(() => { searchRef.current?.focus() }, [])

  useEffect(() => {
    const prev = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !modalRef.current) return
      const els = modalRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!els.length) return
      const [first, last] = [els[0], els[els.length - 1]]
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus() } }
      else if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])

  /* Debounced search */
  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => fetchUsers(searchQuery.trim()), searchQuery.trim() ? 380 : 100)
    return () => clearTimeout(debRef.current)
  }, [searchQuery])

  const fetchUsers = async (query) => {
    setIsLoading(true)
    try {
      const { data } = await authAPI.searchUsers(query)
      const all = data.data?.users || data.data || []
      setUsers(all.filter(u => u._id !== user?._id && !memberIds.has(u._id)))
    } catch (err) {
      logger.error('Failed to search users:', err)
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
      setAddedIds(prev => new Set([...prev, targetUser._id]))
      setAddedCount(c => c + 1)
      setTimeout(() => {
        setUsers(prev => prev.filter(u => u._id !== targetUser._id))
        setAddedIds(prev => { const s = new Set(prev); s.delete(targetUser._id); return s })
      }, 1500)
    } catch { /* toast handled in store */ }
    finally { setAddingId(null) }
  }

  const isEmpty    = !isLoading && users.length === 0
  const onlineCount = users.filter(u => onlineSet.has(u._id)).length

  return (
    <AnimatePresence>
      <motion.div
        variants={overlayV}
        initial="hidden" animate="visible" exit="exit"
        onClick={e => e.target === e.currentTarget && onClose()}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          background: 'var(--overlay-bg, rgba(0,0,0,0.52))',
          backdropFilter: 'blur(6px)',
        }}
      >
        <motion.div
          ref={modalRef}
          variants={modalV}
          initial="hidden" animate="visible" exit="exit"
          role="dialog" aria-modal="true" aria-labelledby="amm-title"
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 460,
            maxHeight: '82vh',
            display: 'flex', flexDirection: 'column',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-modal)',
          }}
        >

          {/* ══ Header ════════════════════════════════════════════ */}
          <div style={{
            padding: '18px 20px 16px',
            borderBottom: '1px solid var(--border-secondary)',
            background: 'var(--surface-secondary)',
            flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'flex-start',
              justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-md)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  background: 'color-mix(in srgb, var(--accent-color) 14%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent-color) 24%, transparent)',
                  boxShadow: '0 2px 8px color-mix(in srgb, var(--accent-color) 14%, transparent)',
                  color: 'var(--accent-color)',
                }}>
                  <Users size={17} />
                </div>

                <div>
                  <h2 id="amm-title" style={{
                    fontSize: 15, fontWeight: 800, color: 'var(--text-primary)',
                    letterSpacing: '-.02em', lineHeight: 1.2, margin: 0,
                  }}>
                    Add Members
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0',
                    display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Hash size={10} style={{ opacity: .6 }} />
                    {channel.name}
                    {addedCount > 0 && (
                      <motion.span
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 16 }}
                        style={{
                          marginLeft: 4, fontSize: 9, fontWeight: 800,
                          padding: '1px 6px', borderRadius: 999,
                          textTransform: 'uppercase', letterSpacing: '.05em',
                          background: 'color-mix(in srgb, var(--success-color, #2eb67d) 14%, transparent)',
                          color: 'var(--success-color, #2eb67d)',
                          border: '1px solid color-mix(in srgb, var(--success-color, #2eb67d) 22%, transparent)',
                        }}
                      >
                        +{addedCount} added
                      </motion.span>
                    )}
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                aria-label="Close"
                className="thread-panel__icon-btn thread-panel__close-btn"
                style={{ flexShrink: 0 }}
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* ══ Search ════════════════════════════════════════════ */}
          <div style={{ padding: '14px 16px 10px', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-input)',
              border: `1.5px solid ${searchFocused
                ? 'var(--accent-color)'
                : 'var(--border-color)'}`,
              boxShadow: searchFocused
                ? '0 0 0 3px color-mix(in srgb, var(--accent-color) 16%, transparent)'
                : 'none',
              transition: 'border-color 160ms ease, box-shadow 160ms ease',
            }}>
              <Search size={14} style={{
                color: searchFocused ? 'var(--accent-color)' : 'var(--text-muted)',
                flexShrink: 0, transition: 'color 160ms ease',
              }} />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search by name or email…"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)',
                  fontFamily: 'inherit', minWidth: 0,
                  caretColor: 'var(--accent-color)',
                }}
              />
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div key="loading"
                    initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: .8 }} transition={{ duration: .14 }}
                  >
                    <Loader2 size={13} style={{
                      color: 'var(--text-muted)', flexShrink: 0,
                      animation: 'amm-spin .8s linear infinite',
                    }} />
                  </motion.div>
                ) : searchQuery ? (
                  <motion.div key="count"
                    initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: .8 }} transition={{ duration: .14 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                    }}
                  >
                    {/* Result count */}
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 999,
                      background: users.length > 0
                        ? 'color-mix(in srgb, var(--accent-color) 14%, transparent)'
                        : 'var(--surface-secondary)',
                      color: users.length > 0 ? 'var(--accent-color)' : 'var(--text-muted)',
                      border: `1px solid ${users.length > 0
                        ? 'color-mix(in srgb, var(--accent-color) 22%, transparent)'
                        : 'var(--border-secondary)'}`,
                    }}>
                      {users.length}
                    </span>
                    {/* Clear */}
                    <button
                      onClick={() => { setSearchQuery(''); searchRef.current?.focus() }}
                      style={{
                        width: 18, height: 18, borderRadius: '50%', border: 'none',
                        background: 'var(--surface-tertiary)',
                        color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', padding: 0,
                        transition: 'background 120ms ease',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-tertiary)'}
                      aria-label="Clear search"
                    >
                      <X size={9} />
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          {/* ══ List ══════════════════════════════════════════════ */}
          <div style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            padding: '2px 10px 12px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--scrollbar-thumb) transparent',
          }}>

            {/* Skeletons */}
            {isLoading && users.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} index={i} />
                ))}
              </div>
            )}

            {/* Empty state */}
            <AnimatePresence>
              {isEmpty && (
                <motion.div
                  variants={emptyV}
                  initial="hidden" animate="visible" exit="hidden"
                  style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    padding: '44px 20px', gap: 10, textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: 54, height: 54, borderRadius: 16, marginBottom: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--surface-secondary)',
                    border: '1px solid var(--border-color)',
                  }}>
                    <UserPlus size={22} style={{ color: 'var(--text-muted)', opacity: .5 }} />
                  </div>
                  <p style={{ fontSize: 13.5, fontWeight: 700,
                    color: 'var(--text-primary)', margin: 0, letterSpacing: '-.01em' }}>
                    {searchQuery ? 'No users found' : 'Search for people'}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)',
                    margin: 0, lineHeight: 1.55, maxWidth: 200 }}>
                    {searchQuery
                      ? `No one matched "${searchQuery}"`
                      : 'Type a name or email address to find someone to invite'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Section label */}
            {!isLoading && users.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: .2 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px 8px',
                  fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '.08em', color: 'var(--text-muted)',
                }}
              >
                <span>
                  {searchQuery ? `Results for "${searchQuery}"` : 'Suggested people'}
                </span>
                {onlineCount > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 5px',
                    borderRadius: 999,
                    background: 'color-mix(in srgb, var(--status-online, #22c55e) 12%, transparent)',
                    color: 'var(--status-online, #22c55e)',
                    border: '1px solid color-mix(in srgb, var(--status-online, #22c55e) 20%, transparent)',
                  }}>
                    {onlineCount} online
                  </span>
                )}
                <div style={{ flex: 1, height: 1, background: 'var(--border-secondary)' }} />
                <span style={{ opacity: .6 }}>{users.length}</span>
              </motion.div>
            )}

            {/* User list */}
            <AnimatePresence>
              {!isLoading && users.length > 0 && (
                <motion.div
                  variants={listV}
                  initial="hidden" animate="visible"
                  style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                  {users.map((u, i) => (
                    <UserRow
                      key={u._id}
                      u={u}
                      index={i}
                      isOnline={onlineSet.has(u._id)}
                      isAdding={addingId === u._id}
                      wasAdded={addedIds.has(u._id)}
                      addingAny={addingId}
                      onAdd={handleAdd}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ══ Footer ════════════════════════════════════════════ */}
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-secondary)',
            background: 'var(--surface-secondary)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, flexShrink: 0,
          }}>
            {/* Status note */}
            <AnimatePresence mode="wait">
              {addedCount > 0 ? (
                <motion.div
                  key="added"
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }} transition={{ duration: .2 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    fontSize: 12, color: 'var(--success-color, #2eb67d)', fontWeight: 600,
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'color-mix(in srgb, var(--success-color, #2eb67d) 14%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--success-color, #2eb67d) 24%, transparent)',
                  }}>
                    <Check size={11} />
                  </div>
                  <span>
                    <strong style={{ fontWeight: 800 }}>{addedCount}</strong>
                    {' '}{addedCount === 1 ? 'person' : 'people'} added to{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>#{channel.name}</span>
                  </span>
                </motion.div>
              ) : (
                <motion.p
                  key="hint"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: .16 }}
                  style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0,
                    lineHeight: 1.4, flex: 1 }}
                >
                  Members get access to all channel messages
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              onClick={onClose}
              whileHover={{ y: -1 }}
              whileTap={{ scale: .97 }}
              className="btn-ghost"
              style={{ fontSize: 13, flexShrink: 0 }}
            >
              Done
            </motion.button>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}