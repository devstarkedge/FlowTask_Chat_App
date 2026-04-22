import {
  useState, useRef, useEffect, useCallback, memo,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import {
  ChevronDown, Plus, Settings, LogIn,
  Check, Loader2, MessageCircle, Sparkles,
} from 'lucide-react'
import api from '../../services/api'
 
/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
 
/** Avatar gradient pool — mapped by workspace index */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #10b981, #3b82f6)',
  'linear-gradient(135deg, #8b5cf6, #ec4899)',
  'linear-gradient(135deg, #06b6d4, var(--accent-primary))',
  'linear-gradient(135deg, #f97316, #eab308)',
  'linear-gradient(135deg, #14b8a6, var(--accent-primary))',
]
 
/** Floating orbs in the dropdown header — purely decorative */
const HEADER_ORBS = [
  { left: '10%', top: '55%', size: 6,  dur: '2.6s', delay: '0s'   },
  { left: '28%', top: '18%', size: 4,  dur: '3.3s', delay: '.7s'  },
  { left: '56%', top: '68%', size: 5,  dur: '2.9s', delay: '1.3s' },
  { left: '75%', top: '16%', size: 3,  dur: '3.7s', delay: '.4s'  },
  { left: '90%', top: '58%', size: 4,  dur: '3.1s', delay: '1.0s' },
]
 
/**
 * Action rows config factory.
 * Returns only the actions relevant to the current state.
 */
const buildActions = (handlers, hasActiveWorkspace) => [
  {
    key:         'create',
    label:       'Create workspace',
    description: 'Start a new collaborative space',
    Icon:        Plus,
    tileClass:   'wss-tile--indigo',
    handler:     handlers.create,
  },
  {
    key:         'join',
    label:       'Join a workspace',
    description: 'Enter an invite code',
    Icon:        LogIn,
    tileClass:   'wss-tile--emerald',
    handler:     handlers.join,
  },
  ...(hasActiveWorkspace ? [{
    key:         'settings',
    label:       'Workspace settings',
    description: 'Members, roles & integrations',
    Icon:        Settings,
    tileClass:   'wss-tile--slate',
    handler:     handlers.settings,
  }] : []),
]
 
/* ─────────────────────────────────────────────────────────────────────────────
   CUSTOM HOOKS
───────────────────────────────────────────────────────────────────────────── */
 
/**
 * Fires `handler` when a mousedown occurs outside of `ref`.
 * Only active when `enabled` is true — avoids attaching listeners when closed.
 */
function useClickOutside(ref, handler, enabled) {
  useEffect(() => {
    if (!enabled) return
    const onMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) handler()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [ref, handler, enabled])
}
 
/**
 * Fires `handler` on Escape keydown.
 * Only active when `enabled` is true.
 */
function useEscapeKey(handler, enabled) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e) => { if (e.key === 'Escape') handler() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handler, enabled])
}
 
/* ─────────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────────────────────────────────────── */
 
/**
 * WorkspaceAvatar
 * Renders the colored initial tile for a workspace.
 * Uses logo image if available, otherwise gradient + initial letter.
 */
const WorkspaceAvatar = memo(function WorkspaceAvatar({ workspace, index, size, isActive }) {
  const style = {
    width:      size,
    height:     size,
    background: workspace?.logo
      ? `url(${workspace.logo}) center / cover`
      : AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length],
    fontSize:   Math.round(size * 0.38),
  }
 
  return (
    <div
      className={`wss-avatar${isActive ? ' wss-avatar--active' : ''}`}
      style={style}
      aria-hidden="true"
    >
      {!workspace?.logo && (workspace?.name?.charAt(0)?.toUpperCase() ?? '?')}
    </div>
  )
})
 
/**
 * UnreadBadge
 * Red pill showing the unread count for a non-active workspace.
 * Uses global .badge and .badge-red classes.
 */
const UnreadBadge = memo(function UnreadBadge({ count }) {
  if (!count) return null
  return (
    <span className="badge badge-red wss-badge-pop" aria-label={`${count} unread`}>
      {count > 99 ? '99+' : count}
    </span>
  )
})
 
