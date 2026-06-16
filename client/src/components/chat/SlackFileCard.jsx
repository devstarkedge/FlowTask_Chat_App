import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileArchive,
  FileCode,
  File,
  Table2,
  Forward,
  Info,
  X,
  Calendar,
  User,
  HardDrive,
  FileType,
  ArrowDownToLine,
  Send,
} from "lucide-react";
import { handleDownload } from "../../utils/handleDownload";
import { messageAPI } from "../../services/api";
import logger from "../../utils/logger";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileKind(mime = "", name = "") {
  const ext = getFileExtension(name);
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (/^(doc|docx)$/.test(ext) || mime?.includes("word") || mime?.includes("msword")) return "word";
  if (/^(xls|xlsx)$/.test(ext) || mime?.includes("excel") || mime?.includes("spreadsheet")) return "spreadsheet";
  if (/^(ppt|pptx)$/.test(ext) || mime?.includes("presentation") || mime?.includes("powerpoint")) return "presentation";
  if (ext === 'csv') return 'csv';
  if (mime?.startsWith("text/")) return "code";
  if (mime?.includes("json") || mime?.includes("xml")) return "code";
  return "file";
}

function getFileExtension(name = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return ext !== name.toLowerCase() ? ext : "";
}

function getLanguageLabel(ext) {
  const map = {
    js: "JavaScript", ts: "TypeScript", py: "Python", java: "Java",
    c: "C", cpp: "C++", json: "JSON", xml: "XML", html: "HTML",
    css: "CSS", scss: "SCSS", sql: "SQL", yaml: "YAML", md: "Markdown",
    txt: "Plain Text", csv: "CSV", env: "Environment",
  };
  return map[ext] || ext.toUpperCase();
}

function KindIcon({ kind, size = 18 }) {
  if (kind === "image")
    return <ImageIcon size={size} style={{ color: "var(--accent-primary)" }} />;
  if (kind === "video")
    return <Film size={size} style={{ color: "var(--accent-purple)" }} />;
  if (kind === "audio")
    return <Music size={size} style={{ color: "var(--accent-green)" }} />;
  if (kind === "archive")
    return <FileArchive size={size} style={{ color: "var(--accent-orange)" }} />;
  if (kind === "code" || kind === "text")
    return <FileCode size={size} style={{ color: "var(--accent-green)" }} />;
  if (kind === "csv" || kind === "spreadsheet")
    return <Table2 size={size} style={{ color: "var(--accent-green)" }} />;
  if (kind === "pdf")
    return <FileText size={size} style={{ color: "var(--accent-red)" }} />;
  if (kind === "word")
    return <FileText size={size} style={{ color: "var(--accent-primary)" }} />;
  if (kind === "presentation")
    return <FileText size={size} style={{ color: "var(--accent-yellow)" }} />;
  return <File size={size} style={{ color: "var(--text-muted)" }} />;
}

// ─── Color map for kind badges ────────────────────────────────────────────────

function getKindColor(kind) {
  const colors = {
    image: "var(--accent-primary)",
    video: "#a855f7",
    audio: "#22c55e",
    archive: "#ea580c",
    code: "#059669",
    text: "#059669",
    csv: "#22c55e",
    spreadsheet: "#22c55e",
    pdf: "#ef4444",
    word: "#3b82f6",
    presentation: "#f59e0b",
    file: "var(--text-muted)",
  };
  return colors[kind] || "var(--text-muted)";
}

// ─── Hover Actions Bar (shared across all card types) ─────────────────────────

function HoverActionsBar({ file, onOpen, onForward, onShowDetails }) {
  return (
    <div
      className="sfc-hover-actions"
      style={{
        display: "flex", alignItems: "center", gap: 2,
        position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
        opacity: 0, transition: "opacity 150ms ease",
        background: "var(--bg-secondary, #222529)",
        border: "1px solid var(--border-primary, rgba(255,255,255,0.1))",
        borderRadius: 8, padding: "3px 4px", zIndex: 2,
      }}
    >
      <button
        className="sfc-mini-action"
        onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
        title="Download" aria-label="Download"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "4px", borderRadius: 4, display: "flex", alignItems: "center" }}
      >
        <Download size={14} />
      </button>
      {onForward && (
        <button
          className="sfc-mini-action"
          onClick={(e) => { e.stopPropagation(); onForward(file); }}
          title="Forward" aria-label="Forward"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "4px", borderRadius: 4, display: "flex", alignItems: "center" }}
        >
          <Forward size={14} />
        </button>
      )}
      <button
        className="sfc-mini-action"
        onClick={(e) => { e.stopPropagation(); onShowDetails?.(); }}
        title="File Details" aria-label="File Details"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "4px", borderRadius: 4, display: "flex", alignItems: "center" }}
      >
        <Info size={14} />
      </button>
    </div>
  );
}

