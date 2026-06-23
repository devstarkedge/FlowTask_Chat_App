import { useState, useCallback } from "react";
import { Image as ImageIcon, X, Move } from "lucide-react";

/**
 * CanvasCoverActions — Hover action buttons for canvas cover.
 */
export default function CanvasCoverActions({
  hasCover,
  onOpenCoverPicker,
  onRemoveCover,
  onReposition,
  isRepositioning = false,
  coverType = null,
}) {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleRemoveClick = useCallback(() => {
    if (!showRemoveConfirm) {
      setShowRemoveConfirm(true);
      setTimeout(() => setShowRemoveConfirm(false), 3000);
      return;
    }
    onRemoveCover?.();
    setShowRemoveConfirm(false);
  }, [showRemoveConfirm, onRemoveCover]);

  return (
    <div className="canvas-cover-actions">
      {hasCover && (
        <>
          <button
            className="canvas-cover-change-btn"
            onClick={onOpenCoverPicker}
            title="Change cover"
          >
            <ImageIcon size={14} />
            Change cover
          </button>
          {coverType === "image" && (
            <button
              className="canvas-cover-reposition-btn"
              onClick={onReposition}
              title="Reposition cover"
            >
              <Move size={14} />
              {isRepositioning ? "Repositioning..." : "Reposition"}
            </button>
          )}
          <button
            className={`canvas-cover-remove-btn${showRemoveConfirm ? " is-confirming" : ""}`}
            onClick={handleRemoveClick}
            title={showRemoveConfirm ? "Click again to confirm" : "Remove cover"}
          >
            <X size={14} />
            {showRemoveConfirm ? "Confirm remove?" : "Remove"}
          </button>
        </>
      )}
    </div>
  );
}