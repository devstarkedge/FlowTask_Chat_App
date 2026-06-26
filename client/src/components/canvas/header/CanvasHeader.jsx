import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import debounce from "lodash/debounce";
import { MoreHorizontal, MoreVertical, Image as ImageIcon, Move } from "lucide-react";
import { useCanvasStore } from "../../../stores/canvasStore";
import CanvasCoverImage from "../cover/CanvasCoverImage";
import CanvasCoverActions from "../cover/CanvasCoverActions";
import CanvasCover from "../cover/CanvasCover";
import CanvasThreeDotMenu from "../CanvasThreeDotMenu";
import "../styles/canvas-cover-tokens.css";

// ── Cover Style Helper ──────────────────────────────────────────────────────────
function coverStyle(cover) {
  if (!cover) return null;
  if (cover.type === "image") {
    return {
      backgroundImage: `url(${cover.value})`,
      backgroundSize: "cover",
      backgroundPosition: `center ${cover.yOffset ?? 50}%`,
    };
  }
  return { background: cover.value };
}

/**
 * CanvasHeader — manages the tab nav bar, cover strip, title editing,
 * cover picker, share modal, and three-dot menu.
 *
 * @param {Object}  props
 * @param {Object}  props.canvas        - Canvas document
 * @param {Function} props.onBack       - Navigate back handler
 * @param {Function} props.onOpenShareModal - Open share modal handler
 * @param {Array}   props.tabs          - Tab list for secondary navigation
 * @param {string}  props.activeTab     - Currently active tab ID
 */
