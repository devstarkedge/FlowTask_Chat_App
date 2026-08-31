import { useMemo } from "react";
import { RotateCcw, X } from "lucide-react";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";

/* ── Helpers ── */
function getDateKey(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

function formatDateHeader(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function groupByDate(history) {
  const groups = {};
  for (const item of history) {
    const key = getDateKey(item.timestamp);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

/* ── Component ── */
export default function CanvasHistoryPanel({ history = [], onClose, onRestore, onPreviewVersion }) {
  const viewingVersion = useCanvasUiStore((s) => s.viewingVersion);
  const setViewingVersion = useCanvasUiStore((s) => s.setViewingVersion);
  const clearViewingVersion = useCanvasUiStore((s) => s.clearViewingVersion);

  const grouped = useMemo(() => groupByDate(history), [history]);

  const handleItemClick = (item) => {
    const editorName = item.editorId?.name || "Someone";
    const editorAvatar = item.editorId?.avatar || null;
    setViewingVersion({
      historyId: item._id,
      editorName,
      editorAvatar,
      timestamp: item.timestamp,
      snapshot: item.snapshot,
    });
    onPreviewVersion?.(item);
  };

  const handleRestore = async (historyId) => {
    await onRestore(historyId);
    clearViewingVersion();
  };

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

      {/* Read-only banner when viewing a version */}
      {viewingVersion && (
        <div className="canvas-history-readonly-banner">
          <div className="canvas-history-readonly-banner__text">
            Viewing version by <strong>{viewingVersion.editorName}</strong>
            {" — "}
            {formatTime(viewingVersion.timestamp)}
          </div>
          <div className="canvas-history-readonly-banner__actions">
            <button
              className="canvas-history-restore-btn"
              onClick={() => handleRestore(viewingVersion.historyId)}
            >
              <RotateCcw size={13} />
              Restore Version
            </button>
            <button
              className="canvas-history-exit-btn"
              onClick={clearViewingVersion}
            >
              Exit
            </button>
          </div>
        </div>
      )}

      <div className="canvas-history-list">
        {history.length === 0 ? (
          <div className="canvas-sidebar-empty">No snapshots yet</div>
        ) : (
          grouped.map(([dateKey, items]) => (
            <div key={dateKey} className="canvas-history-group">
              <div className="canvas-history-group-header">
                {formatDateHeader(items[0].timestamp)}
              </div>
              {items.map((item) => {
                const name = item.editorId?.name || "Someone";
                const avatar = item.editorId?.avatar || null;
                const isActive = viewingVersion?.historyId === item._id;

                return (
                  <button
                    key={item._id}
                    className={`canvas-history-item-v2${isActive ? " is-active" : ""}`}
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="canvas-history-item-v2__avatar">
                      {avatar ? (
                        <img src={avatar} alt={name} />
                      ) : (
                        <span className="canvas-history-item-v2__initials">
                          {getInitials(name)}
                        </span>
                      )}
                    </div>
                    <div className="canvas-history-item-v2__info">
                      <span className="canvas-history-item-v2__name">{name}</span>
                      <span className="canvas-history-item-v2__time">
                        {formatTime(item.timestamp)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
