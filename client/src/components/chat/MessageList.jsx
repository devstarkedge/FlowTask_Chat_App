/* eslint-disable react/prop-types */
import {
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useState,
  useLayoutEffect,
} from "react";
import { useChatStore } from "../../stores/chatStore";
import { useChannelStore } from "../../stores/channelStore";
import MessageItem from "./MessageItem";
import AutoActivityMessage from "./AutoActivityMessage";
import { getHuddleTimeline } from "../huddles/huddleTimeline";
import ForwardMessageModal from "./ForwardMessageModal";
import { MessageCircle, ChevronDown, Forward } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { useLocation, useNavigate } from "react-router-dom";
import { getChannelPath, getDMPath } from "../../utils/chatRoutes";
import {
  advanceMessageItemIndex,
  getVirtuosoMessageKey,
  measureMessageItem,
} from "../../utils/virtuosoMessageIndex";
import { AT_BOTTOM_THRESHOLD } from "../../utils/chatScrollUtils";
import { useChatScrollManager } from "../../hooks/useChatScrollManager";

// Stable component types keep Virtuoso's measured spacers mounted on rerenders.
function MessageListHeader({ context }) {
  return (
    <div style={{ height: 36, padding: "8px 20px", textAlign: "center" }}>
      {context.isLoadingMessages && (
        <div className="skeleton" style={{ width: 120, height: 20, margin: "0 auto", borderRadius: 10 }} />
      )}
    </div>
  );
}

function MessageListFooter() {
  return <div style={{ height: 12 }} />;
}

const LIST_COMPONENTS = { Header: MessageListHeader, Footer: MessageListFooter };

