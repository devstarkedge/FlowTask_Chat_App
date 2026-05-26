import { useEffect, useRef, useState } from "react";
import { Edit2, Copy, XSquare, Trash2, Loader2 } from "lucide-react";
import { useCanvasStore } from "../../stores/canvasStore";

export default function CanvasTabContextMenu({
  canvasId,
  x,
  y,
  onClose,
  onRenameTrigger,
  onRemoveTab,
}) {
  const menuRef = useRef(null);
  const { duplicateCanvas, deleteCanvas } = useCanvasStore();
  const [isProcessing, setIsProcessing] = useState(false);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleDuplicate = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await duplicateCanvas(canvasId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  // const handleDelete = async () => {
  //   if (isProcessing) return;
  //   if (window.confirm("Are you sure you want to permanently delete this canvas and all its blocks, reactions, and comments? This action cannot be undone.")) {
  //     setIsProcessing(true);
  //     try {
  //       await deleteCanvas(canvasId);
  //     } catch (err) {
  //       console.error(err);
  //     } finally {
  //       setIsProcessing(false);
  //       onClose();
  //     }
  //   } else {
  //     onClose();
  //   }
  // };

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 1000,
        width: 180,
        background: "rgba(23, 23, 23, 0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
        padding: "5px",
        animation: "contextMenuIn 150ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
      }}
    >
      <style>{`
        @keyframes contextMenuIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-5px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .context-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #e5e5e5;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          transition: all 120ms ease;
        }
        .context-menu-item:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }
        .context-menu-item--danger:hover {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
        }
      `}</style>

      {isProcessing ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px", gap: "8px", color: "#a3a3a3", fontSize: "12px" }}>
          <Loader2 size={14} className="animate-spin" />
          Processing...
        </div>
      ) : (
        <>
          <button
            onClick={() => {
              onRenameTrigger();
              onClose();
            }}
            className="context-menu-item"
          >
            <Edit2 size={14} />
            <span>Rename Canvas</span>
          </button>

          <button onClick={handleDuplicate} className="context-menu-item">
            <Copy size={14} />
            <span>Duplicate Canvas</span>
          </button>

          <button onClick={onRemoveTab} className="context-menu-item">
            <XSquare size={14} />
            <span>Remove Tab</span>
          </button>

          <div
            style={{
              height: 1,
              background: "rgba(255, 255, 255, 0.06)",
              margin: "4px 8px",
            }}
          />

          {/* <button
            onClick={handleDelete}
            className="context-menu-item context-menu-item--danger"
            style={{ color: "#ef4444" }}
          >
            <Trash2 size={14} />
            <span>Delete Canvas</span>
          </button> */}
        </>
      )}
    </div>
  );
}