/**
 * WorkspaceRow
 * Single button row in the workspace list.
 */
const WorkspaceRow = memo(function WorkspaceRow({
  workspace, index, isActive, isSwitching, unreadCount, onClick,
}) {
  return (
    <button
      role="option"
      aria-selected={isActive}
      onClick={onClick}
      className={`wss-ws-row${isActive ? ' wss-ws-row--active' : ''} wss-row-stagger`}
    >
      {/* Shimmer sweep overlay on active row */}
      {isActive && <span className="wss-shimmer-sweep" aria-hidden="true" />}
 
      <WorkspaceAvatar
        workspace={workspace}
        index={index}
        size={40}
        isActive={isActive}
      />
 
      {/* Text */}
      <div className="wss-ws-row__info">
        <p className={`wss-ws-row__name${isActive ? ' wss-ws-row__name--active' : ''}`}>
          {workspace.name}
        </p>
        <p className="wss-ws-row__meta">
          {workspace.memberCount ?? 0}&nbsp;
          {workspace.memberCount === 1 ? 'member' : 'members'}
        </p>
      </div>
 
      {/* Right slot — active check / unread badge / spinner */}
      <div className="wss-ws-row__right">
        {isActive && !isSwitching && (
          <span className="wss-active-check" aria-label="Active workspace">
            <Check size={12} color="#fff" strokeWidth={2.5} />
          </span>
        )}
        {!isActive && <UnreadBadge count={unreadCount} />}
        {isSwitching && isActive && (
          <Loader2
            size={16}
            className="animate-spin"
            style={{ color: 'var(--accent-primary)', flexShrink: 0 }}
            aria-label="Switching workspace…"
          />
        )}
      </div>
    </button>
  )
})
 
/**
 * ActionRow
 * Create / Join / Settings action buttons below the workspace list.
 */
const ActionRow = memo(function ActionRow({ label, description, Icon, tileClass, onClick }) {
  return (
    <button className="wss-action-row wss-action-stagger" onClick={onClick}>
      <span className={`wss-icon-tile ${tileClass}`} aria-hidden="true">
        <Icon size={15} strokeWidth={2} />
      </span>
      <span className="wss-action-row__text">
        <span className="wss-action-row__label">{label}</span>
        <span className="wss-action-row__desc">{description}</span>
      </span>
    </button>
  )
})
 
/**
 * DecorativeOrbs
 * Purely visual floating orbs in the dropdown header gradient band.
 */
const DecorativeOrbs = memo(function DecorativeOrbs() {
  return (
    <>
      {HEADER_ORBS.map((o, i) => (
        <span
          key={i}
          className="wss-orb"
          aria-hidden="true"
          style={{
            left:    o.left,
            top:     o.top,
            width:   o.size,
            height:  o.size,
            '--dur':   o.dur,
            '--delay': o.delay,
          }}
        />
      ))}
    </>
  )
})
 
/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
 