export default function CanvasHeader({
  canvas,
  onBack,
  onOpenShareModal,
  tabs = [],
  activeTab = "untitled",
}) {
  const updateCanvasMetadata = useCanvasStore((s) => s.updateCanvasMetadata);

  // ── State ──────────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState(canvas?.title || "");
  const [coverHovered, setCoverHovered] = useState(false);
  const [titleHovered, setTitleHovered] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const showCoverActions = coverHovered || titleHovered || showCoverPicker;
  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false);
  const [isRepositioning, setIsRepositioning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [yOffset, setYOffset] = useState(canvas?.cover?.yOffset ?? 50);
  const threeDotBtnRef = useRef(null);
  const dragRef = useRef({ isDragging: false, startY: 0, startYOffset: 50 });

  const handleMouseDown = useCallback((e) => {
    if (canvas?.cover?.type !== "image") return;
    e.preventDefault();
    dragRef.current = {
      isDragging: true,
      startY: e.clientY,
      startYOffset: yOffset,
      currentYOffset: yOffset
    };
    setIsDragging(true);
  }, [canvas?.cover?.type, yOffset]);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current.isDragging) return;
    const dy = e.clientY - dragRef.current.startY;
    const containerH = e.currentTarget.offsetHeight || 240;
    const delta = (dy / containerH) * 100;
    const nextOffset = Math.max(0, Math.min(100, dragRef.current.startYOffset - delta));
    setYOffset(nextOffset);
    dragRef.current.currentYOffset = nextOffset;
  }, []);

  const handleMouseUp = useCallback(async () => {
    if (dragRef.current.isDragging) {
      dragRef.current.isDragging = false;
      setIsDragging(false);
      const finalYOffset = dragRef.current.currentYOffset !== undefined ? dragRef.current.currentYOffset : yOffset;
      if (canvas?._id && canvas?.cover) {
        await updateCanvasMetadata(canvas._id, {
          cover: { ...canvas.cover, yOffset: finalYOffset }
        });
      }
    }
  }, [canvas?._id, canvas?.cover, yOffset, updateCanvasMetadata]);

  // Sync yOffset with database value when cover changes
  useEffect(() => {
    if (canvas?.cover?.yOffset !== undefined) {
      setYOffset(canvas.cover.yOffset);
    }
  }, [canvas?.cover?.yOffset, canvas?.cover?.value]);

  // ── Title Sync ─────────────────────────────────────────────────────────────────
  // Only reset the local title when switching to a DIFFERENT canvas (_id changes).
  // Do NOT include canvas?.title in deps — that would overwrite the user's
  // in-progress typing every time the debounced save writes back to the store.
  useEffect(() => {
    setTitle(canvas?.title || "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas?._id]);

  // Sync browser tab title with canvas title
  useEffect(() => {
    if (canvas?.title) {
      document.title = `${canvas.title} | FlowTask`;
    }
  }, [canvas?.title]);

  const debouncedTitleSave = useMemo(
    () =>
      debounce(async (nextTitle) => {
        if (!canvas?._id) return;
        await updateCanvasMetadata(canvas._id, {
          title: nextTitle.trim() || "Untitled canvas",
        });
      }, 600),
    [canvas?._id, updateCanvasMetadata],
  );

  useEffect(() => () => debouncedTitleSave.cancel(), [debouncedTitleSave]);

  // ── Cover Actions ──────────────────────────────────────────────────────────────
  const handleCoverReplace = useCallback(() => {
    setShowCoverPicker(true);
  }, []);

  const handleCoverReposition = useCallback(() => {
    setYOffset(canvas?.cover?.yOffset ?? 50);
    setIsRepositioning(true);
  }, [canvas?.cover?.yOffset]);

  const handleCoverRemove = useCallback(async () => {
    if (canvas?._id) {
      await updateCanvasMetadata(canvas._id, { cover: null });
    }
    setIsRepositioning(false);
  }, [canvas?._id, updateCanvasMetadata]);

  const handleCancelReposition = useCallback(() => {
    setYOffset(canvas?.cover?.yOffset ?? 50);
    setIsRepositioning(false);
  }, [canvas?.cover?.yOffset]);

  const handleSaveReposition = useCallback(async () => {
    if (canvas?._id && canvas?.cover) {
      await updateCanvasMetadata(canvas._id, {
        cover: { ...canvas.cover, yOffset }
      });
    }
    setIsRepositioning(false);
  }, [canvas?._id, canvas?.cover, yOffset, updateCanvasMetadata]);

  const handleOpenShareModal = useCallback(() => {
    if (onOpenShareModal) onOpenShareModal();
  }, [onOpenShareModal]);

  const currentCoverStyle = coverStyle(canvas?.cover);

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Secondary Tab Navigation */}
      <div className="canvas-tab-nav">
        <div className="canvas-tabs-container">
          {tabs.length > 0 &&
            tabs.map((tab) => (
              <button
                key={tab.id}
                className={`canvas-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={tab.onClick}
              >
                {tab.icon && (
                  <span className="canvas-tab-icon">{tab.icon}</span>
                )}
                <span className="canvas-tab-label">{tab.label}</span>
              </button>
            ))}
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            className="canvas-topbar-menu"
            aria-label="More options"
            onClick={() => setShowThreeDotMenu((v) => !v)}
          >
            <MoreVertical size={16} />
          </button>
          <CanvasThreeDotMenu
            canvas={canvas}
            isOpen={showThreeDotMenu}
            onClose={() => setShowThreeDotMenu(false)}
            onOpenCoverPicker={() => {
              setShowCoverPicker(true);
              setShowThreeDotMenu(false);
            }}
            onBack={onBack}
            onOpenShareModal={handleOpenShareModal}
            onCoverReplace={handleCoverReplace}
            onCoverReposition={handleCoverReposition}
            onCoverRemove={handleCoverRemove}
            hasCover={!!canvas?.cover}
          />
        </div>
      </div>

      {/* Cover Image (when present) - uses modular cover components with design tokens */}
      {currentCoverStyle && (
        <div
          className={`canvas-cover-strip${coverHovered ? " is-hovered" : ""}`}
          onMouseEnter={() => !isRepositioning && setCoverHovered(true)}
          onMouseLeave={() => !isRepositioning && setCoverHovered(false)}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ 
            width: "100%",
            position: "relative",
            cursor: canvas?.cover?.type === "image" ? (isDragging ? "grabbing" : "grab") : "default",
          }}
        >
          <CanvasCoverImage
            cover={canvas?.cover}
            yOffset={yOffset}
            isDragging={isDragging}
          />
          <div className="canvas-cover-overlay" />
          <div className="canvas-cover-title">
            {canvas?.title || "Untitled Canvas"}
          </div>

          {isRepositioning ? (
            <>
              {/* Drag Reposition Hint Pill in center */}
              <div style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 30,
                background: "rgba(0, 0, 0, 0.65)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: 20,
                display: "flex",
                alignItems: "center",
                gap: 6,
                pointerEvents: "none",
                userSelect: "none",
              }}>
                <span style={{ fontSize: 16 }}>↕</span> Drag to reposition
              </div>

              {/* Cancel / Save buttons at bottom right */}
              <div style={{
                position: "absolute",
                bottom: 12,
                right: 12,
                display: "flex",
                gap: 8,
                zIndex: 30,
              }}>
                <button
                  onClick={handleCancelReposition}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.3)",
                    background: "rgba(0,0,0,0.5)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveReposition}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "none",
                    background: "#00875a",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </div>
            </>
          ) : (
            <>
              {canvas?.cover?.type === "image" && coverHovered && (
                <div className="canvas-cover-drag-hint">
                  <Move size={10} />
                  Drag to reposition
                </div>
              )}
              <div className="canvas-cover-actions">
                <button
                  className="canvas-cover-change-btn"
                  onClick={() => setShowCoverPicker(true)}
                >
                  <ImageIcon size={14} />
                  Change cover
                </button>
                <button
                  className="canvas-cover-remove-btn"
                  onClick={handleCoverRemove}
                >
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Unified hover zone for title + add cover + menu */}
      <div
        className="canvas-cover-title-zone"
        onMouseEnter={() => {
          setTitleHovered(true);
        }}
        onMouseLeave={() => {
          setTitleHovered(false);
        }}
      >
        {/* Add Cover Button (only when no cover) */}
        {!canvas?.cover && (
          <button
            className={`canvas-add-cover-btn${showCoverActions ? " is-visible" : ""}`}
            onClick={() => {
              setShowCoverPicker(true);
            }}
          >
            <ImageIcon size={14} />
            Add cover
          </button>
        )}


        {/* Title Input */}
        <input
          className="canvas-title-input"
          value={title}
          placeholder="Your canvas title"
          spellCheck={false}
          onChange={(event) => {
            setTitle(event.target.value);
            debouncedTitleSave(event.target.value);
          }}
          onBlur={() => debouncedTitleSave.flush()}
        />
      </div>

      {/* Cover Picker Modal */}
      {showCoverPicker && (
        <div
          className="canvas-cover-picker-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCoverPicker(false);
          }}
        >
          <div className="canvas-cover-picker-panel" style={{ width: "min(600px, 90vw)" }}>
              <CanvasCover
                cover={canvas?.cover}
                canvasId={canvas?._id}
                canvasTitle={title}
                channelId={canvas?.channelId}
                onClose={() => setShowCoverPicker(false)}
                mode="picker"
              />
          </div>
        </div>
      )}
    </>
  );
}

// Also export the coverStyle helper so other components can reuse it.
export { coverStyle };
