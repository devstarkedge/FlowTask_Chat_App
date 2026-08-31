import { useEffect, useCallback, useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { X, Pin, Hash, Search, PinOff } from 'lucide-react';
import Loader from '../shared/Loader';
import { format } from "date-fns";
import { Avatar } from "./MemberAvatarGroup";
import PinnedAttachmentCard from "./PinnedAttachmentCard";

// ─── Helpers ───────────────────────────────────────────────────────────────

function truncate(text = "", len = 120) {
  return text.length > len ? text.slice(0, len) + "…" : text;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return `Today at ${format(d, "h:mm a")}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString())
    return `Yesterday at ${format(d, "h:mm a")}`;
  return format(d, "MMM d, yyyy · h:mm a");
}
/**
 * Normalize attachment data from a message — mirrors the same logic in MessageItem.
 * Files are stored as fileReferences (FileAsset refs) in modern messages,
 * and as embedded attachments[] in legacy messages.
 */
function deriveAttachments(msg) {
  if (!msg) return [];
  if (msg.fileReferences?.length > 0) {
    return msg.fileReferences
      .map((ref) =>
        ref?.fileId
          ? { ...ref.fileId, url: ref.fileId.secureUrl || ref.fileId.url }
          : ref
      )
      .filter(Boolean);
  }
  return msg.attachments || [];
}
// ─── Main Component ────────────────────────────────────────────────────────

export default function PinnedMessagesPanel({ channelId, onClose }) {
  const {
    pinnedMessagesByChannel,
    fetchPinnedMessages,
    unpinMessage,
    isLoadingPins,
    setScrollToMessageId,
  } = useChatStore();
  const user = useAuthStore((s) => s.user);

  const pinnedMessages = pinnedMessagesByChannel[channelId] || [];

  const [query, setQuery] = useState("");
  const [unpinningId, setUnpinningId] = useState(null);

  useEffect(() => {
    if (channelId) fetchPinnedMessages(channelId);
  }, [channelId, fetchPinnedMessages]);

  const filtered = query.trim()
    ? pinnedMessages.filter((m) => {
        const q = query.toLowerCase();
        if ((m.content || "").toLowerCase().includes(q)) return true;
        return deriveAttachments(m).some((a) =>
          (a?.originalName || a?.fileName || "").toLowerCase().includes(q)
        );
      })
    : pinnedMessages;

  const handleJump = useCallback(
    (msg) => {
      if (msg?._id) setScrollToMessageId(msg._id);
    },
    [setScrollToMessageId]
  );

  const handleUnpin = useCallback(
    async (e, msgId) => {
      e.stopPropagation();
      setUnpinningId(msgId);
      await unpinMessage(msgId);
      setUnpinningId(null);
    },
    [unpinMessage]
  );

  return (
    <>
      <style>{`
        @keyframes pmSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes pmCardIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pmUnpinSpin {
          to { transform: rotate(360deg); }
        }

        .pm-panel {
          display: flex;
          flex-direction: column;
          width: var(--thread-panel-width, 360px);
          min-width: var(--thread-panel-width, 320px);
          max-width: var(--thread-panel-width, 400px);
          height: 100%;
          background: var(--surface-primary, var(--bg-secondary));
          border-left: 1px solid var(--border-color, var(--border-primary));
          animation: pmSlideIn 260ms cubic-bezier(0.34, 1.1, 0.64, 1) both;
          overflow: hidden;
          flex-shrink: 0;
        }

        /* ── Header ── */
        .pm-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 14px;
          height: 52px;
          border-bottom: 1px solid var(--border-color, var(--border-primary));
          flex-shrink: 0;
          background: var(--surface-primary, var(--bg-secondary));
          position: relative;
        }
        .pm-header::after {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: var(--accent-color, var(--accent-primary));
          border-radius: 0 2px 2px 0;
        }
        .pm-header-icon {
          display: flex; align-items: center; justify-content: center;
          width: 30px; height: 30px;
          border-radius: 9px;
          background: color-mix(in srgb, var(--accent-color, var(--accent-primary)) 13%, transparent);
          color: var(--accent-color, var(--accent-primary));
          flex-shrink: 0;
        }
        .pm-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          flex: 1;
          letter-spacing: -0.01em;
        }
        .pm-count-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 20px; height: 20px;
          padding: 0 6px;
          border-radius: 10px;
          background: var(--accent-color, var(--accent-primary));
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pm-close-btn {
          display: flex; align-items: center; justify-content: center;
          width: 28px; height: 28px;
          border-radius: 7px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: background 130ms ease, color 130ms ease;
          padding: 0;
        }
        .pm-close-btn:hover { background: var(--surface-hover, var(--bg-hover)); color: var(--text-primary); }

        /* ── Search ── */
        .pm-search-wrap {
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-secondary, var(--border-color));
          flex-shrink: 0;
          background: var(--surface-primary, var(--bg-secondary));
        }
        .pm-search-inner {
          position: relative;
          display: flex;
          align-items: center;
        }
        .pm-search-icon {
          position: absolute; left: 10px;
          color: var(--text-muted);
          pointer-events: none;
        }
        .pm-search-input {
          width: 100%;
          height: 32px;
          padding: 0 10px 0 32px;
          border-radius: 8px;
          border: 1px solid var(--border-color, var(--border-primary));
          background: var(--surface-secondary, var(--bg-tertiary));
          color: var(--text-primary);
          font-size: 13px;
          font-family: var(--font-sans);
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .pm-search-input:focus {
          border-color: var(--accent-color, var(--accent-primary));
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color, var(--accent-primary)) 14%, transparent);
        }
        .pm-search-input::placeholder { color: var(--text-muted); }

        /* ── Scroll body ── */
        .pm-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 10px 12px 16px;
          scroll-behavior: smooth;
        }

        /* ── Card ── */
        .pm-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 13px;
          margin-bottom: 8px;
          border-radius: 12px;
          border: 1px solid var(--border-color, var(--border-primary));
          background: var(--surface-secondary, var(--bg-secondary));
          cursor: pointer;
          overflow: hidden;
          outline: none;
          transition:
            transform 200ms cubic-bezier(0.34, 1.2, 0.64, 1),
            box-shadow 200ms ease,
            border-color 200ms ease,
            background 150ms ease;
          animation: pmCardIn 280ms ease both;
        }
        .pm-card:nth-child(1) { animation-delay: 30ms; }
        .pm-card:nth-child(2) { animation-delay: 70ms; }
        .pm-card:nth-child(3) { animation-delay: 110ms; }
        .pm-card:nth-child(4) { animation-delay: 150ms; }
        .pm-card:nth-child(5) { animation-delay: 190ms; }
        .pm-card:nth-child(n+6) { animation-delay: 220ms; }

        /* Left accent */
        .pm-card::before {
          content: '';
          position: absolute;
          left: 0; top: 12%; bottom: 12%;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: var(--accent-color, var(--accent-primary));
          opacity: 0;
          transform: scaleY(0.3);
          transition: opacity 200ms ease, transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pm-card:hover::before { opacity: 1; transform: scaleY(1); }
        .pm-card:hover {
          transform: translateY(-2px) translateX(2px);
          box-shadow: 0 6px 22px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);
          border-color: color-mix(in srgb, var(--accent-color, var(--accent-primary)) 36%, var(--border-color));
          background: var(--surface-primary, var(--bg-primary));
        }
        .pm-card:active { transform: scale(0.99); }

        /* Author row */
        .pm-card-author {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pm-author-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: -0.01em;
        }
        .pm-author-time {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* Content preview */
        .pm-card-content {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.55;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Footer */
        .pm-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 2px;
        }
        .pm-jump-hint {
          font-size: 11px;
          color: var(--accent-color, var(--accent-primary));
          font-weight: 600;
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 160ms ease, transform 160ms ease;
        }
        .pm-card:hover .pm-jump-hint { opacity: 1; transform: translateX(0); }

        .pm-unpin-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 9px;
          border-radius: 6px;
          border: 1px solid var(--border-color, var(--border-primary));
          background: transparent;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          font-family: var(--font-sans);
          opacity: 0;
          transform: translateY(3px);
          transition:
            opacity 160ms ease,
            transform 160ms ease,
            background 130ms ease,
            color 130ms ease,
            border-color 130ms ease;
        }
        .pm-card:hover .pm-unpin-btn { opacity: 1; transform: translateY(0); }
        .pm-unpin-btn:hover {
          background: color-mix(in srgb, var(--accent-red, #e5534b) 10%, transparent);
          color: var(--accent-red, #e5534b);
          border-color: color-mix(in srgb, var(--accent-red, #e5534b) 30%, transparent);
        }
        .pm-unpin-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pm-unpin-spin {
          animation: pmUnpinSpin 600ms linear infinite;
          display: inline-block;
        }

        /* ── Empty state ── */
        .pm-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 56px 24px 32px;
          text-align: center;
          animation: pmCardIn 320ms ease both;
        }
        .pm-empty-orb {
          width: 56px; height: 56px;
          border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--accent-color, var(--accent-primary)) 10%, transparent);
          color: var(--accent-color, var(--accent-primary));
          margin-bottom: 14px;
          border: 1px solid color-mix(in srgb, var(--accent-color, var(--accent-primary)) 20%, transparent);
        }
        .pm-empty-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 6px;
          letter-spacing: -0.01em;
        }
        .pm-empty-desc {
          font-size: 12.5px;
          color: var(--text-muted);
          line-height: 1.6;
          margin: 0;
          max-width: 220px;
        }

        /* ── Loading skeleton ── */
        .pm-skeleton-card {
          padding: 12px 13px;
          margin-bottom: 8px;
          border-radius: 12px;
          border: 1px solid var(--border-secondary, var(--border-color));
          background: var(--surface-secondary, var(--bg-secondary));
          display: flex;
          flex-direction: column;
          gap: 8px;
          animation: pmCardIn 280ms ease both;
        }
        .pm-skeleton-row { display: flex; align-items: center; gap: 8px; }
        .pm-skeleton-line {
          border-radius: 6px;
          background: linear-gradient(90deg,
            var(--surface-secondary, var(--bg-secondary)) 25%,
            var(--surface-hover, var(--bg-hover)) 50%,
            var(--surface-secondary, var(--bg-secondary)) 75%);
          background-size: 200% 100%;
          animation: pmShimmer 1.5s infinite linear;
        }
        @keyframes pmShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }

        /* ── Section label ── */
        .pm-section-label {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 2px 6px;
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          color: var(--text-muted);
        }
        .pm-section-label::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border-color, var(--border-secondary));
          opacity: 0.5;
        }

        @media (max-width: 768px) {
          .pm-panel {
            position: fixed;
            inset: 0;
            z-index: 60;
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            border-left: none;
            animation: pmSlideIn 220ms ease both;
          }
        }
      `}</style>

      <div className="pm-panel" role="complementary" aria-label="Pinned messages">
        {/* Header */}
        <div className="pm-header">
          <div className="pm-header-icon">
            <Pin size={14} strokeWidth={2.2} />
          </div>
          <span className="pm-title">Pinned Messages</span>
          {pinnedMessages.length > 0 && (
            <span className="pm-count-badge">{pinnedMessages.length}</span>
          )}
          <button className="pm-close-btn" onClick={onClose} aria-label="Close pinned messages">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Search */}
        {pinnedMessages.length > 2 && (
          <div className="pm-search-wrap">
            <div className="pm-search-inner">
              <Search size={13} className="pm-search-icon" />
              <input
                className="pm-search-input"
                placeholder="Search pinned messages…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="pm-scroll">
          {isLoadingPins ? (
            <>
              <PmSkeleton />
              <PmSkeleton delay={60} />
              <PmSkeleton delay={120} />
            </>
          ) : filtered.length === 0 ? (
            <div className="pm-empty">
              <div className="pm-empty-orb">
                {query ? <Search size={22} /> : <Pin size={22} />}
              </div>
              <p className="pm-empty-title">
                {query ? "No results" : "No pinned messages"}
              </p>
              <p className="pm-empty-desc">
                {query
                  ? "Try a different search term."
                  : "Pin important messages to keep them here for easy access."}
              </p>
            </div>
          ) : (
            <>
              {filtered.length > 0 && (
                <div className="pm-section-label">
                  {filtered.length} pinned {filtered.length === 1 ? "message" : "messages"}
                </div>
              )}
              {filtered.map((msg) => {
                const authorName =
                  msg.senderSnapshot?.name || msg.authorId?.name || "Unknown";
                const authorAvatar =
                  msg.senderSnapshot?.avatar ||
                  (typeof msg.authorId === "object"
                    ? msg.authorId?.avatar
                    : null);
                const time = formatDate(msg.createdAt);
                const isUnpinning = unpinningId === msg._id;
                const isOwn =
                  msg.authorId?._id === user?._id ||
                  msg.authorId === user?._id;

                return (
                  <div
                    key={msg._id}
                    className="pm-card"
                    onClick={() => handleJump(msg)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && handleJump(msg)}
                    aria-label={`Pinned message from ${authorName}`}
                  >
                    {/* Author row */}
                    <div className="pm-card-author">
                      <Avatar
                        member={{ name: authorName, avatar: authorAvatar }}
                        size={24}
                        showStatus={false}
                      />
                      <span className="pm-author-name">{authorName}</span>
                      <span className="pm-author-time">{time}</span>
                    </div>

                    {/* Content */}
                    {(msg.content || "").trim() && (
                      <div className="pm-card-content">
                        {truncate(msg.content)}
                      </div>
                    )}

                    {/* Attachments — derive from fileReferences (modern) or attachments[] (legacy) */}
                    {(() => {
                      const atts = deriveAttachments(msg);
                      return atts.length > 0 ? (
                        <PinnedAttachmentCard attachments={atts} />
                      ) : null;
                    })()}

                    {/* Footer */}
                    <div className="pm-card-footer">
                      <span className="pm-jump-hint">↗ Jump to message</span>
                      <button
                        className="pm-unpin-btn"
                        onClick={(e) => handleUnpin(e, msg._id)}
                        disabled={isUnpinning}
                        title="Unpin message"
                        aria-label="Unpin message"
                      >
                        {isUnpinning ? (
                          <span className="pm-unpin-spin">
                            <Loader size={11} />
                          </span>
                        ) : (
                          <PinOff size={11} />
                        )}
                        {isUnpinning ? "Unpinning…" : "Unpin"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Skeleton card ─────────────────────────────────────────────────────────

function PmSkeleton({ delay = 0 }) {
  return (
    <div
      className="pm-skeleton-card"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="pm-skeleton-row">
        <div
          className="pm-skeleton-line"
          style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }}
        />
        <div className="pm-skeleton-line" style={{ width: 110, height: 13 }} />
        <div
          className="pm-skeleton-line"
          style={{ width: 60, height: 11, marginLeft: "auto" }}
        />
      </div>
      <div className="pm-skeleton-line" style={{ width: "90%", height: 13 }} />
      <div className="pm-skeleton-line" style={{ width: "65%", height: 13 }} />
    </div>
  );
}