export default function WorkspaceSwitcher({ onOpenCreate, onOpenJoin, onOpenSettings }) {
  const navigate = useNavigate()
  const { workspaces, activeWorkspace, activeWorkspaceId, isSwitching } = useWorkspaceStore()
 
  const [isOpen,  setIsOpen]  = useState(false)
  const [unread,  setUnread]  = useState({})
 
  const rootRef = useRef(null)
  const close   = useCallback(() => setIsOpen(false), [])
  const toggle  = useCallback(() => setIsOpen((o) => !o), [])
 
  /* Close on outside click / Escape */
  useClickOutside(rootRef, close, isOpen)
  useEscapeKey(close, isOpen)
 
  /* Fetch unread counts whenever the dropdown opens */
  useEffect(() => {
    if (!isOpen) return
    api.get('/notifications/unread-counts-all')
      .then(({ data }) => setUnread(data.data?.counts ?? {}))
      .catch(() => {})
  }, [isOpen])
 
  /* Switch workspace — no-op if already active */
  const handleSwitch = useCallback((id) => {
    if (id === activeWorkspaceId) { close(); return }
    close()
    navigate(`/workspace/${id}`)
  }, [activeWorkspaceId, close, navigate])
 
  /* Wrap action handlers so the dropdown closes before the modal opens */
  const handleAction = useCallback((fn) => {
    close()
    fn?.()
  }, [close])
 
  const actions = buildActions(
    {
      create:   () => handleAction(onOpenCreate),
      join:     () => handleAction(onOpenJoin),
      settings: () => handleAction(onOpenSettings),
    },
    !!activeWorkspace,
  )
 
  /* Unread dot on trigger — total across all non-active workspaces */
  const totalUnread = workspaces.reduce((sum, ws) => (
    ws._id !== activeWorkspaceId ? sum + (unread[ws._id] ?? 0) : sum
  ), 0)
 
  /* ── render ── */
  return (
    <div className="wss-root" ref={rootRef}>
 
      {/* ════════════════════════════════════════
          TRIGGER BUTTON
      ════════════════════════════════════════ */}
      <button
        className="wss-trigger"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Workspace: ${activeWorkspace?.name ?? 'None'}. Click to switch.`}
      >
        {/* Avatar + optional unread dot */}
        <span className="wss-trigger__avatar-wrap">
          <span
            className="wss-trigger__avatar"
            style={{
              background: activeWorkspace?.logo
                ? `url(${activeWorkspace.logo}) center / cover`
                : AVATAR_GRADIENTS[0],
            }}
          >
            {!activeWorkspace?.logo && (
              activeWorkspace
                ? activeWorkspace.name?.charAt(0)?.toUpperCase()
                : <MessageCircle size={16} aria-hidden="true" />
            )}
          </span>
 
          {totalUnread > 0 && !isOpen && (
            <span className="wss-unread-dot" aria-label={`${totalUnread} unread`} />
          )}
        </span>
 
        {/* Workspace name + plan */}
        <span className="wss-trigger__text">
          <span className="wss-trigger__name">
            {isSwitching ? 'Switching…' : (activeWorkspace?.name ?? '')}
          </span>
          {activeWorkspace?.plan && (
            <span className="wss-trigger__plan">
              {activeWorkspace.plan} plan
            </span>
          )}
        </span>
 
        {/* Animated chevron pill */}
        <span className={`wss-chevron${isOpen ? ' wss-chevron--open' : ''}`} aria-hidden="true">
          <ChevronDown size={13} strokeWidth={2.5} />
        </span>
      </button>
 
      {/* ════════════════════════════════════════
          DROPDOWN MENU
      ════════════════════════════════════════ */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Switch workspace"
          className="wss-menu animate-fade-in-scale"
        >
          {/* ── Header gradient band with orbs ── */}
          <div className="wss-header-band">
            <DecorativeOrbs />
            <div className="wss-header-band__label">
              <Sparkles size={11} aria-hidden="true" />
              <span>Your Workspaces</span>
              <span className="wss-count-pill">{workspaces.length}</span>
            </div>
          </div>
 
          {/* ── Workspace list ── */}
          <div
            className="wss-list no-scrollbar"
            role="group"
            aria-label="Workspaces"
          >
            {workspaces.length === 0 ? (
              <p className="wss-empty">No workspaces yet</p>
            ) : (
              workspaces.map((ws, idx) => (
                <WorkspaceRow
                  key={ws._id}
                  workspace={ws}
                  index={idx}
                  isActive={ws._id === activeWorkspaceId}
                  isSwitching={isSwitching}
                  unreadCount={unread[ws._id] ?? 0}
                  onClick={() => handleSwitch(ws._id)}
                />
              ))
            )}
          </div>
 
          {/* ── Hairline divider ── */}
          <div className="wss-divider" aria-hidden="true" />
 
          {/* ── Action rows ── */}
          <div className="wss-actions" role="group" aria-label="Workspace actions">
            {actions.map((a) => (
              <ActionRow key={a.key} {...a} onClick={a.handler} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}