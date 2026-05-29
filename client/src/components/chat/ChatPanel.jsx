import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useChannelStore } from "../../stores/channelStore";
import { useChatStore } from "../../stores/chatStore";
import { useCanvasStore } from "../../stores/canvasStore";
import { shallow } from "zustand/shallow";
import { joinChannel, leaveChannel } from "../../services/socket";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import ChatHeader from "./ChatHeader";
import TypingIndicator from "./TypingIndicator";
import FilesTab from "./FilesTab";
import PinnedBar from "./PinnedBar";
import { WifiOff, Loader2 } from "lucide-react";
import { CHAT_FEATURE_FLAGS } from "../../config/featureFlags";
import CanvasPanel from "../canvas/CanvasPanel";
import { canvasAPI } from "../../services/api";

const EMPTY_LIST = [];

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

  // Split selectors into individual subscriptions to avoid returning a new
  // object snapshot from a single selector (React's useSyncExternalStore
  // warns if getSnapshot does not return cached values). This keeps each
  // subscription focused and stable.
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const fetchPinnedMessages = useChatStore((s) => s.fetchPinnedMessages);
  const legacyMessages = useChatStore((s) => s.messagesByChannel[channelId] || EMPTY_LIST);
  const channelMessageIds = useChatStore((s) => s.channelMessageIds[channelId] || EMPTY_LIST);
  const messagesById = useChatStore((s) => s.messagesById);
  const connectionStatus = useChatStore((s) => s.connectionStatus);

  // Canvas store: split selectors for the same reasons as above.
  const activeCanvas = useCanvasStore((s) => s.activeCanvas);
  const activeCanvasIdByChannel = useCanvasStore((s) => s.activeCanvasIdByChannel);
  const clearActiveCanvas = useCanvasStore((s) => s.clearActiveCanvas);
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

  // When channel changes, reset tab, join room and request server tabs
  useEffect(() => {
    if (!channelId) return;

    if (prevChannelRef.current && prevChannelRef.current !== channelId) {
      leaveChannel(prevChannelRef.current);
    }
    joinChannel(channelId);
    prevChannelRef.current = channelId;

    fetchMessages(channelId);
    fetchPinnedMessages(channelId);
    // Reset to messages tab and close any open popup
    setActiveTab("messages");
    setShowCanvasPopup(false);
    setCanvasIntent(null);

    // Request the authoritative tab state from server for this channel
    try {
      requestChannelTabs(channelId);
    } catch (err) {
      // ignore
    }

    return () => {
      leaveChannel(channelId);
    };
  }, [channelId, fetchMessages, fetchPinnedMessages, requestChannelTabs]);

  // Note: persistence now handled by server-side channel tabs; client keeps local view in store

  // Derive the active canvas title for the header tab label
  const activeCanvasTitle = useMemo(() => {
    if (!channelId) return null;
    const canvasId = activeCanvasIdByChannel?.[channelId];
    if (!canvasId) return null;
    if (activeCanvas && activeCanvas._id === canvasId) {
      return activeCanvas.title || "Canvas";
    }
    return null;
  }, [activeCanvas, activeCanvasIdByChannel, channelId]);

  // Remove canvas tab (delegates to canvas store which will broadcast)
  const handleRemoveCanvasTab = useCallback(
    (canvasId) => {
      if (canvasId) {
        try {
          removeOpenTab(channelId, canvasId);
        } catch (err) {
          // ignore
        }
      }
      clearActiveCanvas();
      setActiveTab("messages");
      setCanvasIntent(null);
    },
    [removeOpenTab, channelId, clearActiveCanvas, setActiveTab, setCanvasIntent],
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
      if (tab === activeTab) return;
      setActiveTab(tab);
      // If user manually clicked messages (not a canvas:<id>), clear any intent
      if (!tab || !String(tab).startsWith("canvas:")) setCanvasIntent(null);
    },
    [activeTab, setActiveTab, setCanvasIntent],
  );

  const handleOpenCanvasMenu = useCallback(() => setShowCanvasPopup(true), []);
  const handleCloseCanvasMenu = useCallback(() => setShowCanvasPopup(false), []);
  const handleOpenAddCanvasModal = handleOpenCanvasMenu;
  const handleRemoveCanvasTabById = useCallback(
    (id) => removeOpenTab(channelId, id),
    [removeOpenTab, channelId],
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
        activeTab={activeTab}
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

      {/* Connection status banners */}
      {connectionStatus === "connecting" && (
        <div
          className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium animate-fade-in"
          style={{ background: "var(--warning-color)", color: "var(--text-inverse)" }}
        >
          <Loader2 size={12} className="animate-spin" />
          Reconnecting…
        </div>
      )}
      {connectionStatus === "disconnected" && (
        <div
          className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium animate-fade-in"
          style={{ background: "var(--danger-color)", color: "#ffffff" }}
        >
          <WifiOff size={12} />
          Connection lost. Trying to reconnect…
        </div>
      )}

      {/* ── Tab Content ── */}
      {String(activeTab).startsWith("canvas:") ? (
        <CanvasPanel
          channelId={channelId}
          workspaceId={workspaceId}
          // load a specific canvas by id when activeTab is canvas:<id>
          canvasId={String(activeTab).split(":")[1]}
          intent={canvasIntent}
          onIntentConsumed={() => setCanvasIntent(null)}
          onCreated={handleAddCanvasCreated}
        />
      ) : activeTab === "canvas" ? (
        <CanvasPanel
          channelId={channelId}
          workspaceId={workspaceId}
          intent={canvasIntent}
          onIntentConsumed={() => setCanvasIntent(null)}
          onCreated={handleAddCanvasCreated}
        />
      ) : activeTab === "files" ? (
        <FilesTab channelId={channelId} onOpenFilePreview={onOpenFilePreview} />
      ) : (
        <>
          <PinnedBar channelId={channelId} />
          <MessageList
            messages={messages}
            channelId={channelId}
            onOpenThread={onOpenThread}
            onOpenProfile={onOpenProfile}
            onOpenFilePreview={onOpenFilePreview}
            isDMChannel={isDMChannel}
            onSaveMessage={onSaveMessage}
          />
          <TypingIndicator channelId={channelId} />
          <MessageInput channelId={channelId} />
        </>
      )}
    </div>
  );
}