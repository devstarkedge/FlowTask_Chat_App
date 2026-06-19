import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import debounce from "lodash/debounce";
import { MoreHorizontal, Image as ImageIcon } from "lucide-react";
import { useCanvasStore } from "../../../stores/canvasStore";
import CanvasCover from "../CanvasCover";
import CanvasThreeDotMenu from "../CanvasThreeDotMenu";
import toast from "react-hot-toast";
import { showPermissionToast } from "../permissions/useCanvasPermissions";

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
 * cover picker, share modal, three-dot menu, and view-only banner.
 *
 * @param {Object}  props
 * @param {Object}  props.canvas        - Canvas document
 * @param {boolean} props.isViewOnly    - Read-only mode flag
 * @param {string|null} props.canvasRole - User's role on this canvas
 * @param {Function} props.onBack       - Navigate back handler
 * @param {Function} props.onOpenShareModal - Open share modal handler
 * @param {Array}   props.tabs          - Tab list for secondary navigation
 * @param {string}  props.activeTab     - Currently active tab ID
 */
export default function CanvasHeader({
  canvas,
  isViewOnly,
  canvasRole,
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
  useEffect(() => {
    setTitle(canvas?.title || "");
  }, [canvas?._id, canvas?.title]);

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
        if (isViewOnly) {
          showPermissionToast();
          setTitle(canvas.title || "Untitled");
          return;
        }
        await updateCanvasMetadata(canvas._id, {
          title: nextTitle.trim() || "Untitled canvas",
        });
      }, 600),
    [canvas?._id, updateCanvasMetadata, isViewOnly],
  );

  useEffect(() => () => debouncedTitleSave.cancel(), [debouncedTitleSave]);

  // ── Cover Actions ──────────────────────────────────────────────────────────────
  const handleCoverReplace = useCallback(() => {
    if (isViewOnly) {
      showPermissionToast();
      return;
    }
    setShowCoverPicker(true);
  }, [isViewOnly]);

  const handleCoverReposition = useCallback(() => {
    if (isViewOnly) {
      showPermissionToast();
      return;
    }
    setIsRepositioning(true);
  }, [isViewOnly]);

  const handleCoverRemove = useCallback(async () => {
    if (isViewOnly) {
      showPermissionToast();
      return;
    }
    if (canvas?._id) {
      await updateCanvasMetadata(canvas._id, { cover: null });
    }
    setIsRepositioning(false);
  }, [canvas?._id, updateCanvasMetadata, isViewOnly]);

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
            isViewOnly={isViewOnly}
            canvasRole={canvasRole}
          />
        </div>
      </div>

      {/* View-only banner */}
      {isViewOnly && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--warning-color, #f59e0b)",
            background: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-primary)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          View-only — You do not have permission to edit this canvas.
        </div>
      )}

      {/* Cover Image (when present) - rendered outside container to occupy 100% of header panel */}
      {currentCoverStyle && (
        <div
          className={`canvas-cover-strip${coverHovered ? " is-hovered" : ""}`}
          style={currentCoverStyle}
          onMouseEnter={() => setCoverHovered(true)}
          onMouseLeave={() => setCoverHovered(false)}
        >
          {!isViewOnly && (
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
                onClick={async () => {
                  if (canvas?._id) {
                    await updateCanvasMetadata(canvas._id, { cover: null });
                  }
                  setShowCoverPicker(false);
                }}
              >
                Remove
              </button>
            </div>
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
              if (isViewOnly) {
                showPermissionToast();
                return;
              }
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
          readOnly={isViewOnly}
          style={isViewOnly ? { cursor: "default", opacity: 0.8 } : {}}
          onChange={(event) => {
            if (isViewOnly) return;
            setTitle(event.target.value);
            debouncedTitleSave(event.target.value);
          }}
          onKeyDown={(e) => {
            if (isViewOnly) {
              const allowedKeys = [
                "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
                "Home", "End", "PageUp", "PageDown",
                "Control", "Shift", "Alt", "Meta", "CapsLock", "Escape", "Tab"
              ];
              if (!allowedKeys.includes(e.key) && !(e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                showPermissionToast();
              }
            }
          }}
          onBlur={() => !isViewOnly && debouncedTitleSave.flush()}
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
          <div className="canvas-cover-picker-panel">
            <CanvasCover
              cover={canvas?.cover}
              canvasId={canvas?._id}
              canvasTitle={title}
              channelId={canvas?.channelId}
              onClose={() => setShowCoverPicker(false)}
              isViewOnly={isViewOnly}
            />
          </div>
        </div>
      )}
    </>
  );
}

// Also export the coverStyle helper so other components can reuse it.
export { coverStyle };
