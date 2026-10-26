import React from "react";
import { FileText } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChannelStore } from '../../stores/channelStore';
import { getChannelPath, getDMPath } from '../../utils/chatRoutes';

export default function CanvasDocumentCard({ url, canvasId, token, isPublic, title, previewText, channelId, workspaceId }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleOpen = () => {
    if (isPublic && token) {
      navigate(`/public/canvas/${token}`);
    } else if (canvasId) {
      // Keep the receiving conversation mounted. The standalone deep-link
      // loader navigates to the owner's channel, which may be a different DM.
      const conversation = location.pathname.match(/^(\/workspace\/[^/]+\/(?:channel|dms)\/([^/]+))(?:\/|$)/);
      const messageChannelId = String(channelId?._id || channelId || '');
      const messageWorkspaceId = String(workspaceId?._id || workspaceId || location.pathname.match(/^\/workspace\/([^/]+)/)?.[1] || '');
      if (conversation && (!messageChannelId || messageChannelId === conversation[2])) {
        navigate(conversation[1], {
          state: { targetTab: `canvas:${canvasId}`, targetChannelId: conversation[2] },
        });
      } else if (messageChannelId && messageWorkspaceId) {
        const channel = useChannelStore.getState().channels.find(item => String(item._id) === messageChannelId);
        const destination = channel?.type === 'dm' || channel?.type === 'self' ? getDMPath : getChannelPath;
        navigate(destination(messageWorkspaceId, messageChannelId), {
          state: { targetTab: `canvas:${canvasId}`, targetChannelId: messageChannelId },
        });
      } else {
        navigate(`/canvas/${canvasId}`);
      }
    } else {
      // Fallback if we only have URL
      window.open(url, "_blank");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "4px 0" }}>
      {/* Shared canvas card */}
      <div
        onClick={handleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); handleOpen();
          }
        }}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--bg-primary, #ffffff)",
          border: "1px solid var(--border-secondary, #e2e8f0)",
          borderRadius: 12,
          overflow: "hidden",
          cursor: "pointer",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          transition: "box-shadow 0.2s, border-color 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
          e.currentTarget.style.borderColor = "var(--border-primary, #cbd5e1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
          e.currentTarget.style.borderColor = "var(--border-secondary, #e2e8f0)";
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "#e0f2fe", // Light blue
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileText size={20} color="#0284c7" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary, #1e293b)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: 1.2,
              }}
            >
              {title || "Canvas Document"}
            </h4>
            <div style={{ fontSize: 12, color: "var(--text-muted, #64748b)", marginTop: 2 }}>
              Canvas {isPublic ? "• Public Share" : ""}
            </div>
          </div>
        </div>

        {/* Preview supplied by the shared document, when available. */}
        <div style={{ padding: "0 16px 16px" }}>
          {previewText ? <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted, #64748b)', overflowWrap: 'anywhere' }}>{previewText}</p> :
          <div
            style={{
              border: "1px solid var(--border-secondary, #e2e8f0)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", borderBottom: "1px solid var(--border-secondary, #e2e8f0)" }}>
              <div style={{ flex: 1, height: 24, borderRight: "1px solid var(--border-secondary, #e2e8f0)" }} />
              <div style={{ flex: 1, height: 24 }} />
            </div>
            <div style={{ display: "flex" }}>
              <div style={{ flex: 1, height: 24, borderRight: "1px solid var(--border-secondary, #e2e8f0)" }} />
              <div style={{ flex: 1, height: 24 }} />
            </div>
          </div>
          }
        </div>
      </div>


    </div>
  );
}
