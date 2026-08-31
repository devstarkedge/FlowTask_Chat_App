import { useMemo } from "react";
import FloatingPortal from "./FloatingPortal";
import { EmojiComponent } from "../shared/EmojiRenderer";
import { Avatar } from "./MemberAvatarGroup";
import { SmilePlus } from "lucide-react";

/**
 * ReactionDetailsPopup — Slack-style popup shown when a user clicks on a
 * reaction pill. Displays the emoji, the reaction count, and the list of users
 * who reacted (avatar + name). The current viewer is always listed first and
 * highlighted as "You".
 *
 * Add/remove reaction is preserved through a toggle action in the popup footer,
 * plus an optional "add more reactions" shortcut that opens the emoji picker.
 *
 * Props:
 *   users          – array of resolved user objects: { _id, name, avatar, email }
 *   emoji, hasReacted, count
 *   currentUserId  – logged-in user _id
 *   onToggle       – (emoji) => void  add/remove toggle
 *   onAddMore      – () => void      opens emoji picker (optional)
 *   onClose        – () => void
 *   anchorRef      – ref to the reaction pill button for positioning
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
      minWidth={264}
      minHeight={112}
      avoidElements={avoidElements}
    >
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{
          background: "var(--bg-primary, #1a1d21)",
          border: "1px solid var(--border-primary, rgba(255,255,255,0.12))",
          borderRadius: 12,
          boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderBottom: "1px solid var(--border-secondary, rgba(255,255,255,0.08))",
          }}
        >
          <EmojiComponent emoji={emoji} size={20} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-primary, #d1d2d3)",
            }}
          >
            {count != null ? count : sortedUsers.length}
          </span>
          <span style={{ flex: 1 }} />
          {onAddMore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddMore?.();
              }}
              title="Add more reactions"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "1px solid var(--border-secondary, rgba(255,255,255,0.12))",
                background: "var(--bg-hover, rgba(255,255,255,0.05))",
                cursor: "pointer",
                color: "var(--text-secondary, #d1d2d3)",
              }}
            >
              <SmilePlus size={16} />
            </button>
          )}
        </div>

        {/* Users list */}
        {sortedUsers.length === 0 ? (
          <div
            style={{
              padding: "16px 14px",
              fontSize: 13,
              color: "var(--text-muted, #78787d)",
            }}
          >
            No reactions
          </div>
        ) : (
          <div style={{ maxHeight: 216, overflowY: "auto", padding: "4px 0" }}>
            {sortedUsers.map((u) => {
              const isMe =
                currentUserId != null &&
                String(u._id || u.userId) === String(currentUserId);
              const name = isMe
                ? "You"
                : u.name || u.displayName || u.email || "Unknown user";
              return (
                <div
                  key={String(u._id || u.userId) || name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    minHeight: 38,
                    padding: "6px 12px",
                  }}
                >
                  <Avatar member={u} size={26} />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: isMe ? 700 : 500,
                      color: "var(--text-primary, #d1d2d3)",
                    }}
                  >
                    {name}
                  </span>
                  {isMe && (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--accent-primary, #1264a3)",
                      }}
                    >
                      you
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer action — preserves add/remove reaction */}
        <div
          style={{
            padding: 0,
          }}
        >
        </div>
      </div>
    </FloatingPortal>
  );
}
