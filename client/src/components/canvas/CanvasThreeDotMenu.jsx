import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import {
  Link2,
  Share2,
  Info,
  Bookmark,
  ImageIcon,
  MessageSquare,
  History,
  Printer,
  Accessibility,
  Type,
  Trash2,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { useCanvasStore } from "../../stores/canvasStore";
import { useCanvasUiStore } from "../../stores/canvasUiStore";

const FONT_FAMILIES = [
  { label: "System UI", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { label: "Serif", value: "'Georgia', 'Times New Roman', serif" },
  { label: "Mono", value: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" },
  { label: "Sans", value: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
];

const STORAGE_KEY_FONT = "flowtask.canvas.editorFont";

function loadPersistedFont() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY_FONT);
  } catch {
    return null;
  }
}

function persistFont(fontFamily) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY_FONT, fontFamily);
  } catch {
    // ignore
  }
}

function applyFontToEditor(fontFamily) {
  document.documentElement.style.setProperty("--canvas-editor-font", fontFamily);
  const editorEl = document.querySelector(".ProseMirror");
  if (editorEl) {
    editorEl.style.fontFamily = fontFamily;
  }
}

export default function CanvasThreeDotMenu({
  canvas,
  isOpen,
  onClose,
  onOpenCoverPicker,
  onBack,
  styleOverride,
  onOpenShareModal,
  onCoverReplace,
  onCoverReposition,
  onCoverRemove,
  hasCover,
}) {
  const menuRef = useRef(null);
  const [showCoverSubmenu, setShowCoverSubmenu] = useState(false);
  const [showFontSubmenu, setShowFontSubmenu] = useState(false);
  const deleteCanvas = useCanvasStore((s) => s.deleteCanvas);
  const fetchHistory = useCanvasStore((s) => s.fetchHistory);
  const toggleSaveForLater = useCanvasStore((s) => s.toggleSaveForLater);
  const isCanvasSaved = useCanvasStore((s) => s.isCanvasSaved);
  const openSidebar = useCanvasUiStore((s) => s.openSidebar);

  const canvasId = canvas?._id;
  const savedForLater = canvasId ? isCanvasSaved(canvasId) : false;

  const [currentFontLabel, setCurrentFontLabel] = useState(() => {
    const persisted = loadPersistedFont();
    if (persisted) {
      const match = FONT_FAMILIES.find((f) => f.value === persisted);
      return match ? match.label : "System UI";
    }
    return "System UI";
  });

  // Apply persisted font on mount
  useEffect(() => {
    const persisted = loadPersistedFont();
    if (persisted) {
      applyFontToEditor(persisted);
    }
  }, []);

  // Click-outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Close on scroll or resize to prevent menu detachment
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e) => {
      // Don't close if the scroll is inside the menu itself
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      onClose();
    };
    const handleResize = () => onClose();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, onClose]);

  const handleCopyLink = useCallback(() => {
    const url = canvasId
      ? `${window.location.origin}/canvas/${canvasId}`
      : window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copied to clipboard");
    });
    onClose();
  }, [canvasId, onClose]);

  const handleShare = useCallback(() => {
    if (onOpenShareModal) {
      onOpenShareModal();
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => {
        toast.success("Share link copied to clipboard");
      });
    }
    onClose();
  }, [onClose, onOpenShareModal]);

  const handleViewDetails = useCallback(() => {
    openSidebar("details");
    onClose();
  }, [openSidebar, onClose]);

  const handleSaveForLater = useCallback(async () => {
    if (!canvasId) return;
    try {
      await toggleSaveForLater(canvasId);
    } catch {
      toast.error("Failed to save");
    }
    onClose();
  }, [canvasId, toggleSaveForLater, onClose]);

  const handleAddCover = useCallback(() => {
    onOpenCoverPicker?.();
    onClose();
  }, [onOpenCoverPicker, onClose]);

  const handleCoverReplace = useCallback(() => {
    onCoverReplace?.();
    setShowCoverSubmenu(false);
    onClose();
  }, [onCoverReplace, onClose]);

  const handleCoverReposition = useCallback(() => {
    onCoverReposition?.();
    setShowCoverSubmenu(false);
    onClose();
  }, [onCoverReposition, onClose]);

  const handleCoverRemove = useCallback(() => {
    onCoverRemove?.();
    setShowCoverSubmenu(false);
    onClose();
  }, [onCoverRemove, onClose]);

  const handleShowThreads = useCallback(() => {
    openSidebar("comments");
    onClose();
  }, [openSidebar, onClose]);

  const handleViewHistory = useCallback(async () => {
    if (canvasId) {
      await fetchHistory(canvasId);
      openSidebar("history");
    }
    onClose();
  }, [canvasId, fetchHistory, openSidebar, onClose]);

  const handlePrint = useCallback(() => {
    window.print();
    onClose();
  }, [onClose]);

  const handleFontSelect = useCallback(
    (font) => {
      applyFontToEditor(font.value);
      persistFont(font.value);
      setCurrentFontLabel(font.label);
      setShowFontSubmenu(false);
      toast(`Font changed to ${font.label}`);
      onClose();
    },
    [onClose]
  );

  const handleDelete = useCallback(() => {
    if (!canvasId) return;
    const confirmed = window.confirm(
      "Are you sure you want to delete this canvas? This action cannot be undone."
    );
    if (!confirmed) return;
    onClose();
    deleteCanvas(canvasId).then((result) => {
      if (result) onBack?.();
    });
  }, [canvasId, deleteCanvas, onClose, onBack]);

  // ── Delete is available to all users ────────────────────────────────────
  const canDelete = true;

  if (!isOpen) return null;

  return (
    <div className="canvas-three-dot-menu" ref={menuRef} style={styleOverride}>
      {/* Group 1: Quick Actions */}
      <MenuItem icon={Link2} label="Copy link" onClick={handleCopyLink} />
      <MenuItem icon={Share2} label="Share this canvas" onClick={handleShare} />
      <MenuItem icon={Info} label="View file details" onClick={handleViewDetails} />
      <MenuItem
        icon={Bookmark}
        label={savedForLater ? "Remove from Later" : "Save for later"}
        onClick={handleSaveForLater}
      />

      {/* <div className="canvas-three-dot-divider" /> */}

      {/* Group 2: Cover */}
      {/* {hasCover ? (
        <MenuItem
          icon={ImageIcon}
          label="Cover image"
          hasSubmenu
          onMouseEnter={() => setShowCoverSubmenu(true)}
          onMouseLeave={() => setShowCoverSubmenu(false)}
        >
          {showCoverSubmenu && (
            <div className="canvas-three-dot-submenu">
              <button className="canvas-three-dot-submenu-item" onClick={handleCoverReplace}>
                Replace
              </button>
              <button className="canvas-three-dot-submenu-item" onClick={handleCoverReposition}>
                Reposition
              </button>
              <button className="canvas-three-dot-submenu-item" onClick={handleCoverRemove}>
                Remove
              </button>
            </div>
          )}
        </MenuItem>
      ) : (
        <MenuItem
          icon={ImageIcon}
          label="Add cover image"
          onClick={handleAddCover}
        />
      )} */}

      <div className="canvas-three-dot-divider" />

      {/* Group 3: Threads and History */}
      <MenuItem icon={MessageSquare} label="Show all threads" onClick={handleShowThreads} />
      <MenuItem icon={History} label="View version history" onClick={handleViewHistory} />

      {/* <div className="canvas-three-dot-divider" /> */}

      {/* Group 4: Output */}
      {/* <MenuItem icon={Printer} label="Print canvas" onClick={handlePrint} /> */}

      <div className="canvas-three-dot-divider" />

      {/* Group 5: Settings */}
      {/* <MenuItem
        icon={Type}
        label={`Change system font: ${currentFontLabel}`}
        hasSubmenu
        onMouseEnter={() => setShowFontSubmenu(true)}
        onMouseLeave={() => setShowFontSubmenu(false)}
      >
        {showFontSubmenu && (
          <div className="canvas-three-dot-submenu">
            {FONT_FAMILIES.map((font) => (
              <button
                key={font.value}
                className="canvas-three-dot-submenu-item"
                onClick={() => handleFontSelect(font)}
                style={{
                  fontFamily: font.value,
                  fontWeight: currentFontLabel === font.label ? 700 : 400,
                }}
              >
                {font.label}
                {currentFontLabel === font.label && " ✓"}
              </button>
            ))}
          </div>
        )}
      </MenuItem> */}

      {/* <div className="canvas-three-dot-divider" /> */}

      {/* Group 6: Destructive — Delete canvas */}
      <MenuItem
        icon={Trash2}
        label="Delete canvas"
        onClick={handleDelete}
        destructive
      />
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  hasSubmenu,
  destructive,
  disabled,
  onMouseEnter,
  onMouseLeave,
  children,
}) {
  return (
    <div
      className="canvas-three-dot-item-wrapper"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ position: hasSubmenu ? "relative" : "static" }}
    >
      <button
        className={`canvas-three-dot-item${destructive ? " is-destructive" : ""}${disabled ? " is-disabled" : ""}`}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
      >
        <span className="item-icon">
          <Icon size={16} />
        </span>
        <span className="item-label">{label}</span>
        {hasSubmenu && (
          <span className="item-chevron">
            <ChevronRight size={14} />
          </span>
        )}
      </button>
      {children}
    </div>
  );
}