import { useEffect, useMemo, useRef, useState } from "react";
import { useChannelStore } from "../../stores/channelStore";
import { useChatStore } from "../../stores/chatStore";
import { useCanvasStore } from "../../stores/canvasStore";
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
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const fetchPinnedMessages = useChatStore((s) => s.fetchPinnedMessages);
  const legacyMessages = useChatStore(
    (s) => s.messagesByChannel[channelId] || EMPTY_LIST,
  );
  const channelMessageIds = useChatStore(
    (s) => s.channelMessageIds[channelId] || EMPTY_LIST,
  );
  const messagesById = useChatStore((s) => s.messagesById);
  const connectionStatus = useChatStore((s) => s.connectionStatus);

  const { activeCanvas, activeCanvasIdByChannel, clearActiveCanvas } =
    useCanvasStore();

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

  // When channel changes, reset tab and leave old channel
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

    return () => {
      leaveChannel(channelId);
    };
  }, [channelId, fetchMessages, fetchPinnedMessages]);

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

  // Remove canvas tab
  const handleRemoveCanvasTab = () => {
    clearActiveCanvas();
    setActiveTab("messages");
    setCanvasIntent(null);
  };

  // Called when user picks an option from the CanvasMenu header popup.
  // We store the intent and switch to the canvas tab.
  // CanvasPanel reads the intent on mount and enters the right flow.
  const handleCanvasSelect = (type) => {
    setShowCanvasPopup(false);
    setCanvasIntent(type); // "blank" | "template" | "existing"
    setActiveTab("canvas");
  };

  const isDMChannel = channel?.type === "dm";

  return (
    <div className="flex-1 flex flex-col min-w-0 chat-panel-shell relative">
      <ChatHeader
        channel={channel}
        onToggleSearch={onToggleSearch}
        onTogglePins={onTogglePins}
        onOpenMobileSidebar={onOpenMobileSidebar}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          // If the user manually clicks the canvas tab (not via the popup),
          // don't carry over a stale intent
          if (tab !== "canvas") setCanvasIntent(null);
        }}
        // Canvas-specific props
        showCanvasPopup={showCanvasPopup}
        onOpenCanvasMenu={() => setShowCanvasPopup(true)}
        onCloseCanvasMenu={() => setShowCanvasPopup(false)}
        onCanvasSelect={handleCanvasSelect}
        activeCanvasTitle={activeCanvasTitle}
        onRemoveCanvasTab={handleRemoveCanvasTab}
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
      {activeTab === "canvas" ? (
        <CanvasPanel
          channelId={channelId}
          workspaceId={workspaceId}
          // Tell CanvasPanel which flow to open immediately.
          // After CanvasPanel consumes it, it calls onIntentConsumed so we
          // clear it and don't re-trigger on future re-renders.
          intent={canvasIntent}
          onIntentConsumed={() => setCanvasIntent(null)}
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