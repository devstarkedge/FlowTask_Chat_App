import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import debounce from "lodash/debounce";
import { MoreHorizontal, Image as ImageIcon, Move } from "lucide-react";
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
  const threeDotBtnRef = useRef(null);

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
    setIsRepositioning(true);
  }, []);

  const handleCoverRemove = useCallback(async () => {
    if (canvas?._id) {
      await updateCanvasMetadata(canvas._id, { cover: null });
    }
    setIsRepositioning(false);
  }, [canvas?._id, updateCanvasMetadata]);

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
          />
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
          onMouseEnter={() => setCoverHovered(true)}
          onMouseLeave={() => setCoverHovered(false)}
          style={{ 
            width: "100%",
            position: "relative",
          }}
        >
          <CanvasCoverImage
            cover={canvas?.cover}
            yOffset={canvas?.cover?.yOffset ?? 50}
            isDragging={false}
          />
          <div className="canvas-cover-overlay" />
          <div className="canvas-cover-title">
            {canvas?.title || "Untitled Canvas"}
          </div>
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

        {/* Always-visible three-dot menu button */}
        <button
          ref={threeDotBtnRef}
          className="canvas-title-zone-three-dot"
          onClick={() => setShowThreeDotMenu((v) => !v)}
          aria-label="Canvas options"
          title="Canvas options"
        >
          <MoreHorizontal size={16} />
        </button>

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