export default function MessageList({
  messages,
  channelId,
  isActivityTimeline = false,
  onOpenThread,
  onOpenProfile,
  onOpenFilePreview,
  isDMChannel,
  onSaveMessage,
}) {
  // Use individual subscriptions to avoid returning new object snapshots
  // from a single selector (this can trigger React's getSnapshot warning).
  const isLoadingMessages = useChatStore((s) =>
    s.loadingMessagesByChannel?.[channelId] != null
      ? !!s.loadingMessagesByChannel[channelId]
      : !!s.isLoadingMessages
  );
  const hasMore = useChatStore((s) => s.hasMore?.[channelId]);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const highlightMessageId = useChatStore((s) => s.highlightMessageId);
  const setHighlightMessageId = useChatStore((s) => s.setHighlightMessageId);
  const scrollToMessageId = useChatStore((s) => s.scrollToMessageId);
  const setScrollToMessageId = useChatStore((s) => s.setScrollToMessageId);
  const editingMessageId = useChatStore((s) => s.editingMessageId);
  const scrollToLatestRequest = useChatStore(
    (s) => s.scrollToLatestRequestByChannel?.[channelId] || 0,
  );

  const lastReadMessageId = useChannelStore(
    (s) => s.lastReadByChannel?.[channelId]
  );
  // Keep the unread boundary fixed for this visit. Receipt refreshes must not
  // insert/remove a separator or regroup messages underneath the reader.
  const unreadBoundaryRef = useRef(null);
  if (!unreadBoundaryRef.current || unreadBoundaryRef.current.channelId !== channelId) {
    unreadBoundaryRef.current = { channelId, messageId: lastReadMessageId };
  }
  const unreadBoundary = unreadBoundaryRef.current.messageId;
  const virtuosoRef = useRef(null);
  const lastScrolledHighlightId = useRef(null);
  const lastScrolledEditingId = useRef(null);
  const consumedScrollToLatestRequestRef = useRef(scrollToLatestRequest);
  const firstItemIndexTrackerRef = useRef(null);

  // ─── Intent-Aware Scroll Manager ──────────────────────────────────────
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMessages) return;
    const oldest = useChatStore.getState().selectMessagesForChannel(channelId)[0];
    if (oldest) fetchMessages(channelId, { cursor: oldest._id, limit: 80 });
  }, [channelId, hasMore, isLoadingMessages, fetchMessages]);

  const {
    setScroller,
    showScrollBtn,
    scrollToLatest,
    handleUserIntent,
    handleAtBottomStateChange,
    followOutput,
    handleStartReached,
    handleLayoutUpdate,
  } = useChatScrollManager({
    channelId,
    virtuosoRef,
    hasMore,
    isLoadingMessages,
    onLoadEarlier: loadMore,
  });

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

  // Respond to explicit request to scroll to latest (e.g. newly sent message)
  useEffect(() => {
    if (scrollToLatestRequest <= consumedScrollToLatestRequestRef.current) return;
    consumedScrollToLatestRequestRef.current = scrollToLatestRequest;
    scrollToLatest("auto");
  }, [scrollToLatestRequest, scrollToLatest]);

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

  const handleForwardSelected = useCallback((singleMessage, options = {}) => {
    if (singleMessage) {
      setForwardTarget({ message: singleMessage, attachmentFileIds: options.attachmentFileIds });
    } else if (selectedMessageIds.size > 1) {
      const selectedMessages = messages
        .filter(m => selectedMessageIds.has(m._id))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      setForwardTarget({ messages: selectedMessages });
    } else {
      const selectedMessages = messages.filter(m => selectedMessageIds.has(m._id));
      if (selectedMessages.length === 1) {
        setForwardTarget({ message: selectedMessages[0] });
      }
    }
  }, [selectedMessageIds, messages]);

  // Reset selection and channel-specific refs when channel changes
  useLayoutEffect(() => {
    firstItemIndexTrackerRef.current = null;
    lastScrolledHighlightId.current = null;
    lastScrolledEditingId.current = null;
    clearSelection();
  }, [channelId, clearSelection]);

  // ─── Maintain scroll position across prepends and content updates ────
  const currentFirstMessageId = messages[0]?._id;
  const currentMessageCount = messages.length;
  const prevMetricsRef = useRef({
    firstMessageId: currentFirstMessageId,
    messageCount: currentMessageCount,
  });

  useLayoutEffect(() => {
    const prev = prevMetricsRef.current;
    const isPrepended = Boolean(
      prev.firstMessageId &&
      currentFirstMessageId &&
      prev.firstMessageId !== currentFirstMessageId &&
      currentMessageCount > prev.messageCount
    );

    handleLayoutUpdate({ isPrepended });

    prevMetricsRef.current = {
      firstMessageId: currentFirstMessageId,
      messageCount: currentMessageCount,
    };
  }, [messages, currentFirstMessageId, currentMessageCount, handleLayoutUpdate]);

  // ─── Flatten: date separators + unread marker ─────────────────────────
  const isActivityMessage = (msg) =>
    (!msg.isDeleted || !!msg.activityMeta || msg.contentType === "system" || msg.contentType === "activity" || msg.contentType === "bot") && (
      msg.contentType === "activity" ||
      msg.contentType === "system" ||
      msg.contentType === "bot" ||
      !!msg.activityMeta
    );

  const huddleTimeline = useMemo(() => getHuddleTimeline(messages, unreadBoundary), [messages, unreadBoundary]);
  const flattenedItems = useMemo(() => {
    const { messages: huddleMessages, unreadBoundary: markerBoundary } = huddleTimeline;
    const flattened = [];
    let currentDate = null;
    let insertedUnreadMarker = false;

    const lastReadIndex = markerBoundary
      ? huddleMessages.findIndex((m) => m._id === markerBoundary)
      : -1;

    if (markerBoundary && huddleMessages.length > 0 && lastReadIndex === -1) {
      flattened.push({ isUnreadSeparator: true, _id: "unread-separator" });
      insertedUnreadMarker = true;
    }

    for (let i = 0; i < huddleMessages.length; i++) {
      const msg = huddleMessages[i];
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
        markerBoundary &&
        i > 0 &&
        huddleMessages[i - 1]._id === markerBoundary &&
        msg._id !== markerBoundary
      ) {
        flattened.push({ isUnreadSeparator: true, _id: "unread-separator" });
        insertedUnreadMarker = true;
        separatorJustInserted = true;
      }

      const prevMsg = i > 0 && !separatorJustInserted ? huddleMessages[i - 1] : null;
      const nextMsgRaw = i < huddleMessages.length - 1 ? huddleMessages[i + 1] : null;
      const nextWillHaveSeparator =
        nextMsgRaw &&
        (formatDateLabel(new Date(nextMsgRaw.createdAt)) !== label ||
          (!insertedUnreadMarker &&
            markerBoundary &&
            msg._id === markerBoundary));
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
  }, [huddleTimeline]);

  const firstMessageId = messages[0]?._id ?? null;
  const virtuosoFirstItemIndex = useMemo(() => {
    const nextTracker = advanceMessageItemIndex(
      firstItemIndexTrackerRef.current,
      channelId,
      flattenedItems,
      firstMessageId,
    );
    firstItemIndexTrackerRef.current = nextTracker;
    return nextTracker.firstItemIndex;
  }, [channelId, firstMessageId, flattenedItems]);

  // ─── Auto-scroll to message when editing begins ─────────────────────────────
  useEffect(() => {
    if (!editingMessageId) {
      lastScrolledEditingId.current = null;
      return;
    }
    if (lastScrolledEditingId.current === editingMessageId || !virtuosoRef.current) return;
    const index = flattenedItems.findIndex((item) => item._id === editingMessageId);
    if (index === -1) return;
    lastScrolledEditingId.current = editingMessageId;

    virtuosoRef.current?.scrollToIndex({
      index,
      align: "center",
      behavior: "smooth",
    });
  }, [editingMessageId, flattenedItems]);

  // ─── Auto-scroll to message from deep-link (DownloadsModal folder navigation) ──
  useEffect(() => {
    const targetId = pendingMessageScroll || scrollToMessageId || highlightMessageId;
    if (!targetId) {
      lastScrolledHighlightId.current = null;
      return;
    }
    const index = flattenedItems.findIndex((item) => item._id === targetId);
    if (index === -1 || !virtuosoRef.current) return;

    if (lastScrolledHighlightId.current !== targetId || scrollToMessageId || pendingMessageScroll) {
      lastScrolledHighlightId.current = targetId;
      virtuosoRef.current.scrollToIndex({ index, align: "center", behavior: "smooth" });
    }
    if (scrollToMessageId) setScrollToMessageId(null);
    if (pendingMessageScroll || scrollToMessageId) setHighlightMessageId(targetId);
    if (pendingMessageScroll) {
      const pathWithoutMessage = location.pathname.split('/message/')[0];
      navigate(pathWithoutMessage, { replace: true });
      setPendingMessageScroll(null);
    }
  }, [pendingMessageScroll, scrollToMessageId, highlightMessageId, flattenedItems,
    setScrollToMessageId, setHighlightMessageId, location.pathname, navigate]);

  useEffect(() => {
    const targetId = scrollToMessageId || pendingMessageScroll;
    if (!targetId || flattenedItems.some((item) => item._id === targetId)) return;
    let cancelled = false;
    const loadTarget = async () => {
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        const currentMessages = useChatStore.getState().messagesByChannel[channelId] || [];
        if (currentMessages.some((message) => message._id === targetId)) return;
        const oldestId = currentMessages[0]?._id;
        if (!oldestId || !useChatStore.getState().hasMore[channelId]) return;
        await fetchMessages(channelId, { cursor: oldestId, limit: 80 });
        if (useChatStore.getState().messagesByChannel[channelId]?.[0]?._id === oldestId) return;
      }
    };
    loadTarget();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToMessageId, pendingMessageScroll, channelId, fetchMessages]);

  useEffect(() => {
    if (!highlightMessageId) return;
    const timeout = setTimeout(() => setHighlightMessageId(null), 4000);
    return () => clearTimeout(timeout);
  }, [highlightMessageId, setHighlightMessageId]);

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
        <EmptyState isActivityTimeline={isActivityTimeline} onLoadEarlier={hasMore ? loadMore : undefined} />
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
        onWheelCapture={handleUserIntent}
        onTouchMoveCapture={handleUserIntent}
        onKeyDownCapture={handleUserIntent}
      >
        <Virtuoso
          key={channelId}
          ref={virtuosoRef}
          scrollerRef={setScroller}
          data={flattenedItems}
          computeItemKey={getVirtuosoMessageKey}
          itemSize={measureMessageItem}
          skipAnimationFrameInResizeObserver
          className="w-full h-full"
          style={{ overflowAnchor: "auto", scrollBehavior: "auto" }}
          firstItemIndex={virtuosoFirstItemIndex}
          initialTopMostItemIndex={flattenedItems.length > 0 ? { index: flattenedItems.length - 1, align: "end" } : undefined}
          startReached={handleStartReached}
          alignToBottom={true}
          increaseViewportBy={{ top: 300, bottom: 150 }}
          followOutput={followOutput}
          atBottomThreshold={AT_BOTTOM_THRESHOLD}
          atBottomStateChange={handleAtBottomStateChange}
          context={{ isLoadingMessages }}
          components={LIST_COMPONENTS}
          itemContent={(index, item) => {
            if (item.isDateSeparator) {
              return (
                <div
                  data-message-id={item._id}
                  data-separator="true"
                  className="animate-fade-in chat-layout-grid"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    paddingTop: 12,
                    paddingBottom: 4,
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
                <div
                  data-message-id={item._id}
                  className="chat-layout-grid"
                  style={{ paddingTop: 2, paddingBottom: 2 }}
                >
                  <AutoActivityMessage message={item} />
                </div>
              );
            }

            if (item.isUnreadSeparator) {
              return (
                <div
                  data-message-id={item._id}
                  data-separator="true"
                  className="animate-fade-in chat-layout-grid"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    paddingTop: 8,
                    paddingBottom: 4,
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
              <div data-message-id={item._id}>
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
                  onForwardMessage={(msg, opts) => handleForwardSelected(msg, opts)}
                  isSelecting={isSelecting}
                  isSelected={selectedMessageIds.has(item._id)}
                  onSelectMessage={toggleSelectMessage}
                />
              </div>
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
        {showScrollBtn && !editingMessageId && (
          <button
            aria-label="Scroll to latest message"
            title="Jump to latest"
            onClick={() => scrollToLatest("smooth")}
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
          attachmentFileIds={forwardTarget.attachmentFileIds || null}
          onClose={() => { setForwardTarget(null); clearSelection(); }}
          onForwardComplete={(destinationId) => {
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
      style={{ display: "flex", gap: 10, paddingTop: 6, paddingBottom: 6 }}
      className="animate-fade-in chat-layout-grid"
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

function EmptyState({ isActivityTimeline, onLoadEarlier }) {
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
          {isActivityTimeline ? "No project activity yet" : "No messages yet"}
        </p>
        {onLoadEarlier ? (
          <button type="button" className="btn btn-ghost mt-2" onClick={onLoadEarlier}>
            Load earlier {isActivityTimeline ? "activity" : "messages"}
          </button>
        ) : !isActivityTimeline && (
          <p style={{ fontSize: 13 }}>Start the conversation by sending a message below.</p>
        )}
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
