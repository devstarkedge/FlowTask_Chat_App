import { messageTimeline, supportsProjectActivity } from "../../../../shared/projectActivity.js";
import HuddlePanel from '../huddles/HuddlePanel';
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useChannelStore } from "../../stores/channelStore";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { useCanvasStore } from "../../stores/canvasStore";
import { shallow } from "zustand/shallow";
import { getSocket, joinChannel, leaveChannel } from "../../services/socket";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import ChatHeader from "./ChatHeader";
import TypingIndicator from "./TypingIndicator";
import FilesTab from "./FilesTab";
import PinnedBar from "./PinnedBar";
import { CHAT_FEATURE_FLAGS } from "../../config/featureFlags";
import CanvasPanel from "../canvas/CanvasPanel";
import { canvasAPI } from "../../services/api";

const EMPTY_LIST = [];

function hasReadReceipt(message, receiptsByMessage, userId) {
  if (!message?._id || !userId) return false;
  const receipts = [
    ...(Array.isArray(message.readBy) ? message.readBy : []),
    ...(Array.isArray(receiptsByMessage?.[String(message._id)]) ? receiptsByMessage[String(message._id)] : []),
  ];
  return receipts.some((receipt) => String(receipt?.userId?._id || receipt?.userId) === String(userId));
}

