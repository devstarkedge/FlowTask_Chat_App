import { X, Share2 } from "lucide-react";
import { useAuthStore } from "../../../stores/authStore";
import { useCanvasStore } from "../../../stores/canvasStore";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CanvasDetailsSidebar({ canvas, onClose, onOpenShareModal }) {
  const user = useAuthStore((s) => s.user);
  const openTabsByChannel = useCanvasStore((s) => s.openTabsByChannel);

  const channelId = canvas?.channelId;
  const tabs = channelId ? openTabsByChannel[channelId] || [] : [];

  const isOwner =
    canvas?.createdBy &&
    user &&
    (String(canvas.createdBy) === String(user._id) ||
      String(canvas.createdBy?._id || canvas.createdBy) === String(user._id));

  const ownerName =
    typeof canvas?.createdBy === "object" && canvas.createdBy?.name
      ? canvas.createdBy.name
      : isOwner
        ? user?.name || "You"
        : "Unknown";

  const viewCount = canvas?.viewCount || 0;

  return (
    <aside className="canvas-sidebar canvas-details-sidebar" aria-label="Canvas details">
      <div className="canvas-sidebar-header">
        <div>
          <strong>Canvas</strong>
        </div>
        <button type="button" aria-label="Close details" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="canvas-details-content">
        {/* Title */}
        <h3 className="canvas-details-title">{canvas?.title || "Untitled canvas"}</h3>

        {/* Owner */}
        <div className="canvas-details-row">
          <span className="canvas-details-label">Owned by</span>
          <span className="canvas-details-value canvas-details-owner">
            {ownerName}
            {isOwner && <span className="canvas-details-you">(you)</span>}
          </span>
        </div>

        {/* Created */}
        <div className="canvas-details-row">
          <span className="canvas-details-label">Created</span>
          <span className="canvas-details-value">{formatDate(canvas?.createdAt)}</span>
        </div>

        {/* Last updated */}
        <div className="canvas-details-row">
          <span className="canvas-details-label">Last updated</span>
          <span className="canvas-details-value">{formatDate(canvas?.updatedAt)}</span>
        </div>

        {/* View count */}
        <div className="canvas-details-row">
          <span className="canvas-details-label">Views</span>
          <span className="canvas-details-value">
            Viewed by {viewCount} {viewCount === 1 ? "person" : "people"}
          </span>
        </div>

        {/* Tabs section */}
        <div className="canvas-details-tabs">
          <h4 className="canvas-details-tabs-heading">
            Tabs {tabs.length > 0 && <span className="canvas-details-tabs-count">{tabs.length}</span>}
          </h4>
          {tabs.length === 0 ? (
            <div className="canvas-details-tabs-empty">No open tabs</div>
          ) : (
            <ul className="canvas-details-tabs-list">
              {tabs.map((tab) => (
                <li key={tab._id} className="canvas-details-tab-item">
                  <span className="canvas-details-tab-icon">📄</span>
                  <span className="canvas-details-tab-title">{tab.title || "Untitled"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Share button */}
        <div className="canvas-details-share">
          <button className="canvas-details-share-btn" onClick={onOpenShareModal}>
            <Share2 size={14} />
            Share canvas
          </button>
        </div>
      </div>
    </aside>
  );
}
