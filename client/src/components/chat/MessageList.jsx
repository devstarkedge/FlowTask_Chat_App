/* eslint-disable react/prop-types */
import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useChannelStore } from "../../stores/channelStore";
import { useAuthStore } from "../../stores/authStore";
import MessageItem from "./MessageItem";
import AutoActivityMessage from "./AutoActivityMessage";
import ForwardMessageModal from "./ForwardMessageModal";
import { MessageCircle, ChevronDown, Forward } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { useLocation, useNavigate } from "react-router-dom";
import { getChannelPath, getDMPath } from "../../utils/chatRoutes";


export default function MessageList({
  messages,
  channelId,
  onOpenThread,
  onOpenProfile,
  onOpenFilePreview,
  isDMChannel,
  onSaveMessage,
}) {
  // Use individual subscriptions to avoid returning new object snapshots
  // from a single selector (this can trigger React's getSnapshot warning).
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const hasMore = useChatStore((s) => s.hasMore?.[channelId]);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const highlightMessageId = useChatStore((s) => s.highlightMessageId);
  const setHighlightMessageId = useChatStore((s) => s.setHighlightMessageId);
  const scrollToMessageId = useChatStore((s) => s.scrollToMessageId);
  const setScrollToMessageId = useChatStore((s) => s.setScrollToMessageId);

  const lastReadMessageId = useChannelStore(
    (s) => s.lastReadByChannel?.[channelId]
  );
  const currentUserId = useAuthStore((s) => s.user?._id);

  const virtuosoRef = useRef(null);
  const lastScrolledHighlightId = useRef(null);

  // Forward message modal state
  const [forwardTarget, setForwardTarget] = useState(null);
  // Multi-message selection state (shift-select / bulk forward)
  const [selectedMessageIds, setSelectedMessageIds] = useState(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const lastSelectedIdRef = useRef(null);

  // Deep-link navigation from DownloadsModal folder icon
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingMessageScroll, setPendingMessageScroll] = useState(null);

  // Extract workspaceId from URL path (e.g., /workspace/:wsId/channel/...)
  const workspaceId = useMemo(() => {
    const parts = location.pathname.split('/');
    const wsIdx = parts.indexOf('workspace');
    return wsIdx !== -1 && wsIdx + 1 < parts.length ? parts[wsIdx + 1] : null;
  }, [location.pathname]);

  // Extract messageId from URL path (e.g., /workspace/:wsId/channel/:channelId/message/:messageId)
  useEffect(() => {
    const pathParts = location.pathname.split('/');
    const messageIndex = pathParts.indexOf('message');
    if (messageIndex !== -1 && messageIndex + 1 < pathParts.length) {
      const messageIdFromUrl = pathParts[messageIndex + 1];
      if (messageIdFromUrl) {
        setPendingMessageScroll(messageIdFromUrl);
      }
    }
  }, [location.pathname]);

  // Tracks whether the user is at (or very near) the bottom of the list.
  const isAtBottomRef = useRef(true);

  // Show/hide the "scroll to bottom" floating button
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Snapshot of previous render to detect truly new messages
  const prevRef = useRef({ count: 0, lastId: null, channelId: null });

  // ─── Multi-message selection helpers ───────────────────────────────────
  const toggleSelectMessage = useCallback((msgId, shiftKey = false) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIdRef.current) {
        // Range select: find indices in the messages array
        const allIds = messages.map(m => m._id);
        const lastIdx = allIds.indexOf(lastSelectedIdRef.current);
        const currentIdx = allIds.indexOf(msgId);
        if (lastIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(lastIdx, currentIdx);
          const end = Math.max(lastIdx, currentIdx);
          for (let i = start; i <= end; i++) {
            next.add(allIds[i]);
          }
        } else {
          if (next.has(msgId)) next.delete(msgId);
          else next.add(msgId);
        }
      } else {
        if (next.has(msgId)) next.delete(msgId);
        else next.add(msgId);
      }
      lastSelectedIdRef.current = msgId;
      return next;
    });
    setIsSelecting(true);
  }, [messages]);

  const clearSelection = useCallback(() => {
    setSelectedMessageIds(new Set());
    setIsSelecting(false);
    lastSelectedIdRef.current = null;
  }, []);

  // Build forward target: if messages are selected, forward all of them
  const handleForwardSelected = useCallback((singleMessage) => {
    if (selectedMessageIds.size > 1) {
      // Bulk forward: collect selected messages in chronological order
      const selectedMessages = messages
        .filter(m => selectedMessageIds.has(m._id))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      setForwardTarget({ messages: selectedMessages });
    } else {
      setForwardTarget({ message: singleMessage });
    }
  }, [selectedMessageIds, messages]);

  // Reset selection when channel changes
  useEffect(() => {
    clearSelection();
  }, [channelId, clearSelection]);

  // ─── Load older messages when user scrolls to top ─────────────────────
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMessages || messages.length === 0)
      return;
    const oldest = messages[0];
    if (oldest) fetchMessages(channelId, { cursor: oldest._id, limit: 80 });
  }, [channelId, hasMore, isLoadingMessages, messages, fetchMessages]);

  // ─── Hard-jump to bottom whenever the active channel changes ──────────
  useEffect(() => {
    isAtBottomRef.current = true;
    setShowScrollBtn(false);
    prevRef.current = { count: 0, lastId: null, channelId };

    if (messages.length > 0) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto" });
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // ─── Smart auto-scroll on new messages ───────────────────────────────
  useEffect(() => {
    const prev = prevRef.current;
    const lastMsg = messages[messages.length - 1];

    if (prev.channelId !== channelId || messages.length === 0) {
      prevRef.current = {
        count: messages.length,
        lastId: lastMsg?._id ?? null,
        channelId,
      };
      return;
    }

    const hasNewMessage =
      messages.length > prev.count && lastMsg?._id !== prev.lastId;

    if (hasNewMessage) {
      const authorId = lastMsg?.authorId?._id ?? lastMsg?.authorId;
      const isOwnMessage =
        authorId != null &&
        currentUserId != null &&
        String(authorId) === String(currentUserId);

      if (isAtBottomRef.current || isOwnMessage) {
        setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({
            index: "LAST",
            behavior: "smooth",
          });
        }, 30);
      }
    }

    prevRef.current = {
      count: messages.length,
      lastId: lastMsg?._id ?? null,
      channelId,
    };
  }, [messages, channelId, currentUserId]);

  // ─── Flatten: date separators + unread marker ─────────────────────────
  const isActivityMessage = (msg) =>
    msg.contentType === "activity" ||
    msg.contentType === "system" ||
    msg.contentType === "bot" ||
    !!msg.activityMeta;

  const flattenedItems = useMemo(() => {
    const flattened = [];
    let currentDate = null;
    let insertedUnreadMarker = false;

    const lastReadIndex = lastReadMessageId
      ? messages.findIndex((m) => m._id === lastReadMessageId)
      : -1;

    if (lastReadMessageId && messages.length > 0 && lastReadIndex === -1) {
      flattened.push({ isUnreadSeparator: true, _id: "unread-separator" });
      insertedUnreadMarker = true;
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const d = new Date(msg.createdAt);
      const label = formatDateLabel(d);

      let separatorJustInserted = false;

      if (label !== currentDate) {
        currentDate = label;
        flattened.push({
          isDateSeparator: true,
          date: label,
          _id: `date-${label}`,
        });
        separatorJustInserted = true;
      }

      if (
        !insertedUnreadMarker &&
        lastReadMessageId &&
        i > 0 &&
        messages[i - 1]._id === lastReadMessageId &&
        msg._id !== lastReadMessageId
      ) {
        flattened.push({ isUnreadSeparator: true, _id: "unread-separator" });
        insertedUnreadMarker = true;
        separatorJustInserted = true;
      }

      const prevMsg = i > 0 && !separatorJustInserted ? messages[i - 1] : null;
      const nextMsgRaw = i < messages.length - 1 ? messages[i + 1] : null;
      const nextWillHaveSeparator =
        nextMsgRaw &&
        (formatDateLabel(new Date(nextMsgRaw.createdAt)) !== label ||
          (!insertedUnreadMarker &&
            lastReadMessageId &&
            msg._id === lastReadMessageId));
      const nextMsg = nextWillHaveSeparator ? null : nextMsgRaw;

      const prevAuthorId = prevMsg?.authorId?._id || prevMsg?.authorId;
      const currentAuthorId = msg.authorId?._id || msg.authorId;
      const nextAuthorId = nextMsg?.authorId?._id || nextMsg?.authorId;

      const sameAsPrev = !!(
        prevMsg &&
        prevAuthorId &&
        currentAuthorId &&
        prevAuthorId.toString() === currentAuthorId.toString() &&
        !isActivityMessage(msg) &&
        !isActivityMessage(prevMsg) &&
        new Date(msg.createdAt) - new Date(prevMsg.createdAt) < 300000
      );

      const sameAsNext = !!(
        nextMsg &&
        nextAuthorId &&
        currentAuthorId &&
        nextAuthorId.toString() === currentAuthorId.toString() &&
        !isActivityMessage(msg) &&
        !isActivityMessage(nextMsg) &&
        new Date(nextMsg.createdAt) - new Date(msg.createdAt) < 300000
      );

      flattened.push({
        ...msg,
        isCompact: sameAsPrev,
        isLastInGroup: !sameAsNext,
      });
    }

    return flattened;
  }, [messages, lastReadMessageId]);

  // ─── Auto-scroll to message from deep-link (DownloadsModal folder navigation) ──
  useEffect(() => {
    if (!pendingMessageScroll || !virtuosoRef.current || flattenedItems.length === 0) {
      return;
    }

    const idx = flattenedItems.findIndex((item) => item._id === pendingMessageScroll);
    
    if (idx !== -1) {
      // Message is loaded in the current view - scroll to it
      setTimeout(() => {
        virtuosoRef.current.scrollToIndex({
          index: idx,
          align: "center",
          behavior: "smooth",
        });
        
        // Trigger highlight animation
        setHighlightMessageId(pendingMessageScroll);
        
        // Clear highlight after 4 seconds
        setTimeout(() => {
          setHighlightMessageId(null);
        }, 4000);
      }, 200);
      
      // Clean up URL by removing the /message/:messageId part
      const pathWithoutMessage = location.pathname.split('/').filter((part, i, arr) => {
        if (part === 'message') return false;
        if (i > 0 && arr[i - 1] === 'message') return false;
        return true;
      }).join('/');
      
      navigate(pathWithoutMessage || location.pathname, { replace: true });
      setPendingMessageScroll(null);
    }
    // If message not yet loaded, we'll scroll when it appears in flattenedItems
  }, [pendingMessageScroll, flattenedItems, setHighlightMessageId, location.pathname, navigate]);

  // ─── Scroll to highlighted / linked message ────────────────────────────
  // NOTE: Do NOT clear highlightMessageId here — the store's
  // setScrollAndHighlightMessage already handles clearing after 3000ms.
  // This effect only handles scrolling to the message.
  useEffect(() => {
    if (
      highlightMessageId &&
      virtuosoRef.current &&
      flattenedItems.length > 0
    ) {
      const idx = flattenedItems.findIndex(
        (item) => item._id === highlightMessageId
      );
      if (idx !== -1) {
        lastScrolledHighlightId.current = highlightMessageId;
        setTimeout(() => {
          virtuosoRef.current.scrollToIndex({
            index: idx,
            align: "center",
            behavior: "smooth",
          });
        }, 100);
      }
    } else if (!highlightMessageId) {
      lastScrolledHighlightId.current = null;
    }
  }, [highlightMessageId, flattenedItems, setHighlightMessageId]);

  // ─── Scroll-to from pinned messages ───────────────────────────────────
  useEffect(() => {
    if (
      !scrollToMessageId ||
      !virtuosoRef.current ||
      flattenedItems.length === 0
    )
      return;

    const tryScroll = () => {
      const index = flattenedItems.findIndex(
        (item) => item._id === scrollToMessageId
      );
      if (index !== -1) {
        virtuosoRef.current.scrollToIndex({
          index,
          align: "center",
          behavior: "smooth",
        });
        // Trigger DOM highlight after scroll settles
        setTimeout(() => {
          const el = document.getElementById(`msg-${scrollToMessageId}`);
          if (el) {
            el.classList.remove("message-highlight");
            // Force reflow so the animation re-triggers
            void el.offsetWidth;
            el.classList.add("message-highlight");
            setTimeout(
              () => el.classList.remove("message-highlight"),
              2600
            );
          }
        }, 350);
        setScrollToMessageId(null);
        return true;
      }
      return false;
    };

    if (tryScroll()) return;

    // Message not in current window → try loading older pages
    let attempts = 0;
    const tryLoadAndScroll = async () => {
      while (attempts < 5) {
        const oldest = messages[0];
        if (!oldest) break;
        await fetchMessages(channelId, { cursor: oldest._id, limit: 80 });
        // Wait a tick for state to propagate
        await new Promise((r) => setTimeout(r, 120));
        if (tryScroll()) return;
        attempts++;
      }
    };
    tryLoadAndScroll();
  }, [scrollToMessageId, flattenedItems, messages, channelId, fetchMessages, setScrollToMessageId]);

  // ─── Loading / empty states ────────────────────────────────────────────
  const isInitialLoad = isLoadingMessages && messages.length === 0;

  if (isInitialLoad) {
    return (
      <div className="flex-1 overflow-hidden" style={{ padding: "16px 20px" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <MessageSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!isLoadingMessages && messages.length === 0) {
    return (
      <div className="flex-1 overflow-hidden">
        <EmptyState />
      </div>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────────
  return (
    <>
    <div
      className="flex-1 overflow-hidden relative"
      role="log"
      aria-label="Message list"
      aria-live="polite"
      style={{ minHeight: 0 }}
    >
      <Virtuoso
        ref={virtuosoRef}
        data={flattenedItems}
        computeItemKey={(index, item) => item._id || index}
        className="w-full h-full"
        firstItemIndex={1000000 - flattenedItems.length}
        initialTopMostItemIndex={flattenedItems.length - 1}
        startReached={loadMore}
        alignToBottom={true}
        increaseViewportBy={{ top: 400, bottom: 200 }}
        followOutput={(isAtBottom) => {
          // Only update the ref here. Avoid calling setState during Virtuoso's
          // render phase (some Virtuoso internals call `followOutput` while
          // rendering), which can cause render-update loops. `atBottomStateChange`
          // will handle updating component state.
          isAtBottomRef.current = isAtBottom;
          return isAtBottom ? "smooth" : false;
        }}
        atBottomStateChange={(atBottom) => {
          isAtBottomRef.current = atBottom;
          setShowScrollBtn(!atBottom);
        }}
        components={{
          Header: () =>
            isLoadingMessages && messages.length > 0 ? (
              <div style={{ padding: "8px 20px", textAlign: "center" }}>
                <div
                  className="skeleton"
                  style={{
                    width: 120,
                    height: 20,
                    margin: "0 auto",
                    borderRadius: 10,
                  }}
                />
              </div>
            ) : null,
          Footer: () => <div style={{ height: 16 }} />,
        }}
        itemContent={(index, item) => {
          if (item.isDateSeparator) {
            return (
              <div
                className="animate-fade-in"
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 20px 4px",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: "var(--border-secondary)",
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    padding: "2px 10px",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-full)",
                    border: "1px solid var(--border-secondary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.date}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: "var(--border-secondary)",
                  }}
                />
              </div>
            );
          }

          if (isActivityMessage(item)) {
            return (
              <div style={{ padding: "2px 20px" }}>
                <AutoActivityMessage message={item} />
              </div>
            );
          }

          if (item.isUnreadSeparator) {
            return (
              <div
                className="animate-fade-in"
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 20px 4px",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: "var(--status-error)",
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--status-error)",
                    whiteSpace: "nowrap",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  New
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: "var(--status-error)",
                  }}
                />
              </div>
            );
          }

          return (
            <MessageItem
              message={item}
              isHighlighted={item._id === highlightMessageId}
              compact={item.isCompact}
              isLastInGroup={item.isLastInGroup}
              onOpenThread={onOpenThread}
              onOpenProfile={onOpenProfile}
              onOpenFilePreview={onOpenFilePreview}
              isDMChannel={isDMChannel}
              onSaveMessage={onSaveMessage}
              onForwardMessage={(msg) => handleForwardSelected(msg)}
              isSelecting={isSelecting}
              isSelected={selectedMessageIds.has(item._id)}
              onSelectMessage={toggleSelectMessage}
            />
          );
        }}
      />

      {/* Multi-selection toolbar */}
      {isSelecting && selectedMessageIds.size > 0 && (
        <div
          style={{
            position: "absolute", bottom: 56, left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 16px", borderRadius: 12,
            background: "var(--bg-secondary, #1e1f24)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            zIndex: 20, whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-white)" }}>
            {selectedMessageIds.size} selected
          </span>
          <button
            onClick={() => handleForwardSelected(null)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 8, border: "none",
              background: "var(--accent-primary, #5865f2)", color: "#fff",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Forward size={13} /> Forward
          </button>
          <button
            onClick={clearSelection}
            style={{
              padding: "5px 12px", borderRadius: 8, border: "none",
              background: "rgba(255,255,255,0.08)", color: "var(--text-primary)",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Scroll-to-bottom FAB ─────────────────────────────────────── */}
      {showScrollBtn && (
        <button
          aria-label="Scroll to latest message"
          title="Jump to latest"
          onClick={() =>
            virtuosoRef.current?.scrollToIndex({
              index: "LAST",
              behavior: "smooth",
            })
          }
          style={{
            position: "absolute",
            bottom: 16,
            right: 20,
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "var(--bg-elevated, var(--bg-secondary))",
            border: "1px solid var(--border-primary)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--text-secondary)",
            zIndex: 10,
          }}
        >
          <ChevronDown size={18} />
        </button>
      )}
    </div>

      {/* Forward Message Modal */}
      {forwardTarget && (
        <ForwardMessageModal
          message={forwardTarget.message || null}
          messages={forwardTarget.messages || null}
          onClose={() => { setForwardTarget(null); clearSelection(); }}
          onForwardComplete={(destinationId) => {
            // Single destination: navigate to that conversation
            const channels = useChannelStore.getState().channels;
            const destChannel = channels.find(c => c._id === destinationId);
            const path = destChannel?.type === 'dm'
              ? getDMPath(workspaceId, destinationId)
              : getChannelPath(workspaceId, destinationId);
            useChannelStore.getState().setActiveChannel(destinationId);
            navigate(path);
            setForwardTarget(null);
            clearSelection();
          }}
        />
      )}
    </>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function MessageSkeleton() {
  return (
    <div
      style={{ display: "flex", gap: 10, padding: "6px 0" }}
      className="animate-fade-in"
    >
      <div
        className="skeleton"
        style={{
          width: 36,
          height: 36,
          borderRadius: "var(--radius-lg)",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <div className="skeleton" style={{ width: 100, height: 14 }} />
          <div className="skeleton" style={{ width: 48, height: 14 }} />
        </div>
        <div
          className="skeleton"
          style={{ width: "70%", height: 14, marginBottom: 4 }}
        />
        <div className="skeleton" style={{ width: "45%", height: 14 }} />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="flex items-center justify-center h-full animate-fade-in"
      style={{ color: "var(--text-muted)" }}
    >
      <div className="text-center">
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "var(--radius-xl)",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 12px",
          }}
        >
          <MessageCircle size={24} style={{ color: "var(--text-muted)" }} />
        </div>
        <p
          style={{
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: 4,
          }}
        >
          No messages yet
        </p>
        <p style={{ fontSize: 13 }}>
          Start the conversation by sending a message below.
        </p>
      </div>
    </div>
  );
}

// ─── Date label helper ────────────────────────────────────────────────────────

function formatDateLabel(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const diff = today.getTime() - messageDay.getTime();
  const dayMs = 86400000;

  if (diff === 0) return "Today";
  if (diff === dayMs) return "Yesterday";
  
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  const month = date.toLocaleDateString(undefined, { month: "long" });
  
  const day = date.getDate();
  const s = ["th", "st", "nd", "rd"];
  const v = day % 100;
  const ordinal = day + (s[(v - 20) % 10] || s[v] || s[0]);
  
  const year = date.getFullYear() !== now.getFullYear() ? `, ${date.getFullYear()}` : "";

  return `${weekday}, ${month} ${ordinal}${year}`;
}