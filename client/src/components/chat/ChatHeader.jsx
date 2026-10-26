import { useHuddleUiStore } from '../../stores/huddleUiStore';
import HuddleHeaderMenu from '../huddles/HuddleHeaderMenu';
import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { isChatAppChannel } from "../../utils/channelOrigin";
import { MessageCircle, Search, Menu, Pin, FileText, Star, Headphones, Info, MoreVertical, BookCopy, Check, X, Plus, Trash2 } from "lucide-react";
import ChannelMemberCount from "./ChannelMemberCount";
import { useChannelStore } from "../../stores/channelStore";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { useCanvasStore } from "../../stores/canvasStore";
import { useFavoritesStore } from "../../stores/favoritesStore";
import logger from "../../utils/logger";
import CanvasTabContextMenu from "../canvas/CanvasTabContextMenu";
import CanvasMenu from "../canvas/CanvasMenu";

const EMPTY_PINS = [];

const BASE_TABS = [
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "files", label: "Files", icon: FileText },
];

export default function ChatHeader({
  channel: channelProp,
  onToggleSearch,
  onOpenMobileSidebar,
  onTogglePins,
  activeTab = "messages",
  onTabChange,
  // Multi-tab canvas props
  openCanvasTabs = [],
  onOpenAddCanvasModal,
  onRemoveCanvasTabById,
  // ─── Canvas props ───────────────────────────────────────────────────────────
  // showCanvasPopup: boolean – whether the CanvasMenu dropdown is open
  showCanvasPopup,
  // onOpenCanvasMenu: () => void – called when user clicks the canvas tab button
  onOpenCanvasMenu,
  // onCloseCanvasMenu: () => void – called to close the popup (outside click, etc.)
  onCloseCanvasMenu,
  // onCanvasSelect: (type: "blank"|"template"|"existing") => void
  onCanvasSelect,
  // activeCanvasTitle: string | null – if set, tab label changes to this title
  activeCanvasTitle,
  // onRemoveCanvasTab: () => void
  onRemoveCanvasTab,
}) {
  const { membersByChannel, toggleInfoPanel, showInfoPanel, deleteChannel } = useChannelStore();
  const navigate = useNavigate();
  const { confirm } = useDeleteConfirm();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  // Always read the latest channel from the store so privacy/name/topic changes
  // reflect instantly in the header without waiting for parent re-render.
  const channel = useChannelStore((s) =>
    s.channels.find((c) => c._id === channelProp?._id) || channelProp
  );
  const { user } = useAuthStore();
  const { workspaceId } = useParams();
  const { isFavorited, toggleFavorite } = useFavoritesStore();
  const activeThread = useChatStore((s) => s.activeThread);
  const pinnedMessages =
    useChatStore((s) => s.pinnedMessagesByChannel[channel?._id]) ?? EMPTY_PINS;
  const updateCanvasMetadata = useCanvasStore((s) => s.updateCanvasMetadata);
  const activeCanvas = useCanvasStore((s) => s.activeCanvas);

  const [showMoreActions, setShowMoreActions] = useState(false);
  const [narrowTabs, setNarrowTabs] = useState(false);
  const [compactTabs, setCompactTabs] = useState(false);

  const channelId = channel?._id?.toString?.();
  const isStarred = channelId
    ? isFavorited("channel", channelId) || isFavorited("private_channel", channelId) || isFavorited("project", channelId)
    : false;

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null); // { x, y }

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renamingCanvasId, setRenamingCanvasId] = useState(null); // which canvas tab is being renamed
  const renameInputRef = useRef(null);

  const moreMenuRef = useRef(null);
  const headerRef = useRef(null);
  const tabsMeasureRef = useRef(null);
  // Ref for the canvas popup container (used for outside-click detection)
  const canvasPopupRef = useRef(null);
  // Ref for the canvas tab button (so we don't close immediately on the open click)
  const canvasTabRef = useRef(null);

  const isCustom = isChatAppChannel(channel);
  const isWsAdmin = ['owner', 'admin'].includes(activeWorkspace?.role);
  const isChannelOwner = channel?.createdBy === user?._id || channel?.isOwner?.(user?._id);
  const canDeleteChannel = isCustom && (isChannelOwner || isWsAdmin);

  const askDelete = async () => {
    const ok = await confirm({
      title: 'Delete channel',
      message: `Are you sure you want to delete #${channel?.name}? The channel and all its membership associations will be permanently removed. This action cannot be undone.`,
      confirmLabel: 'Delete Channel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteChannel(channel._id);
      navigate(`/workspace/${workspaceId}`);
    } catch (err) {
      console.error(err);
    }
  };

  const isConstrained = showInfoPanel || !!activeThread;

  const displayChannelName = useMemo(() => {
    if (!channel) return "";
    if (channel.type !== "dm") return channel.name || channel.slug;

    if (channel.dmRecipientId) return channel.name;
    let name = channel.name || channel.slug;
    if (channel.dmParticipantNames && Array.isArray(channel.dmParticipantNames)) {
      const otherNames = channel.dmParticipantNames.filter((n) => n !== user?.name);
      if (otherNames.length > 0) name = otherNames.join(", ");
    } else if (name && name.includes(",")) {
      const names = name.split(",").map((n) => n.trim());
      const otherNames = names.filter((n) => n !== user?.name);
      if (otherNames.length > 0) name = otherNames.join(", ");
    }
    return name;
  }, [channel, user]);

  // Build dynamic tabs. If `openCanvasTabs` is provided, render each opened
  // canvas as its own tab and keep a persistent "+" add button at the end.
  const HEADER_TABS = useMemo(() => {
    if (openCanvasTabs && openCanvasTabs.length > 0) {
      const canvasTabs = openCanvasTabs.map((c) => ({
        id: `canvas:${c._id}`,
        label: c.title || "Untitled canvas",
        icon: BookCopy,
        isCanvas: true,
        isDynamic: true,
        canvasMeta: c,
      }));

      const addTab = { id: "canvas:add", label: "Add Canvas", icon: Plus, isCanvas: true, isAdd: true };
      return [...BASE_TABS, ...canvasTabs, addTab];
    }

    const canvasTab = activeCanvasTitle
      ? {
          id: "canvas",
          label: activeCanvasTitle,
          icon: BookCopy,
          isCanvas: true,
          isDynamic: true,
        }
      : {
          id: "canvas",
          label: "Add Canvas",
          icon: BookCopy,
          isCanvas: true,
          isDynamic: false,
        };

    return [...BASE_TABS, canvasTab];
  }, [activeCanvasTitle, openCanvasTabs]);

  // Collapse tabs when header is narrow
  useEffect(() => {
    if (!headerRef.current) return;
    const measure = () => {
      const width = headerRef.current?.getBoundingClientRect().width || 0;
      const required = tabsMeasureRef.current?.getBoundingClientRect().width || 0;
      setNarrowTabs(width < 480 || required > width - 16);
      setCompactTabs(width < 480);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(headerRef.current);
    if (tabsMeasureRef.current) ro.observe(tabsMeasureRef.current);
    measure();
    return () => ro.disconnect();
  }, [HEADER_TABS]);

  // Close action dropdown on outside click
  useEffect(() => {
    if (!showMoreActions) return;
    const fn = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target))
        setShowMoreActions(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [showMoreActions]);


  // Close canvas popup on outside click.
  // We use mousedown so it fires before any click handlers and we can check
  // whether the click was inside the popup or the trigger button.
  useEffect(() => {
    if (!showCanvasPopup) return;
    const fn = (e) => {
      const insidePopup =
        canvasPopupRef.current && canvasPopupRef.current.contains(e.target);
      const insideTrigger =
        canvasTabRef.current && canvasTabRef.current.contains(e.target);
      if (!insidePopup && !insideTrigger) {
        onCloseCanvasMenu?.();
      }
    };
    // Use a small delay so the open-click doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", fn);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", fn);
    };
  }, [showCanvasPopup, onCloseCanvasMenu]);

  

  // Focus rename input when rename starts
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  if (!channel) return null;

  const isPrivate =
    channel.visibility?.toLowerCase() === "private" ||
    (channel.visibility !== "public" && channel.type?.toLowerCase() === "private") ||
    channel.isPrivate;

  const members = membersByChannel[channel._id] || [];
  const memberCount = channel.memberCount ?? members.length;
  const pinCount = pinnedMessages.length;


  const hPad = 8;

  const handleCanvasTabRightClick = (canvasId) => (e) => {
    e.preventDefault();
    if (!canvasId) return;
    setContextMenu({ x: e.clientX, y: e.clientY, canvasId });
  };

  const handleContextRename = () => {
    const cid = contextMenu?.canvasId;
    if (!cid) return;
    // If the canvas is already active, start rename immediately.
    if (cid === activeCanvas?._id) {
      startRename(cid);
    } else {
      // Switch to the canvas tab, then start rename after a short delay.
      onTabChange?.(`canvas:${cid}`);
      setTimeout(() => startRename(cid), 160);
    }
    setContextMenu(null);
  };

  const handleRenameSubmit = async () => {
    const trimmed = renameValue.trim();
    if (trimmed && renamingCanvasId) {
      // Find the current title of the canvas being renamed
      const targetTab = openCanvasTabs?.find((t) => t._id === renamingCanvasId);
      const currentTitle = targetTab?.title || activeCanvas?.title || "";
      if (trimmed !== currentTitle) {
        try {
          await updateCanvasMetadata(renamingCanvasId, { title: trimmed });
        } catch (err) {
          console.error(err);
        }
      }
    }
    setIsRenaming(false);
    setRenamingCanvasId(null);
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === "Enter") handleRenameSubmit();
    if (e.key === "Escape") { setIsRenaming(false); setRenamingCanvasId(null); }
  };

  const startRename = (canvasId) => {
    // Find the tab being renamed to get its current title
    const targetTab = openCanvasTabs?.find((t) => t._id === canvasId);
    setRenameValue(targetTab?.title || activeCanvas?.title || "");
    setRenamingCanvasId(canvasId || activeCanvas?._id || null);
    setIsRenaming(true);
  };

  // ── Canvas tab click handler ─────────────────────────────────────────────────
  const handleCanvasTabClick = (tab) => {
    logger.debug('[ChatHeader] canvas tab clicked', { tabId: tab?.id, isAdd: tab?.isAdd, isDynamic: tab?.isDynamic });
    if (tab.isAdd) {
      onOpenAddCanvasModal?.();
      return;
    }

    if (tab.isDynamic && tab.id && String(tab.id).startsWith("canvas:")) {
      onTabChange?.(tab.id);
      return;
    }

    // Fallback to previous single-canvas behavior
    if (tab.isCanvas && !tab.isDynamic) {
      onTabChange?.("canvas");
      if (showCanvasPopup) onCloseCanvasMenu?.();
      else onOpenCanvasMenu?.();
    } else if (tab.id) {
      onTabChange?.(tab.id);
    }
  };

  return (
    <div
      ref={headerRef}
      className="shrink-0 select-none chat-header"
      style={{ position: "sticky", top: 0, zIndex: 20, minWidth: 0, maxWidth: '100%' }}
    >
      {/* ── Top Row ── */}
      <div
        className="flex items-center"
        style={{ padding: `8px ${hPad}px 4px`, gap: 3, minHeight: 48 }}
      >
        {/* Mobile sidebar toggle */}
        <HdrBtn
          icon={Menu}
          title="Open sidebar"
          onClick={onOpenMobileSidebar}
          className="mobile-menu-btn"
          size={18}
        />

        {/* Channel name */}
        <button
          className="chat-header__channel-trigger flex items-center gap-1.5 min-w-0 flex-1 text-left rounded-lg group"
          style={{ padding: "3px 6px", background: "transparent", border: "none", cursor: "pointer" }}
          onClick={toggleInfoPanel}
          title={channel.name || channel.slug}
        >
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              if (!channelId || !workspaceId) return;
              const targetType =
                channel.visibility === "private" || channel.type === "private"
                  ? "private_channel"
                  : channel.type === "project"
                    ? "project"
                    : "channel";
              toggleFavorite(targetType, channelId);
            }}
            className={`chat-header__star shrink-0${isStarred ? " is-active" : ""}`}
            title={isStarred ? "Unstar" : "Star channel"}
          >
            <Star size={14} fill={isStarred ? "currentColor" : "none"} />
          </span>

          <h2
            className="font-bold truncate group-hover:underline"
            style={{ fontSize: 17, color: "var(--text-primary)", lineHeight: 1.3, minWidth: 0 }}
          >
            {displayChannelName}
          </h2>
{/* 
          {isPrivate && (
            <Lock size={10} className="shrink-0" style={{ color: "var(--text-muted)" }} />
          )} */}
        </button>

        {/* Right actions */}
        <div
          className="flex items-center flex-shrink-0"
          ref={moreMenuRef}
          style={{ gap: 2, position: "relative" }}
        >
          {!isConstrained && channel?.type !== "dm" && (
            <ChannelMemberCount
              count={memberCount}
              onClick={(e) => {
                e.stopPropagation();
                toggleInfoPanel();
              }}
              className="hide-mobile"
            />
          )}

          <HuddleHeaderMenu channelId={channelId} label={displayChannelName} workspaceId={workspaceId} />

          <HdrBtn
            icon={MoreVertical}
            title="More options"
            onClick={() => setShowMoreActions((v) => !v)}
            className={showMoreActions ? "is-active" : ""}
            size={14}
          />

        {showMoreActions && (
          <div
            className="chat-header__menu absolute z-50 animate-fade-in-up"
            style={{
              top: "calc(100% + 8px)",
              right: 0,
              width: 256,
              padding: 6,
              borderRadius: 14,
              background: "var(--bg-primary, #ffffff)",
              border: "1px solid var(--border-primary, rgba(0,0,0,0.08))",
              boxShadow: "0 16px 36px -8px rgba(0,0,0,0.18), 0 6px 16px -4px rgba(0,0,0,0.08)",
              backdropFilter: "blur(12px)",
              overflow: "hidden",
            }}
          >
            {/* ── Conversation section ── */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", padding: "6px 10px 4px" }}>
                Conversation
              </p>
              <DropItem icon={Search}   iconColor="purple" label="Search messages"   onClick={() => { onToggleSearch(); setShowMoreActions(false); }} />
              <DropItem icon={Pin}      iconColor="amber"  label="Pinned messages"   sublabel={pinCount > 0 ? `${pinCount} pinned` : undefined} onClick={() => { onTogglePins(); setShowMoreActions(false); }} />
              <DropItem icon={Headphones} iconColor="teal" label="Start a huddle"    onClick={() => { useHuddleUiStore.getState().openPanel({channelId,label:displayChannelName,workspaceId}); setShowMoreActions(false); }} className="md:hidden" />
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: "var(--border-primary, rgba(0,0,0,0.06))", margin: "4px 6px" }} />

            {/* ── Channel section ── */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", padding: "6px 10px 4px" }}>
                Channel
              </p>
              <DropItem icon={Info}        iconColor="blue" label="Channel details"  sublabel="Settings, members & more" onClick={() => { toggleInfoPanel(); setShowMoreActions(false); }} />
              {canDeleteChannel && (
                <DropItem
                  icon={Trash2}
                  iconColor="red"
                  label="Delete channel"
                  sublabel="Remove channel & members"
                  onClick={() => {
                    setShowMoreActions(false);
                    askDelete();
                  }}
                />
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none' }}>
        <div ref={tabsMeasureRef} style={{ display: 'flex', width: 'max-content', gap: 2 }}>
          {HEADER_TABS.map(tab => <span key={tab.id} className="slim-tab" style={{ flexShrink: 0 }}>
            <tab.icon size={13} className="slim-tab__icon shrink-0" />
            <span className="slim-tab__label">{tab.isAdd ? '' : tab.label}</span>
          </span>)}
        </div>
      </div>
      <div style={{ padding: `0 ${hPad}px 8px` }}>
        <div className="flex items-center" style={{ minHeight: 34, gap: 2, minWidth: 0 }}>
          {narrowTabs ? (
            // Keep conversation navigation fixed while canvas tabs scroll.
            <>
              {BASE_TABS.map(tab => <SlimTab key={tab.id} tab={tab} compact={compactTabs} isActive={activeTab === tab.id} onClick={() => onTabChange?.(tab.id)} />)}
              <div aria-label="Canvas tabs" style={{ display: "flex", gap: 2, minWidth: 0, maxWidth: "100%", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "thin" }}>
                {HEADER_TABS.filter(tab => tab.isCanvas && tab.isDynamic).map(tab => <div key={tab.id} style={{ flex: '0 0 auto', maxWidth: 220, minWidth: 0 }}>
                <SlimTab
                  tab={tab}
                  isActive={activeTab === tab.id}
                  onClick={() => handleCanvasTabClick(tab)}
                  onContextMenu={handleCanvasTabRightClick(tab.canvasMeta?._id || String(tab.id).split(":")[1])}
                  isRenaming={isRenaming && renamingCanvasId === (tab.canvasMeta?._id || String(tab.id).split(':')[1])}
                  renameValue={renameValue}
                  renameInputRef={renameInputRef}
                  onRenameChange={(v) => setRenameValue(v)}
                  onRenameSubmit={handleRenameSubmit}
                  onRenameKeyDown={handleRenameKeyDown}
                  onRenameCancel={() => { setIsRenaming(false); setRenamingCanvasId(null); }}
                />
                </div>)}
              </div>
              <div ref={canvasTabRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button className="slim-tab" title="Add canvas" aria-label="Add canvas" onClick={() => onOpenAddCanvasModal?.()}><Plus size={14} /></button>
                {showCanvasPopup && <div ref={canvasPopupRef} style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50 }}>
                  <CanvasMenu onSelect={type => { onCloseCanvasMenu?.(); onCanvasSelect?.(type); }} onDismiss={() => onCloseCanvasMenu?.()} />
                </div>}
              </div>
            </>
          ) : (
            // ── Wide mode: show all tabs ─────────────────────────────────────
            HEADER_TABS.map((tab) => {
              if (tab.isCanvas && tab.isDynamic) {
                const tabCanvasId = tab.canvasMeta?._id || (tab.id && String(tab.id).split(":")[1]);
                const isThisTabRenaming = isRenaming && renamingCanvasId === tabCanvasId;
                return (
                  <SlimTab
                    key={tab.id}
                    tab={tab}
                    isActive={activeTab === tab.id}
                    onClick={() => handleCanvasTabClick(tab)}
                    onContextMenu={handleCanvasTabRightClick(tabCanvasId)}
                    isRenaming={isThisTabRenaming}
                    renameValue={renameValue}
                    renameInputRef={renameInputRef}
                    onRenameChange={(v) => setRenameValue(v)}
                    onRenameSubmit={handleRenameSubmit}
                    onRenameKeyDown={handleRenameKeyDown}
                    onRenameCancel={() => { setIsRenaming(false); setRenamingCanvasId(null); }}
                  />
                );
              }

              if (tab.isCanvas && tab.isAdd) {
                return (
                  <div key={tab.id} style={{ position: "relative" }} ref={canvasTabRef}>
                    <SlimTab
                      tab={{ id: tab.id, icon: Plus }}
                      isActive={false}
                      onClick={() => handleCanvasTabClick(tab)}
                    />

                    {showCanvasPopup && (
                      <div
                        ref={canvasPopupRef}
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          zIndex: 50,
                        }}
                      >
                        <CanvasMenu
                          onSelect={(type) => {
                            onCloseCanvasMenu?.();
                            onCanvasSelect?.(type);
                          }}
                          onDismiss={() => onCloseCanvasMenu?.()}
                        />
                      </div>
                    )}
                  </div>
                );
              }

              if (tab.isCanvas && !tab.isDynamic) {
                // Legacy single "canvas" tab behavior
                return (
                  <div key={tab.id} style={{ position: "relative" }} ref={canvasTabRef}>
                    <SlimTab
                      tab={tab}
                      isActive={activeTab === "canvas" && !!activeCanvasTitle}
                      onClick={() => handleCanvasTabClick(tab)}
                      onContextMenu={tab.isDynamic ? handleCanvasTabRightClick : undefined}
                      isRenaming={isRenaming && tab.isDynamic}
                      renameValue={renameValue}
                      renameInputRef={renameInputRef}
                      onRenameChange={(v) => setRenameValue(v)}
                      onRenameSubmit={handleRenameSubmit}
                      onRenameKeyDown={handleRenameKeyDown}
                      onRenameCancel={() => setIsRenaming(false)}
                    />

                    {showCanvasPopup && (
                      <div
                        ref={canvasPopupRef}
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          zIndex: 50,
                        }}
                      >
                        <CanvasMenu
                          onSelect={(type) => {
                            onCloseCanvasMenu?.();
                            onCanvasSelect?.(type);
                          }}
                          onDismiss={() => onCloseCanvasMenu?.()}
                        />
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <SlimTab
                  key={tab.id}
                  tab={tab}
                  isActive={activeTab === tab.id}
                  onClick={() => onTabChange?.(tab.id)}
                />
              );
            })
          )}
        </div>
      </div>

      {/* ── Canvas Right-Click Context Menu ── */}
      {contextMenu?.canvasId && (
        <CanvasTabContextMenu
          canvasId={contextMenu.canvasId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onRenameTrigger={handleContextRename}
          onRemoveTab={() => {
            // Prefer the explicit remove-by-id handler if provided
            if (typeof onRemoveCanvasTabById === "function") {
              onRemoveCanvasTabById(contextMenu.canvasId);
            } else {
              onRemoveCanvasTab?.();
            }
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
}

/* ── SlimTab ─────────────────────────────────────────────────────────────── */
function SlimTab({
  tab,
  compact = false,
  isActive,
  onClick,
  onContextMenu,
  isRenaming,
  renameValue,
  renameInputRef,
  onRenameChange,
  onRenameSubmit,
  onRenameKeyDown,
  onRenameCancel,
}) {
  const Icon = tab.icon;

  if (isRenaming && tab.isDynamic) {
    return (
      <div
        className="slim-tab slim-tab--active"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 6px", minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}
      >
        <Icon size={13} className="slim-tab__icon shrink-0" />
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={onRenameKeyDown}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 12,
            fontWeight: 600,
            outline: "none",
            width: Math.max(60, renameValue.length * 7),
            maxWidth: 160,
            minWidth: 0,
          }}
        />
        <button
          onClick={onRenameSubmit}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "var(--accent-green)" }}
          title="Save"
        >
          <Check size={12} />
        </button>
        <button
          onClick={onRenameCancel}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "var(--text-muted)" }}
          title="Cancel"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      aria-label={tab.label}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ minWidth: 0, maxWidth: '100%', flexShrink: 1 }}
      className={`slim-tab${isActive ? " slim-tab--active" : ""}`}
      title={tab.isDynamic ? `${tab.label || 'Canvas'} — Right-click for options` : tab.label}
    >
      <Icon size={13} className="slim-tab__icon shrink-0" />
      {!compact && <span className="slim-tab__label" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.label}</span>}
    </button>
  );
}

