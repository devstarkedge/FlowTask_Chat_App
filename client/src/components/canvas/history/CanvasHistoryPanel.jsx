import { RotateCcw, X } from "lucide-react";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CanvasHistoryPanel({ history = [], onClose, onRestore }) {
  return (
    <aside className="canvas-sidebar" aria-label="Canvas history">
      <div className="canvas-sidebar-header">
        <div>
          <strong>History</strong>
          <span>{history.length} snapshots</span>
        </div>
        <button type="button" aria-label="Close history" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="canvas-history-list">
        {history.length === 0 ? (
          <div className="canvas-sidebar-empty">No snapshots yet</div>
        ) : (
          history.map((item) => (
            <article className="canvas-history-item" key={item._id}>
              <div>
                <strong>{item.operationSummary || "Canvas updated"}</strong>
                <span>
                  {item.editorId?.name || "Someone"} - {formatDate(item.timestamp)}
                </span>
              </div>
              <button type="button" onClick={() => onRestore(item._id)}>
                <RotateCcw size={13} />
                Restore
              </button>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}
