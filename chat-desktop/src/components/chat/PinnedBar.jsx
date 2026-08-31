import { useState, useEffect, useRef } from "react";
import { useChatStore } from "../../stores/chatStore";
import { Pin, ChevronUp, ChevronDown, X, Paperclip } from "lucide-react";
import { getAttachmentPreviewLabel } from "./PinnedAttachmentCard";

/** Normalize attachments from a message (mirrors MessageItem + PinnedMessagesPanel logic). */
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

/**
 * PinnedBar — always-visible sticky banner at the top of the chat.
 *
 * Features:
 *  • Cycles through all pinned messages (↑ / ↓ or click the bar itself)
 *  • Shows "N of M" counter when there are multiple pins
 *  • Smooth slide-down entrance animation
 *  • Clicking jumps MessageList to the target message (highlight is handled there)
 *  • Dismiss button collapses the bar for the session (re-appears on channel change)
 */
export default function PinnedBar({ channelId }) {
  const pinnedMessagesByChannel = useChatStore(
    (s) => s.pinnedMessagesByChannel
  );
  const setScrollToMessageId = useChatStore((s) => s.setScrollToMessageId);

  const pinned = pinnedMessagesByChannel[channelId] || [];
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [entering, setEntering] = useState(false);
  const prevChannelRef = useRef(null);

  // Reset state whenever the channel changes
  useEffect(() => {
    if (prevChannelRef.current !== channelId) {
      prevChannelRef.current = channelId;
      setIndex(0);
      setDismissed(false);
      setEntering(true);
      const t = setTimeout(() => setEntering(false), 350);
      return () => clearTimeout(t);
    }
  }, [channelId]);

  // Keep index in bounds if pins change
  useEffect(() => {
    if (pinned.length === 0) return;
    setIndex((i) => Math.min(i, pinned.length - 1));
  }, [pinned.length]);

  if (!pinned.length || dismissed) return null;

  const current = pinned[index];
  const total = pinned.length;
  const hasMultiple = total > 1;

  const scrollTo = (msg) => {
    if (msg?._id) setScrollToMessageId(msg._id);
  };

  const prev = (e) => {
    e.stopPropagation();
    const next = (index - 1 + total) % total;
    setIndex(next);
    scrollTo(pinned[next]);
  };

  const next = (e) => {
    e.stopPropagation();
    const n = (index + 1) % total;
    setIndex(n);
    scrollTo(pinned[n]);
  };

  const handleBarClick = () => scrollTo(current);

  const attachmentLabel = getAttachmentPreviewLabel(deriveAttachments(current));
  const isAttachmentOnly = !current?.content?.trim() && !!attachmentLabel;
  const previewText = current?.content?.trim()
    ? current.content.slice(0, 80)
    : (attachmentLabel || "Attachment");

  return (
    <>
      <style>{`
        @keyframes pinBarSlideDown {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pinTextFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .pin-bar-root {
          display: flex;
          align-items: center;
          gap: 0;
          height: 38px;
          border-bottom: 1px solid var(--border-color, var(--border-primary));
          background: var(--surface-primary, var(--bg-secondary));
          flex-shrink: 0;
          overflow: hidden;
          animation: pinBarSlideDown 280ms cubic-bezier(0.34, 1.2, 0.64, 1) both;
          position: relative;
          z-index: 10;
        }
        /* Subtle accent stripe on left */
        .pin-bar-root::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: var(--accent-color, var(--accent-primary));
          border-radius: 0 2px 2px 0;
        }

        /* Navigation arrows */
        .pin-nav-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 100%;
          flex-shrink: 0;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 140ms ease, background 140ms ease;
          padding: 0;
        }
        .pin-nav-btn:hover {
          background: var(--surface-hover, var(--bg-hover));
          color: var(--text-primary);
        }
        .pin-nav-btn:active { transform: scale(0.9); }

        /* Icon + clickable content area */
        .pin-bar-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 100%;
          flex-shrink: 0;
          color: var(--accent-color, var(--accent-primary));
          padding-left: 6px;
        }
        .pin-bar-body {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          height: 100%;
          cursor: pointer;
          padding: 0 6px;
          transition: background 120ms ease;
        }
        .pin-bar-body:hover {
          background: var(--surface-hover, var(--bg-hover));
        }
        .pin-bar-body:active { opacity: 0.85; }

        .pin-bar-label {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--accent-color, var(--accent-primary));
          white-space: nowrap;
          flex-shrink: 0;
        }
        .pin-bar-sep {
          width: 1px;
          height: 14px;
          background: var(--border-color, var(--border-primary));
          flex-shrink: 0;
        }
        .pin-bar-text {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          animation: pinTextFade 200ms ease both;
        }

        /* Count pill */
        .pin-count-pill {
          flex-shrink: 0;
          margin-left: auto;
          font-size: 10.5px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 20px;
          background: color-mix(in srgb, var(--accent-color, var(--accent-primary)) 12%, transparent);
          color: var(--accent-color, var(--accent-primary));
          border: 1px solid color-mix(in srgb, var(--accent-color, var(--accent-primary)) 24%, transparent);
          white-space: nowrap;
          line-height: 1.4;
        }

        /* Dismiss */
        .pin-dismiss-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 100%;
          flex-shrink: 0;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 140ms ease, background 140ms ease;
          padding: 0;
          border-left: 1px solid var(--border-secondary, var(--border-color));
        }
        .pin-dismiss-btn:hover {
          background: color-mix(in srgb, var(--accent-red, #e5534b) 10%, transparent);
          color: var(--accent-red, #e5534b);
        }
      `}</style>

      <div className="pin-bar-root" role="banner" aria-label="Pinned message">
        {/* Left: pin icon */}
        <div className="pin-bar-icon">
          <Pin size={13} strokeWidth={2.2} />
        </div>

      

        {/* Clickable content area */}
        <div
          className="pin-bar-body"
          onClick={handleBarClick}
          title="Jump to pinned message"
        >
          <span className="pin-bar-label">Pinned</span>
          <span className="pin-bar-sep" />
          {isAttachmentOnly && (
            <Paperclip
              size={12}
              strokeWidth={2}
              style={{ color: "var(--text-muted)", flexShrink: 0 }}
            />
          )}
          <span className="pin-bar-text" key={current?._id}>
            {previewText}
            {(current?.content?.length || 0) > 80 ? "…" : ""}
          </span>
          {hasMultiple && (
            <span className="pin-count-pill">
              {index + 1} / {total}
            </span>
          )}
        </div>
          {/* Navigation: up arrow (only when >1 pin) */}
        {hasMultiple && (
          <button
            className="pin-nav-btn"
            onClick={prev}
            title="Previous pinned message"
            aria-label="Previous pinned message"
          >
            <ChevronUp size={13} strokeWidth={2} />
          </button>
        )}

        {/* Down arrow */}
        {hasMultiple && (
          <button
            className="pin-nav-btn"
            onClick={next}
            title="Next pinned message"
            aria-label="Next pinned message"
          >
            <ChevronDown size={13} strokeWidth={2} />
          </button>
        )}

        {/* Dismiss */}
        <button
          className="pin-dismiss-btn"
          onClick={() => setDismissed(true)}
          title="Hide pinned bar"
          aria-label="Hide pinned bar"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>
    </>
  );
}