// ─── File Details Modal (Portal-based, fetches full metadata from API) ────────
// Previews and content are ONLY shown inside this modal, never in the message
// list itself.

function FileDetailsModal({ file, onClose, onForward }) {
  const [details, setDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const assetId = file?._id || file?.fileId || file?.assetId || null;
  const name = file.originalName || file.fileName || file.name || "File";
  const ext = getFileExtension(name);
  const mime = file.mimeType || file.type || "";
  const kind = getFileKind(mime, name);
  const size = formatFileSize(file.fileSize || file.size || file.fileSizeBytes || 0);
  const url = file.secureUrl || file.url || "";

  // Fetch full file details from API
  useEffect(() => {
    if (!assetId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    messageAPI.getFileDetails(assetId)
      .then(({ data }) => {
        if (!cancelled) setDetails(data.data || data);
      })
      .catch((err) => {
        logger.error("Failed to fetch file details:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [assetId]);

  const uploadedBy = details?.uploadedBy?.name || file.uploadedBy?.name || file.referencedBy?.name || "Unknown";
  const uploadedAvatar = details?.uploadedBy?.avatar || file.uploadedBy?.avatar || null;
  const createdAt = details?.createdAt || file.createdAt
    ? new Date(details?.createdAt || file.createdAt).toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "N/A";
  const updatedAt = details?.updatedAt
    ? new Date(details.updatedAt).toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;
  const downloadCount = details?.downloadCount ?? 0;
  const forwardCount = details?.forwardCount ?? 0;
  const proxyUrl = assetId ? messageAPI.getFileProxyUrl(assetId) : null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10001,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "fm-overlay-in 0.18s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: 440, margin: "0 1rem",
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          background: "var(--bg-secondary, #1e1f24)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16, overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.05) inset",
          animation: "fm-modal-in 0.22s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KindIcon kind={kind} size={18} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-white, #f1f1f1)" }}>
              File Details
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-muted)", padding: 4, borderRadius: 8,
              display: "flex", alignItems: "center", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0" }}>
          {/* Preview for images — ONLY inside File Details modal */}
          {kind === "image" && url && (
            <div style={{ padding: "12px 20px" }}>
              <img
                src={proxyUrl || url}
                alt={name}
                style={{
                  width: "100%", maxHeight: 220, objectFit: "contain",
                  borderRadius: 10, background: "rgba(0,0,0,0.2)",
                  display: "block",
                }}
              />
            </div>
          )}

          {/* Preview for video — ONLY inside File Details modal */}
          {kind === "video" && url && (
            <div style={{ padding: "12px 20px" }}>
              <video
                src={proxyUrl || url}
                controls
                preload="metadata"
                poster={file.thumbnailUrl || undefined}
                style={{
                  width: "100%", maxHeight: 220, borderRadius: 10,
                  background: "#000", display: "block",
                }}
              />
            </div>
          )}

          {/* Preview for audio — ONLY inside File Details modal */}
          {kind === "audio" && url && (
            <div style={{ padding: "12px 20px" }}>
              <audio
                src={proxyUrl || url}
                controls
                preload="metadata"
                style={{ width: "100%", display: "block" }}
              />
            </div>
          )}

          {/* Preview for PDF (inline via proxy) */}
          {kind === "pdf" && proxyUrl && (
            <div style={{ padding: "12px 20px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "14px 16px", borderRadius: 10,
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.15)",
              }}>
                <FileText size={22} style={{ color: "#ef4444", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>PDF Document • {size}</div>
                </div>
              </div>
            </div>
          )}

          {/* Details rows */}
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <DetailRow icon={<File size={14} />} label="File Name" value={name} />
            {ext && <DetailRow icon={<FileType size={14} />} label="Type" value={`${ext.toUpperCase()}${mime ? ` (${mime})` : ""}`} />}
            <DetailRow icon={<HardDrive size={14} />} label="Size" value={size || "Unknown"} />

            {/* Uploader */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }}><User size={14} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Uploaded By</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {uploadedAvatar && (
                    <img src={uploadedAvatar} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
                  )}
                  <span style={{ fontSize: 13, color: "var(--text-primary, #ddd)" }}>{uploadedBy}</span>
                </div>
              </div>
            </div>

            <DetailRow icon={<Calendar size={14} />} label="Uploaded" value={createdAt} />
            {updatedAt && updatedAt !== createdAt && (
              <DetailRow icon={<Calendar size={14} />} label="Last Modified" value={updatedAt} />
            )}

            {/* Counts */}
            <div style={{
              display: "flex", gap: 12, marginTop: 4,
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <CountBadge icon={<ArrowDownToLine size={13} />} label="Downloads" count={downloadCount} />
              <CountBadge icon={<Send size={13} />} label="Forwards" count={forwardCount} />
            </div>

            {isLoading && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "4px 0" }}>
                Loading details...
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", justifyContent: "flex-end", gap: 8,
          flexShrink: 0,
        }}>
          {onForward && (
            <button
              onClick={() => { onForward(file); onClose(); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.06)", color: "var(--text-primary, #ddd)",
                fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
            >
              <Forward size={14} /> Forward
            </button>
          )}
          <button
            onClick={() => handleDownload(file)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8, border: "none",
              background: "var(--accent-primary, #5865f2)", color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-primary-hover, #4752c4)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent-primary, #5865f2)"}
          >
            <Download size={14} /> Download
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CountBadge({ icon, label, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-white, #f1f1f1)", lineHeight: 1 }}>{count}</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
        <div style={{
          fontSize: 13, color: "var(--text-primary, #ddd)",
          wordBreak: "break-all", lineHeight: 1.4,
        }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Generic File Card (for ALL file types in the message list) ──────────────
// No previews, no thumbnails, no content rendering.
// Only filename, type badge, size, download, forward, and info buttons.
//
// Click behavior:
//   - Card click  → onOpen (opens FilePreviewModal for actual preview)
//   - Info button → opens FileDetailsModal (metadata panel with previews)

function FileCardGeneric({ file, onOpen, onForward, kind }) {
  const name = file.originalName || file.fileName || file.name || "File";
  const size = file.fileSize || file.size || file.fileSizeBytes;
  const ext = getFileExtension(name);
  const color = getKindColor(kind);
  const [showDetails, setShowDetails] = useState(false);

  const handleCardClick = useCallback(() => {
    // Open File Preview Modal (actual file preview: image viewer, video player, etc.)
    onOpen?.(file);
  }, [onOpen, file]);

  const handleInfoClick = useCallback(() => {
    // Open File Details panel (metadata: filename, size, owner, etc.)
    setShowDetails(true);
  }, []);

  return (
    <>
      <div
        className="sfc-generic-card"
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") handleCardClick(); }}
        style={{ position: "relative", cursor: "pointer" }}
      >
        <div className="sfc-generic-icon" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
          <KindIcon kind={kind} size={22} />
        </div>
        <div className="sfc-generic-info">
          <p className="sfc-generic-name" title={name}>{name}</p>
          <div className="sfc-generic-meta-row">
            {ext && (
              <span className="sfc-generic-ext-badge" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                {ext.toUpperCase()}
              </span>
            )}
            {size > 0 && <span className="sfc-generic-size">{formatFileSize(size)}</span>}
          </div>
        </div>
        <HoverActionsBar file={file} onForward={onForward} onShowDetails={handleInfoClick} />
        {/* Fallback download button for non-hover contexts */}
        <button
          className="sfc-mini-download"
          onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
          title="Download" aria-label="Download"
        >
          <Download size={14} />
        </button>
      </div>
      {showDetails && <FileDetailsModal file={file} onClose={() => setShowDetails(false)} onForward={onForward} />}
    </>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
// ALL file types render as attachment cards only in the message list.
// No previews, no inline content, no auto-loading media.
// Card click → opens FilePreviewModal (actual preview).
// Info button → opens FileDetailsModal (metadata panel with previews).

export default function SlackFileCard({ file, onOpen, onDownload, onForward, compact = false, isSingle = false }) {
  if (!file) return null;
  const name = file.originalName || file.fileName || file.name || "File";
  const mime = file.mimeType || file.type || "";
  const kind = getFileKind(mime, name);

  // All file types render as attachment cards only.
  // Card click → onOpen (FilePreviewModal)
  // Info button → FileDetailsModal (metadata + previews)
  return <FileCardGeneric file={file} onOpen={onOpen} onForward={onForward} kind={kind} />;
}

// Re-export helpers for reuse
export { getFileKind, KindIcon, formatFileSize, getKindColor, getFileExtension, getLanguageLabel };