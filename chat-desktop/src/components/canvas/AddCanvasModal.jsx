import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, FileText, Copy, Plus } from "lucide-react";
import CanvasPanel from "./CanvasPanel";

export default function AddCanvasModal({ isOpen, onClose, channelId, workspaceId, onCreated }) {
  const [intent, setIntent] = useState(null); // null | 'blank' | 'template' | 'existing'

  const createdRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      createdRef.current = false;
      setIntent(null);
    }
  }, [isOpen, channelId]);

  const handleCreated = (canvas) => {
    if (createdRef.current) return;
    createdRef.current = true;
    const id = canvas && canvas._id ? canvas._id : canvas;
    onCreated?.(id);
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => onClose?.()}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "860px", maxWidth: "calc(100% - 32px)", display: "flex", gap: 16 }}
      >
        <div style={{ width: 220, paddingRight: 8, borderRight: "1px solid var(--border-primary)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Create canvas</h3>
            <button onClick={() => onClose?.()} title="Close" style={{ background: "none", border: "none", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={() => setIntent("blank")}
              className="slim-tab"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px", textAlign: "left" }}
            >
              <Plus size={16} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600 }}>Blank canvas</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Start with a blank document</div>
              </div>
            </button>

            <button
              onClick={() => setIntent("template")}
              className="slim-tab"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px", textAlign: "left" }}
            >
              <Copy size={16} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600 }}>From template</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Use a predefined template</div>
              </div>
            </button>

            <button
              onClick={() => setIntent("existing")}
              className="slim-tab"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px", textAlign: "left" }}
            >
              <FileText size={16} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600 }}>Link existing</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Link a canvas from this workspace</div>
              </div>
            </button>

            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
              Changes sync in real-time with other collaborators.
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 320 }}>
          {intent ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <button
                  onClick={() => setIntent(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                >
                  <ChevronLeft size={16} />
                </button>
                <div style={{ fontWeight: 700 }}>{intent === "blank" ? "Blank canvas" : intent === "template" ? "From template" : "Add existing canvas"}</div>
              </div>

              <div style={{ flex: 1, overflow: "auto" }}>
                <CanvasPanel channelId={channelId} workspaceId={workspaceId} intent={intent} onIntentConsumed={() => { /* CanvasPanel will set store; parent will handle UI changes */ }} onCreated={handleCreated} />
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Create or link a canvas</div>
                <div style={{ maxWidth: 420, margin: "0 auto", fontSize: 13 }}>Choose an option on the left to start a new canvas, use a template, or link an existing canvas from this workspace. Once created it will open in the editor and appear as a tab.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
