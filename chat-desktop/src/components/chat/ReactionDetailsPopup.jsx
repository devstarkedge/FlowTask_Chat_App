import { useMemo } from "react";
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
 * ReactionDetailsPopup — Redesigned modern reaction details floating popup.
 * Features:
 *  - Prominent emoji displayed inside a crisp white square card at top.
 *  - Names of users formatted naturally in readable format (e.g. "Nisha Devi, Akshit, and Anil Kumar").
 *  - Bottom message showing "reacted with :shortcode:".
 *  - Dark, soft rounded container with smooth shadow and downward tooltip arrow.
 */
export default function ReactionDetailsPopup({
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

  const shortcode = useMemo(() => getEmojiShortcode(emoji), [emoji]);
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
      offset={10}
      minWidth={200}
      minHeight={140}
      avoidElements={avoidElements}
    >
      <style>{`
        @keyframes reactionPopupFadeIn {
          0% { opacity: 0; transform: scale(0.95) translateY(4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .reaction-details-popup-card {
          animation: reactionPopupFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <div
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
          borderRadius: 14,
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.42), 0 2px 8px rgba(0, 0, 0, 0.22)",
          padding: "18px 20px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: 290,
          width: "max-content",
          minWidth: 200,
          gap: 12,
          userSelect: "none",
          cursor: "default",
        }}
      >
        {/* Top: Prominent emoji inside small white square card */}
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 12,
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            flexShrink: 0,
          }}
        >
          <EmojiComponent emoji={emoji} size={36} />
        </div>

        {/* Middle: User names displayed naturally */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.4,
            color: "var(--text-bright, #ffffff)",
            maxHeight: 120,
            overflowY: "auto",
            padding: "0 2px",
            wordBreak: "break-word",
            textAlign: "center",
            letterSpacing: "-0.01em",
          }}
        >
          {formattedNames}
        </div>

        {/* Bottom: Subtitle text e.g. "reacted with :tada:" */}
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--accent-link, #38bdf8)",
            opacity: 0.92,
            letterSpacing: "-0.01em",
          }}
        >
          reacted with :{shortcode}:
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

