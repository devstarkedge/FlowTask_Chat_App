import { useState, useRef, useEffect, useMemo } from "react";
import {
  Lock,
  MessageCircle,
  Search,
  Menu,
  Pin,
  FileText,
  Star,
  Headphones,
  Info,
  MoreVertical,
  ChevronDown,
  BookCopy,
  Check,
  X,
  Plus,
} from "lucide-react";
import ChannelMemberCount from "./ChannelMemberCount";
import { useChannelStore } from "../../stores/channelStore";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { useCanvasStore } from "../../stores/canvasStore";
import logger from "../../utils/logger";
import CanvasTabContextMenu from "../canvas/CanvasTabContextMenu";
import CanvasMenu from "../canvas/CanvasMenu";

const EMPTY_PINS = [];

const BASE_TABS = [
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "files", label: "Files", icon: FileText },
];

export default function ChatHeader({
  channel,
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
  const { membersByChannel, toggleInfoPanel, showInfoPanel } = useChannelStore();
  const { user } = useAuthStore();
  const activeThread = useChatStore((s) => s.activeThread);
  const pinnedMessages =
    useChatStore((s) => s.pinnedMessagesByChannel[channel?._id]) ?? EMPTY_PINS;
  const updateCanvasMetadata = useCanvasStore((s) => s.updateCanvasMetadata);
  const activeCanvas = useCanvasStore((s) => s.activeCanvas);

  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showTabsDropdown, setShowTabsDropdown] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [narrowTabs, setNarrowTabs] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null); // { x, y }

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renamingCanvasId, setRenamingCanvasId] = useState(null); // which canvas tab is being renamed
  const renameInputRef = useRef(null);

  const moreMenuRef = useRef(null);
  const tabsMenuRef = useRef(null);
  const headerRef = useRef(null);
  // Ref for the canvas popup container (used for outside-click detection)
  const canvasPopupRef = useRef(null);
  // Ref for the canvas tab button (so we don't close immediately on the open click)
  const canvasTabRef = useRef(null);

  const isConstrained = showInfoPanel || !!activeThread;

  const displayChannelName = useMemo(() => {
    if (!channel) return "";
    if (channel.type !== "dm") return channel.name || channel.slug;

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
    const ro = new ResizeObserver(([entry]) => {
      setNarrowTabs(entry.contentRect.width < 480);
    });
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

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

  // Close tabs dropdown on outside click
  useEffect(() => {
    if (!showTabsDropdown) return;
    const fn = (e) => {
      if (tabsMenuRef.current && !tabsMenuRef.current.contains(e.target))
        setShowTabsDropdown(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [showTabsDropdown]);

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
    channel.type?.toLowerCase() === "private" ||
    channel.isPrivate;

  const members = membersByChannel[channel._id] || [];
  const memberCount = channel.memberCount ?? members.length;
  const pinCount = pinnedMessages.length;

  const activeTabObj = HEADER_TABS.find((t) => t.id === activeTab) || HEADER_TABS[0];
  const overflowTabs = HEADER_TABS.filter((t) => t.id !== activeTab);

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
      style={{ position: "sticky", top: 0, zIndex: 20 }}
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
              setIsStarred((s) => !s);
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
          {!isConstrained && (
            <ChannelMemberCount
              count={memberCount}
              onClick={(e) => {
                e.stopPropagation();
                toggleInfoPanel();
              }}
              className="hide-mobile"
            />
          )}

          <HdrBtn
            icon={Pin}
            title="Pinned messages"
            label={pinCount > 0 && !isConstrained ? String(pinCount) : undefined}
            onClick={onTogglePins}
            size={14}
          />

          {!isConstrained && (
            <HdrBtn
              icon={Search}
              title="Search messages"
              onClick={onToggleSearch}
              className="hide-mobile"
              size={14}
            />
          )}

          <HdrBtn
            icon={MoreVertical}
            title="More options"
            onClick={() => setShowMoreActions((v) => !v)}
            className={showMoreActions ? "is-active" : ""}
            size={14}
          />

          {showMoreActions && (
            <div
              className="chat-header__menu absolute py-1 z-50 animate-fade-in-up"
              style={{ top: "calc(100% + 6px)", right: 0, minWidth: 196 }}
            >
              {isConstrained && (
                <>
                  <DropItem
                    icon={Search}
                    label="Search Messages"
                    onClick={() => { onToggleSearch(); setShowMoreActions(false); }}
                  />
                  <DropItem
                    icon={Pin}
                    label="Pinned Messages"
                    sublabel={pinCount > 0 ? `${pinCount} pinned` : undefined}
                    onClick={() => { onTogglePins(); setShowMoreActions(false); }}
                  />
                  <DropItem
                    icon={Headphones}
                    label="Huddle"
                    onClick={() => { logger.log("Huddle", channel?._id); setShowMoreActions(false); }}
                    className="md:hidden"
                  />
                  <div style={{ height: 1, background: "var(--border-primary)", margin: "4px 10px" }} />
                </>
              )}
              <DropItem
                icon={Info}
                label="Channel Details"
                onClick={() => { toggleInfoPanel(); setShowMoreActions(false); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ padding: `0 ${hPad}px 8px` }}>
        <div className="flex items-center" style={{ minHeight: 34, gap: 2 }}>
          {narrowTabs ? (
            // ── Narrow mode: show active tab + "More" dropdown ──────────────
            <>
              <SlimTab
                tab={activeTabObj}
                isActive={true}
                onClick={() => {}}
                onContextMenu={activeTabObj.isCanvas && activeTabObj.isDynamic ? handleCanvasTabRightClick(activeTabObj.canvasMeta?._id || String(activeTabObj.id).split(":")[1]) : undefined}
                isRenaming={isRenaming}
                renameValue={renameValue}
                renameInputRef={renameInputRef}
                onRenameChange={(v) => setRenameValue(v)}
                onRenameSubmit={handleRenameSubmit}
                onRenameKeyDown={handleRenameKeyDown}
                onRenameCancel={() => { setIsRenaming(false); setRenamingCanvasId(null); }}
              />
              <div ref={tabsMenuRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setShowTabsDropdown((v) => !v)}
                  className={`slim-tab${showTabsDropdown ? " slim-tab--active" : ""}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <span className="slim-tab__label">More</span>
                  <ChevronDown
                    size={12}
                    style={{
                      transform: showTabsDropdown ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 180ms ease",
                    }}
                  />
                </button>
                {showTabsDropdown && (
                  <div
                    className="chat-header__menu absolute py-1 z-50 animate-fade-in-up"
                    style={{ top: "calc(100% + 4px)", left: 0, minWidth: 160 }}
                  >
                    {overflowTabs.map((tab) => (
                      <DropItem
                        key={tab.id}
                        icon={tab.icon}
                        label={tab.label}
                        onClick={() => {
                          if (tab.id === "canvas") {
                            handleCanvasTabClick(tab);
                          } else {
                            onTabChange?.(tab.id);
                          }
                          setShowTabsDropdown(false);
                        }}
                      />
                    ))}
                  </div>
                )}
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
        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 6px" }}
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
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`slim-tab${isActive ? " slim-tab--active" : ""}`}
      title={tab.isDynamic ? "Right-click for options" : undefined}
    >
      <Icon size={13} className="slim-tab__icon shrink-0" />
      <span className="slim-tab__label">{tab.label}</span>
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
function DropItem({ icon: Icon, label, sublabel, onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={[
        "chat-header__menu-item w-full flex items-center gap-3",
        "px-3 py-2 text-left transition-colors",
        className,
      ].join(" ")}
    >
      <Icon size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
      <span className="flex flex-col min-w-0">
        <span className="font-semibold truncate" style={{ fontSize: 13, color: "var(--text-primary)" }}>
          {label}
        </span>
        {sublabel && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {sublabel}
          </span>
        )}
      </span>
    </button>
  );
}