export default function ChatPanel({
  channelId,
  workspaceId,
  onOpenThread,
  onToggleSearch,
  onTogglePins,
  onOpenProfile,
  onOpenFilePreview,
  onOpenMobileSidebar,
  onSaveMessage,
}) {
  const channel = useChannelStore((s) =>
    s.channels.find((c) => c._id === channelId),
  );
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const currentUserId = useAuthStore((s) => s.user?._id);

  // Split selectors into individual subscriptions to avoid returning a new
  // object snapshot from a single selector (React's useSyncExternalStore
  // warns if getSnapshot does not return cached values). This keeps each
  // subscription focused and stable.
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const fetchPinnedMessages = useChatStore((s) => s.fetchPinnedMessages);
  const legacyMessages = useChatStore((s) => s.messagesByChannel?.[channelId] || EMPTY_LIST);
  const channelMessageIds = useChatStore((s) => s.channelMessageIds?.[channelId] || EMPTY_LIST);
  const messagesById = useChatStore((s) => s.messagesById);
  const editingMessageId = useChatStore((s) => s.editingMessageId);
  const scrollToMessageId = useChatStore((s) => s.scrollToMessageId);
  const readReceipts = useChatStore((s) => s.readReceipts);
  const addMessageReadReceipt = useChatStore((s) => s.addMessageReadReceipt);

  // Canvas store: split selectors for the same reasons as above.
  const activeCanvas = useCanvasStore((s) => s.activeCanvas);
  const activeCanvasIdByChannel = useCanvasStore((s) => s.activeCanvasIdByChannel);
  const clearActiveCanvas = useCanvasStore((s) => s.clearActiveCanvas);
  const setActiveCanvasId = useCanvasStore((s) => s.setActiveCanvasId);
  const loadCanvas = useCanvasStore((s) => s.loadCanvas);
  // Opened canvas tabs are centralized in the canvas store (channel-scoped)
  const openCanvasTabs = useCanvasStore((s) => s.openTabsByChannel?.[channelId] || EMPTY_LIST);
  const addOpenTab = useCanvasStore((s) => s.addOpenTab);
  const removeOpenTab = useCanvasStore((s) => s.removeOpenTab);
  const requestChannelTabs = useCanvasStore((s) => s.requestChannelTabs);

  const prevChannelRef = useRef(null);
  const [activeTab, setActiveTab] = useState("messages");
  // Controls whether the CanvasMenu popup is open in the header tab bar
  const [showCanvasPopup, setShowCanvasPopup] = useState(false);
  // The intent from the header popup: "blank" | "template" | "existing" | null
  // Passed to CanvasPanel so it knows which view to open immediately on mount.
  const [canvasIntent, setCanvasIntent] = useState(null);

  const messages = useMemo(() => {
    if (!CHAT_FEATURE_FLAGS.normalizedMessageStore) return legacyMessages;
    if (!channelMessageIds.length) return EMPTY_LIST;
    return channelMessageIds.map((id) => messagesById[id]).filter(Boolean);
  }, [legacyMessages, channelMessageIds, messagesById]);

  const showProjectActivity = supportsProjectActivity(channel, workspaceId);
  const { activityMessages, conversationMessages } = useMemo(() => {
    if (!showProjectActivity) {
      return { activityMessages: EMPTY_LIST, conversationMessages: messages };
    }
    const tabs = { activity: [], messages: [] };
    for (const message of messages) {
      tabs[messageTimeline(channel, message, workspaceId)].push(message);
    }
    return { activityMessages: tabs.activity, conversationMessages: tabs.messages };
  }, [channel, messages, showProjectActivity, workspaceId]);
  const unreadActivityCount = useMemo(() => {
    if (!showProjectActivity || !currentUserId) return 0;
    return activityMessages.reduce(
      (count, message) => count + (hasReadReceipt(message, readReceipts, currentUserId) ? 0 : 1),
      0,
    );
  }, [activityMessages, currentUserId, readReceipts, showProjectActivity]);

  const isEditingInChannel = useMemo(() => {
    return editingMessageId && messages.some(m => m._id === editingMessageId);
  }, [editingMessageId, messages]);

  const location = useLocation();
  const prevChannelForTabRef = useRef(channelId);

  // Keep socket room membership tied ONLY to channelId.
  // Unrelated dep changes (location.state, fetch fn identity) must not leave/rejoin,
  // or typing indicators and live messages are dropped during the async re-join gap.
  useEffect(() => {
    if (!channelId) return;

    if (prevChannelRef.current && prevChannelRef.current !== channelId) {
      leaveChannel(prevChannelRef.current);
    }
    joinChannel(channelId);
    prevChannelRef.current = channelId;

    return () => {
      leaveChannel(channelId);
    };
  }, [channelId]);

  // When channel changes, reset tab and load messages
  useEffect(() => {
    if (!channelId) return;

    fetchMessages(channelId);
    fetchPinnedMessages(channelId);

    // Check location state for a specific target tab (e.g. from canvas deep link)
    const targetTab = location.state?.targetTab;
    const targetChannelId = location.state?.targetChannelId;

    if (targetTab && (!targetChannelId || targetChannelId === channelId)) {
      setActiveTab(targetTab);
      // Ensure it's added to open tabs if it's a canvas
      const cvsId = targetTab.split(":")[1];
      if (cvsId) {
        addOpenTab(channelId, { _id: cvsId }).catch(() => {});
      }
    } else if (prevChannelForTabRef.current !== channelId) {
      // Only default to messages if we are explicitly switching to a NEW channel
      setActiveTab("messages");
    }
    
    prevChannelForTabRef.current = channelId;
    setShowCanvasPopup(false);
    setCanvasIntent(null);

    // Request the authoritative tab state from server for this channel
    try {
      requestChannelTabs(channelId);
    } catch (err) {
      // ignore
    }
  }, [channelId, fetchMessages, fetchPinnedMessages, requestChannelTabs, location.state, addOpenTab]);

  // Open the right timeline for explicit message links, including targets loaded later.
  const targetMessageId = scrollToMessageId || location.pathname.match(/\/message\/([^/]+)/)?.[1];
  const targetTimeline = targetMessageId && messages.some((message) => message._id === targetMessageId)
    ? activityMessages.some((message) => message._id === targetMessageId) ? "activity" : "messages"
    : null;

  useEffect(() => {
    if (targetTimeline) setActiveTab(targetTimeline);
  }, [targetTimeline]);

  const visibleTab = targetTimeline || (activeTab === "activity" && !showProjectActivity ? "messages" : activeTab);

  // Per-message receipts are separate from channel unread state. Persist
  // receipts for the timeline the user is actually viewing.
  const readReceiptTrackerRef = useRef({ channelId: null, messageIds: new Set() });
  useEffect(() => {
    if (readReceiptTrackerRef.current.channelId !== channelId) {
      readReceiptTrackerRef.current = { channelId, messageIds: new Set() };
    }
    if (
      !channelId ||
      !currentUserId ||
      String(activeChannelId) !== String(channelId) ||
      !["messages", "activity"].includes(visibleTab) ||
      (typeof document !== "undefined" && document.visibilityState === "hidden")
    ) return;

    const socket = getSocket();
    if (!socket) return;
    const markedIds = readReceiptTrackerRef.current.messageIds;
    const visibleMessages = visibleTab === "activity" ? activityMessages : conversationMessages;
    for (const message of visibleMessages) {
      const messageId = message?._id;
      const authorId = message?.authorId?._id || message?.authorId;
      if (!messageId || !authorId || String(authorId) === String(currentUserId) || markedIds.has(String(messageId))) continue;
      if (visibleTab === "activity" && hasReadReceipt(message, readReceipts, currentUserId)) {
        markedIds.add(String(messageId));
        continue;
      }
      socket.emit("message:read", { messageId, channelId });
      markedIds.add(String(messageId));
      if (visibleTab === "activity") {
        addMessageReadReceipt(messageId, currentUserId);
      }
    }
  }, [channelId, activeChannelId, visibleTab, activityMessages, conversationMessages, currentUserId, readReceipts, addMessageReadReceipt]);

  // Note: persistence now handled by server-side channel tabs; client keeps local view in store

  // Derive the active canvas title for the header tab label.
  // Uses activeCanvas first (most up-to-date), falls back to openCanvasTabs
  // for immediate title even when activeCanvas hasn't loaded yet.
  const activeCanvasTitle = useMemo(() => {
    if (!channelId) return null;
    const canvasId = activeCanvasIdByChannel?.[channelId];
    if (!canvasId) return null;
    
    // First, try activeCanvas (most authoritative if it matches)
    if (activeCanvas && activeCanvas._id === canvasId) {
      return activeCanvas.title || "Canvas";
    }
    
    // Fall back to openTabs which has the title from the tab data
    const tabMeta = (openCanvasTabs || []).find((t) => t._id === canvasId);
    if (tabMeta) {
      return tabMeta.title || "Canvas";
    }
    
    return null;
  }, [activeCanvas, activeCanvasIdByChannel, channelId, openCanvasTabs]);

  // Remove canvas tab (delegates to canvas store which will broadcast)
  // Smart removal: switches to adjacent canvas tab if available, otherwise messages
  const handleRemoveCanvasTab = useCallback(
    (canvasId) => {
      // Find adjacent tab before removal
      const tabs = openCanvasTabs || [];
      const removedIdx = tabs.findIndex((t) => t._id === canvasId);

      if (canvasId) {
        try {
          removeOpenTab(channelId, canvasId);
        } catch (err) {
          // ignore
        }
      }

      // Switch to adjacent canvas tab if available
      const remaining = tabs.filter((t) => t._id !== canvasId);
      if (remaining.length > 0 && removedIdx >= 0) {
        const nextIdx = Math.min(removedIdx, remaining.length - 1);
        const nextCanvasId = remaining[nextIdx]._id;
        // Optimistically update activeCanvasId so header shows correct title immediately
        setActiveCanvasId(channelId, nextCanvasId);
        setActiveTab(`canvas:${nextCanvasId}`);
      } else {
        clearActiveCanvas();
        setActiveTab("messages");
      }
      setCanvasIntent(null);
    },
    [removeOpenTab, channelId, openCanvasTabs, clearActiveCanvas, setActiveTab, setCanvasIntent, setActiveCanvasId],
  );

  // Called when user picks an option from the CanvasMenu header popup.
  // We store the intent and switch to the canvas tab.
  // CanvasPanel reads the intent on mount and enters the right flow.
  const handleCanvasSelect = useCallback(
    (type) => {
      setShowCanvasPopup(false);
      setCanvasIntent(type); // "blank" | "template" | "existing"
      setActiveTab("canvas");
    },
    [setCanvasIntent, setActiveTab],
  );

  const isDMChannel = channel?.type === "dm";

  // Stable handlers for header interactions to avoid recreating inline funcs
  const handleTabChange = useCallback(
    (tab) => {
      // Avoid re-processing the same tab value to prevent duplicate side-effects
      // (e.g., double load or duplicate provider initialization).
      if (tab === visibleTab || (tab === "activity" && !showProjectActivity)) return;
      setActiveTab(tab);
      
      // If switching to a canvas tab, optimistically set the active canvas ID
      // so the header title updates immediately (before canvas data loads).
      if (tab && String(tab).startsWith("canvas:")) {
        const canvasId = String(tab).split(":")[1];
        if (canvasId && channelId) {
          setActiveCanvasId(channelId, canvasId);
        }
      } else {
        // If user manually clicked messages (not a canvas:<id>), clear any intent
        setCanvasIntent(null);
      }
    },
    [visibleTab, showProjectActivity, setCanvasIntent, setActiveCanvasId, channelId],
  );

  const handleOpenCanvasMenu = useCallback(() => setShowCanvasPopup(true), []);
  const handleCloseCanvasMenu = useCallback(() => setShowCanvasPopup(false), []);
  const handleOpenAddCanvasModal = handleOpenCanvasMenu;
  const handleRemoveCanvasTabById = useCallback(
    (id) => handleRemoveCanvasTab(id),
    [handleRemoveCanvasTab],
  );

  const isCanvasTabOpen = useCallback(
    (id) => (openCanvasTabs || []).some((c) => c._id === id),
    [openCanvasTabs],
  );

  const handleAddCanvasCreated = useCallback(
    async (canvasOrId) => {
      if (!canvasOrId) return;
      const meta = canvasOrId && canvasOrId._id ? canvasOrId : null;
      if (meta) {
        try {
          await addOpenTab(channelId, meta);
        } catch (err) {
          // ignore
        }
        setActiveTab(`canvas:${meta._id}`);
        return;
      }
      const id = typeof canvasOrId === "string" ? canvasOrId : canvasOrId?._id;
      if (id) setActiveTab(`canvas:${id}`);
    },
    [addOpenTab, channelId, setActiveTab],
  );

  // NOTE: tabs are now only created explicitly via creation/open flows.
  // Removed automatic tab creation when navigating to `canvas:<id>` so
  // tabs aren't implicitly generated from navigation or channel metadata.

  return (
    <div className="flex-1 flex flex-col min-w-0 chat-panel-shell relative">
      <ChatHeader
        channel={channel}
        onToggleSearch={onToggleSearch}
        onTogglePins={onTogglePins}
        onOpenMobileSidebar={onOpenMobileSidebar}
        activeTab={visibleTab}
        showProjectActivity={showProjectActivity}
        unreadActivityCount={unreadActivityCount}
        onTabChange={handleTabChange}
        // Canvas-specific props
        showCanvasPopup={showCanvasPopup}
        onOpenCanvasMenu={handleOpenCanvasMenu}
        onCloseCanvasMenu={handleCloseCanvasMenu}
        onCanvasSelect={handleCanvasSelect}
        activeCanvasTitle={activeCanvasTitle}
        onRemoveCanvasTab={handleRemoveCanvasTab}
        // Multi-tab props
        openCanvasTabs={openCanvasTabs}
        onOpenAddCanvasModal={handleOpenAddCanvasModal}
        onRemoveCanvasTabById={handleRemoveCanvasTabById}
      />

      <HuddlePanel channelId={channelId} />

      {/* ── Tab Content ── */}
      {String(visibleTab).startsWith("canvas:") ? (
        <CanvasPanel
          channelId={channelId}
          workspaceId={workspaceId}
          // load a specific canvas by id when activeTab is canvas:<id>
          canvasId={String(visibleTab).split(":")[1]}
          intent={canvasIntent}
          onIntentConsumed={() => setCanvasIntent(null)}
          onCreated={handleAddCanvasCreated}
        />
      ) : visibleTab === "canvas" ? (
        <CanvasPanel
          channelId={channelId}
          workspaceId={workspaceId}
          intent={canvasIntent}
          onIntentConsumed={() => setCanvasIntent(null)}
          onCreated={handleAddCanvasCreated}
        />
      ) : visibleTab === "files" ? (
        <FilesTab channelId={channelId} onOpenFilePreview={onOpenFilePreview} />
      ) : visibleTab === "activity" ? (
        <MessageList
          messages={activityMessages}
          isActivityTimeline
          channelId={channelId}
          onOpenThread={onOpenThread}
          onOpenProfile={onOpenProfile}
          onOpenFilePreview={onOpenFilePreview}
          isDMChannel={isDMChannel}
          onSaveMessage={onSaveMessage}
        />
      ) : (
        <>
          <PinnedBar channelId={channelId} />
          <MessageList
            messages={conversationMessages}
            channelId={channelId}
            onOpenThread={onOpenThread}
            onOpenProfile={onOpenProfile}
            onOpenFilePreview={onOpenFilePreview}
            isDMChannel={isDMChannel}
            onSaveMessage={onSaveMessage}
          />
          <TypingIndicator channelId={channelId} />
          <div style={{ flexShrink: 0 }}>
            <MessageInput key={channelId} channelId={channelId} />
          </div>
        </>
      )}
    </div>
  );
}
