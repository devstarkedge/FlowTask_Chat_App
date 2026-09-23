import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactionDetailsPopup from '../chat/ReactionDetailsPopup';
import { messageAPI } from '../../services/api';
import './reactionRenderer.css';

/**
 * EmojiComponent
 * A shared source of truth for rendering emojis consistently across the app.
 * Ensures consistent font-family rendering on all platforms.
 */
export function EmojiComponent({ emoji, size = 16, className = '', style = {} }) {
  if (!emoji) return null;
  
  return (
    <span
      className={`emoji-component ${className}`}
      style={{
        fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif',
        fontSize: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        ...style
      }}
      role="img"
      aria-label={emoji}
    >
      {emoji}
    </span>
  );
}

/**
 * EmojiRenderer
 * Default export matching standard naming.
 */
export default EmojiComponent;

/**
 * ReactionRenderer — the reaction pill shown under a message/thread.
 *
 * On the web, hovering over the pill opens a Slack-style popup (see
 * ReactionDetailsPopup) listing who reacted plus the count. Clicking the pill
 * toggles the viewer's reaction (removes it if they already reacted).
 *
 * The users list is fetched from the server endpoint
 * GET /messages/:messageId/reactions/:emoji so it reflects the database (and
 * updates in real time), never static/local data.
 *
 * Props:
 *   emoji, count, hasReacted, currentUserId
 *   messageId     – message _id used to fetch the filtered reaction users
 *   users         – optional fallback list of user objects { _id, name, avatar }
 *   onClick / onToggle – (emoji) => void  add/remove toggle
 *   onAddMore      – () => void  opens emoji picker (optional)
 */
export function ReactionRenderer({
  emoji,
  count,
  hasReacted,
  users,
  currentUserId,
  messageId,
  onClick,
  onToggle,
  onAddMore,
}) {
  const [open, setOpen] = useState(false);
  const pillRef = useRef(null);
  const hoveringRef = useRef(false);
  const leaveTimerRef = useRef(null);
  const enterTimerRef = useRef(null);
  const focusedRef = useRef(false);
  const tooltipId = useId();
  const toggle = onToggle || onClick;

  useEffect(() => () => {
    clearTimeout(enterTimerRef.current);
    clearTimeout(leaveTimerRef.current);
  }, []);

  const closePopup = () => {
    clearTimeout(enterTimerRef.current);
    clearTimeout(leaveTimerRef.current);
    setOpen(false);
  };

  // Cached, real-time reaction details. The query is enabled only while the
  // popup is open; socket events (reaction:add / reaction:remove) invalidate
  // ['reactionDetails', messageId, emoji] so an open popup — or the next open
  // within staleTime — reflects who reacted, sourced from the database.
  const { data: reactionData } = useQuery({
    queryKey: ['reactionDetails', messageId, emoji],
    queryFn: () =>
      messageAPI
        .getReaction(messageId, emoji)
        .then((res) => res?.data),
    enabled: !!open && !!messageId,
    staleTime: 15_000,
    gcTime: 60_000,
    retry: 1,
  });

  const effectiveUsers = reactionData?.users || users || [];

  const beginHover = () => {
    hoveringRef.current = true;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    clearTimeout(enterTimerRef.current);
    if (!open) {
      enterTimerRef.current = setTimeout(() => {
        if (hoveringRef.current || focusedRef.current) setOpen(true);
      }, 300);
    }
  };

  const endHover = () => {
    hoveringRef.current = false;
    if (!focusedRef.current) clearTimeout(enterTimerRef.current);
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    // Small delay so the user can move the pointer from the pill onto the
    // popup (rendered in a portal at body level) without it closing.
    leaveTimerRef.current = setTimeout(() => {
      if (!hoveringRef.current && !focusedRef.current) setOpen(false);
    }, 300);
  };

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        aria-pressed={!!hasReacted}
        aria-label={`${hasReacted ? 'Remove' : 'Add'} ${emoji} reaction; ${count ?? 0} reactions`}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={beginHover}
        onMouseLeave={endHover}
        onFocus={() => {
          const wasHovering = hoveringRef.current;
          focusedRef.current = true;
          beginHover();
          hoveringRef.current = wasHovering;
        }}
        onBlur={() => {
          focusedRef.current = false;
          endHover();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            closePopup();
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          closePopup();
          toggle?.(emoji);
        }}
        className="reaction-renderer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          padding: '4px 10px',
          minHeight: '28px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: hasReacted ? '600' : '500',
          lineHeight: '1',
          cursor: 'pointer',
          transition: 'background-color 0.30s ease, border-color 0.30s ease, box-shadow 0.30s ease, transform 0.30s ease, filter 0.30s ease',
          background: hasReacted
            ? "color-mix(in srgb, var(--accent-primary, #1264a3) 14%, transparent)"
            : "var(--bg-hover, rgba(255, 255, 255, 0.05))",
          border: `1px solid ${
            hasReacted
              ? "var(--accent-primary, #1264a3)"
              : "var(--border-secondary, rgba(255, 255, 255, 0.12))"
          }`,
          color: hasReacted
            ? "var(--accent-primary, #1264a3)"
            : "var(--text-primary, #d1d2d3)",
          boxShadow: hasReacted ? '0 1px 3px rgba(0, 0, 0, 0.12)' : 'none',
          userSelect: 'none',
        }}
      >
        <EmojiComponent emoji={emoji} size={16} />
        <span style={{ fontSize: '11.5px', fontWeight: hasReacted ? '700' : '500', display: 'inline-block', color: 'inherit' }}>
          {count}
        </span>
      </button>

      {open && (
        <ReactionDetailsPopup
          emoji={emoji}
          count={count}
          hasReacted={hasReacted}
          users={effectiveUsers}
          currentUserId={currentUserId}
          id={tooltipId}
          onToggle={toggle}
          onAddMore={onAddMore}
          onClose={closePopup}
          anchorRef={pillRef}
          onMouseEnter={beginHover}
          onMouseLeave={endHover}
        />
      )}
    </>
  );
}