/* ── HdrBtn ──────────────────────────────────────────────────────────────── */
function HdrBtn({ icon: Icon, title, label, onClick, className = "", size = 14 }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        "chat-header__icon-btn shrink-0 inline-flex items-center justify-center gap-1",
        "rounded-lg cursor-pointer transition-all",
        label ? "h-7 px-2" : "h-7 w-7",
        className,
      ].join(" ")}
    >
      <Icon size={size} />
      {label && (
        <span className="font-bold hide-mobile leading-none" style={{ fontSize: 11 }}>
          {label}
        </span>
      )}
    </button>
  );
}

/* ── DropItem ────────────────────────────────────────────────────────────── */
function DropItem({ icon: Icon, iconColor = "gray", label, sublabel, onClick, className = "" }) {
  const colorMap = {
    purple: { bg: "rgba(147, 51, 234, 0.1)",  color: "var(--accent-purple, #9333ea)" },
    teal:   { bg: "rgba(13, 148, 136, 0.12)", color: "#0d9488" },
    blue:   { bg: "rgba(37, 99, 235, 0.12)",  color: "var(--accent-primary, #2563eb)" },
    amber:  { bg: "rgba(217, 119, 6, 0.12)",  color: "#d97706" },
    red:    { bg: "rgba(225, 29, 72, 0.12)",  color: "#e11d48" },
    gray:   { bg: "var(--bg-hover, rgba(0,0,0,0.05))", color: "var(--text-muted)" },
  };
  const { bg, color } = colorMap[iconColor] ?? colorMap.gray;

  return (
    <button
      onClick={onClick}
      className={["chat-header__menu-item w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-all duration-150 hover:bg-[var(--bg-hover)]", className].join(" ")}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: bg, color, flexShrink: 0 }}>
        <Icon size={16} />
      </span>
      <span className="flex flex-col min-w-0">
        <span className="font-semibold truncate" style={{ fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.2 }}>{label}</span>
        {sublabel && <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.2 }}>{sublabel}</span>}
      </span>
    </button>
  );
}
