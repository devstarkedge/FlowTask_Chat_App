import React from "react";
import { FileText, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function CanvasDocumentCard({ url, canvasId, token, isPublic }) {
  const navigate = useNavigate();

  const handleOpen = () => {
    if (isPublic) {
      window.open(url, "_blank");
    } else {
      navigate(`/canvas/${canvasId}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "4px 0" }}>
      {/* Premium Slack-like Canvas Card */}
      <div
        onClick={handleOpen}
        role="button"
        tabIndex={0}
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
              Canvas Document
            </h4>
            <div style={{ fontSize: 12, color: "var(--text-muted, #64748b)", marginTop: 2 }}>
              Canvas {isPublic ? "• Public Share" : ""}
            </div>
          </div>
        </div>

        {/* Mock Body Preview (mimicking the grid/content in the user's screenshot) */}
        <div style={{ padding: "0 16px 16px" }}>
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
        </div>
      </div>

      {/* Raw Link Below */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: 13,
          color: "var(--text-link, #2563eb)",
          textDecoration: "underline",
          wordBreak: "break-all",
          display: "inline-block",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    </div>
  );
}
