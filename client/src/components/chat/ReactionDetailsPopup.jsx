import { useLiveProfileData } from '../../hooks/useLiveProfileData';
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import FloatingPortal from "./FloatingPortal";
import { EmojiComponent } from "../shared/EmojiRenderer";

const EMOJI_SHORTCODES = {
  "🎉": "tada",
  "🎂": "cake",
  "👍": "thumbsup",
  "👍🏻": "thumbsup",
  "👍🏼": "thumbsup",
  "👍🏽": "thumbsup",
  "👍🏾": "thumbsup",
  "👍🏿": "thumbsup",
  "👎": "thumbsdown",
  "❤️": "heart",
  "♥️": "heart",
  "😍": "heart_eyes",
  "😂": "joy",
  "🤣": "rofl",
  "🔥": "fire",
  "😊": "smile",
  "🚀": "rocket",
  "✨": "sparkles",
  "🙏": "pray",
  "👏": "clap",
  "🙌": "raised_hands",
  "💡": "bulb",
  "💯": "100",
  "👀": "eyes",
  "🤔": "thinking_face",
  "😎": "sunglasses",
  "🥳": "partying_face",
  "💩": "poop",
  "✅": "check",
  "❌": "x",
};

export function getEmojiShortcode(emoji) {
  if (!emoji) return "emoji";
  if (typeof emoji === "string" && emoji.startsWith(":") && emoji.endsWith(":")) {
    return emoji.slice(1, -1);
  }
  return EMOJI_SHORTCODES[emoji] || emoji;
}

export function formatReactionUserNames(users, currentUserId) {
  if (!users || users.length === 0) return "No reactions";
  const currentUserIdStr = currentUserId != null ? String(currentUserId) : null;
  const names = users.map((u) => {
    const isMe = currentUserIdStr != null && String(u._id || u.userId) === currentUserIdStr;
    return isMe ? "You" : u.name || u.displayName || u.email?.split("@")[0] || "Someone";
  });

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;

  const allButLast = names.slice(0, -1).join(", ");
  const last = names[names.length - 1];
  return `${allButLast}, and ${last}`;
}

/**
 * Compact reaction tooltip with current user names and a reaction count.
 */
export default function ReactionDetailsPopup({
  id,
  users = [],
  emoji,
  count,
  hasReacted,
  currentUserId,
  onToggle,
  onAddMore,
  onClose,
  anchorRef,
  onMouseEnter,
  onMouseLeave,
}) {
  users = useLiveProfileData(users);
  const popupRef = useRef(null);
  const [popupSize, setPopupSize] = useState({ width: 160, height: 60 });
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    const measure = () => {
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;
      if (width > 0 && height > 0) {
        setPopupSize((previous) => previous.width === width && previous.height === height
          ? previous : { width, height });
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(popup);
    return () => observer.disconnect();
  }, []);
  const sortedUsers = useMemo(() => {
    const currentUserIdStr = currentUserId != null ? String(currentUserId) : null;
    const copy = users.filter(Boolean);
    copy.sort((a, b) => {
      const aIsMe = currentUserIdStr != null && String(a._id || a.userId) === currentUserIdStr;
      const bIsMe = currentUserIdStr != null && String(b._id || b.userId) === currentUserIdStr;
      return (bIsMe ? 1 : 0) - (aIsMe ? 1 : 0);
    });
    return copy;
  }, [users, currentUserId]);

  const formattedNames = useMemo(
    () => formatReactionUserNames(sortedUsers, currentUserId),
    [sortedUsers, currentUserId]
  );

  const avoidElements = useMemo(() => {
    const messageRoot = anchorRef?.current?.closest?.('[id^="msg-"]');
    return [
      messageRoot?.querySelector('.message-bubble'),
      messageRoot?.querySelector('.message-action-toolbar'),
      messageRoot?.querySelector('.thread-msg-actions'),
    ].filter(Boolean);
  }, [anchorRef]);

  return (
    <FloatingPortal
      anchorRef={anchorRef}
      isOpen={true}
      onClose={onClose}
      position="top-center"
      offset={8}
      minWidth={popupSize.width}
      minHeight={popupSize.height}
      avoidElements={avoidElements}
    >
      <style>{`
        @keyframes reactionPopupFadeIn {
          0% { opacity: 0; transform: scale(0.95) translateY(4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .reaction-details-popup-card {
          animation: reactionPopupFadeIn 0.30s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .reaction-details-popup-card { animation: none; }
        }
      `}</style>
      <div
        ref={popupRef}
        id={id}
        role="tooltip"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
        }}
        className="reaction-details-popup-card"
        style={{
          position: "relative",
          background: "var(--bg-popover, #1e1f23)",
          border: "1px solid var(--border-popover, rgba(255, 255, 255, 0.09))",
          borderRadius: 9,
          boxShadow: "0 6px 18px rgba(0, 0, 0, 0.24)",
          padding: "10px 12px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          textAlign: "left",
          maxWidth: "min(240px, calc(100vw - 16px))",
          width: "max-content",
          minWidth: 160,
          gap: 10,
          userSelect: "none",
          cursor: "default",
        }}
      >
        {/* Small emoji badge beside the user details */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            background: "rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <EmojiComponent emoji={emoji} size={22} />
        </div>

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Current user names wrap inside the compact tooltip */}
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1.4,
            color: "var(--text-bright, #ffffff)",
            maxHeight: 80,
            overflowY: "auto",
            wordBreak: "break-word",
            textAlign: "left",
            letterSpacing: "-0.01em",
          }}
        >
          {formattedNames}
        </div>

        <div style={{ fontSize: 11, lineHeight: 1.4, color: "var(--text-muted, #b8bcc6)" }}>
          {count ?? sortedUsers.length} {(count ?? sortedUsers.length) === 1 ? "person" : "people"} reacted
        </div>
        </div>

        {/* Downward Caret Tooltip Arrow */}
        <div
          style={{
            position: "absolute",
            bottom: -7,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderTop: "7px solid var(--bg-popover, #1e1f23)",
            zIndex: 2,
          }}
        />
      </div>
    </FloatingPortal>
  );
}
