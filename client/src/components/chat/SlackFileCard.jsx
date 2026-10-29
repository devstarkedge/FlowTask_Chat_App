import { useLiveProfileData } from '../../hooks/useLiveProfileData';
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
import { messageAPI, resolveFullUrl } from "../../services/api";
import logger from "../../utils/logger";
import FilePreviewRenderer from "./FilePreviewRenderer";
import { getSafeFileUrl, getFileAssetId, getFileUrl } from "../../utils/fileProxy";

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
    video: "var(--accent-purple)",
    audio: "var(--accent-green)",
    archive: "var(--accent-orange)",
    code: "var(--accent-green)",
    text: "var(--accent-green)",
    csv: "var(--accent-green)",
    spreadsheet: "var(--accent-green)",
    pdf: "var(--accent-red)",
    word: "var(--accent-primary)",
    presentation: "var(--accent-yellow)",
    file: "var(--text-muted)",
  };
  return colors[kind] || "var(--text-muted)";
}

// ─── Hover Actions Bar (shared across all card types) ─────────────────────────

function HoverActionsBar({ file, onOpen, onForward, onShowDetails, style }) {
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
        ...style,
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
  file = useLiveProfileData(file);
  const [storedDetails, setDetails] = useState(null);
  const details = useLiveProfileData(storedDetails);
  const [isLoading, setIsLoading] = useState(true);

  const assetId = file?._id || file?.fileId || file?.assetId || null;
  const name = file.originalName || file.fileName || file.name || "File";
  const ext = getFileExtension(name);
  const mime = file.mimeType || file.type || "";
  const kind = getFileKind(mime, name);
  const size = formatFileSize(file.fileSize || file.size || file.fileSizeBytes || 0);
  const detailsPreviewKinds = new Set(["image", "video", "audio", "pdf", "word", "spreadsheet", "csv", "code", "text"]);

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
          {detailsPreviewKinds.has(kind) && (
            <div style={{ padding: "12px 20px" }}>
              <div style={{
                height: kind === "image" || kind === "video" || kind === "audio" ? 220 : 280,
                borderRadius: 10,
                overflow: "hidden",
                background: "var(--bg-primary)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <FilePreviewRenderer
                  file={file}
                  variant="details"
                  onDownload={handleDownload}
                />
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
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{uploadedBy}</span>
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
              background: "var(--accent-primary)", color: "var(--text-white)",
              fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-primary-hover, var(--accent-primary))"}
            onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent-primary)"}
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

      {cardContextMenu && (
        <div
          style={{
            position: "fixed",
            left: cardContextMenu.x,
            top: cardContextMenu.y,
            zIndex: 10050,
            background: "var(--bg-secondary, #222529)",
            border: "1px solid var(--border-primary, rgba(255, 255, 255, 0.15))",
            borderRadius: 8,
            padding: "4px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.65)",
            minWidth: 165,
            backdropFilter: "blur(8px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "7px 10px",
              background: "transparent",
              border: "none",
              borderRadius: 6,
              color: "var(--text-primary, #ffffff)",
              fontSize: 13,
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover, rgba(255, 255, 255, 0.1))")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={async () => {
              setCardContextMenu(null);
              await copyImageToClipboard(imageUrl);
            }}
          >
            <Copy size={15} />
            <span>Copy Image</span>
          </button>
          <button
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "7px 10px",
              background: "transparent",
              border: "none",
              borderRadius: 6,
              color: "var(--text-primary, #ffffff)",
              fontSize: 13,
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover, rgba(255, 255, 255, 0.1))")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={() => {
              setCardContextMenu(null);
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(imageUrl);
                toast.success("Image link copied to clipboard");
              }
            }}
          >
            <ExternalLink size={15} />
            <span>Copy Link</span>
          </button>
          <div style={{ height: 1, background: "var(--border-subtle, rgba(255, 255, 255, 0.1))", margin: "4px 0" }} />
          <button
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "7px 10px",
              background: "transparent",
              border: "none",
              borderRadius: 6,
              color: "var(--text-primary, #ffffff)",
              fontSize: 13,
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover, rgba(255, 255, 255, 0.1))")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={() => {
              setCardContextMenu(null);
              handleDownload(file);
            }}
          >
            <Download size={15} />
            <span>Download</span>
          </button>
        </div>
      )}
    </>
  );
}

// ─── Thumbnail & Preview Cards ────────────────────────────────────────────────

function getImageSource(file) {
  if (!file) return "";
  // Direct Cloudinary or HTTP image URL - ALWAYS prefer direct CDN URL for <img> tags
  const direct =
    (file.thumbnailUrl && !file.thumbnailUrl.includes('/proxy') ? file.thumbnailUrl : null) ||
    (file.secureUrl && !file.secureUrl.includes('/proxy') ? file.secureUrl : null) ||
    (file.url && !file.url.includes('/proxy') ? file.url : null) ||
    file.preview ||
    file.localPreviewUri ||
    file.thumbnailUrl ||
    file.secureUrl ||
    file.url ||
    "";
  if (!direct) return "";
  return resolveFullUrl(direct);
}

function ImageThumbnailCard({ file, onOpen, onForward }) {
  const [imageError, setImageError] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [cardContextMenu, setCardContextMenu] = useState(null);

  useEffect(() => {
    if (!cardContextMenu) return;
    const handleClose = () => setCardContextMenu(null);
    window.addEventListener("click", handleClose);
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") handleClose(); });
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("keydown", handleClose);
    };
  }, [cardContextMenu]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 175;
    const menuHeight = 150;
    const x = e.clientX + menuWidth > window.innerWidth ? Math.max(8, window.innerWidth - menuWidth - 8) : e.clientX;
    const y = e.clientY + menuHeight > window.innerHeight ? Math.max(8, window.innerHeight - menuHeight - 8) : e.clientY;
    setCardContextMenu({ x, y });
  }, []);
  const name = file.originalName || file.fileName || file.name || "Image";
  const size = file.fileSize || file.size || file.fileSizeBytes;
  const imageUrl = getImageSource(file);

  const handleCardClick = useCallback(() => {
    onOpen?.(file);
  }, [onOpen, file]);

  const handleInfoClick = useCallback(() => {
    setShowDetails(true);
  }, []);

  if (imageError || !imageUrl) {
    return <FileCardGeneric file={file} onOpen={onOpen} onForward={onForward} kind="image" />;
  }

  return (
    <>
      <div
        className="sfc-image-card group"
        onClick={handleCardClick}
        onContextMenu={handleContextMenu}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") handleCardClick(); }}
        style={{
          position: "relative",
          cursor: "pointer",
          borderRadius: "var(--radius-lg, 12px)",
          overflow: "hidden",
          border: "1px solid var(--border-secondary, rgba(255,255,255,0.1))",
          maxWidth: "340px",
          maxHeight: "260px",
          minWidth: "140px",
          minHeight: "100px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-secondary, #1a1d21)",
          transition: "border-color 130ms ease",
        }}
      >
        <img
          src={imageUrl}
          alt={name}
          onError={(e) => {
            logger.warn("[SlackFileCard] Image failed to load:", imageUrl);
            setImageError(true);
          }}
          style={{
            maxWidth: "100%",
            maxHeight: "260px",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            display: "block",
            borderRadius: "var(--radius-lg, 12px)",
          }}
          loading="lazy"
        />

        {/* Hover overlay with actions and info */}
        <div
          className="sfc-image-overlay"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.6) 100%)",
            opacity: 0,
            transition: "opacity 150ms ease",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "8px",
            pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", pointerEvents: "auto" }}>
            <HoverActionsBar file={file} onForward={onForward} onShowDetails={handleInfoClick} style={{ position: "static", transform: "none", opacity: 1 }} />
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#fff",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
          }}>
            {name} {size > 0 && `• ${formatFileSize(size)}`}
          </div>
        </div>
      </div>
      {showDetails && <FileDetailsModal file={file} onClose={() => setShowDetails(false)} onForward={onForward} />}
    </>
  );
}

function VideoThumbnailCard({ file, onOpen, onForward }) {
  const [showDetails, setShowDetails] = useState(false);
  const name = file.originalName || file.fileName || file.name || "Video";
  const size = file.fileSize || file.size || file.fileSizeBytes;
  const rawUrl =
    (file.secureUrl && !file.secureUrl.includes('/proxy') ? file.secureUrl : null) ||
    (file.url && !file.url.includes('/proxy') ? file.url : null) ||
    file.preview ||
    file.secureUrl ||
    file.url ||
    "";
  const videoUrl = resolveFullUrl(rawUrl);
  const posterUrl = file.thumbnailUrl && !file.thumbnailUrl.includes('/proxy') ? resolveFullUrl(file.thumbnailUrl) : undefined;

  const handleCardClick = useCallback(() => {
    onOpen?.(file);
  }, [onOpen, file]);

  const handleInfoClick = useCallback(() => {
    setShowDetails(true);
  }, []);

  return (
    <>
      <div
        className="sfc-video-card group"
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") handleCardClick(); }}
        style={{
          position: "relative",
          cursor: "pointer",
          borderRadius: "var(--radius-lg, 12px)",
          overflow: "hidden",
          border: "1px solid var(--border-secondary, rgba(255,255,255,0.1))",
          maxWidth: "340px",
          width: "280px",
          height: "190px",
          backgroundColor: "#000",
          display: "inline-block",
          transition: "border-color 130ms ease",
        }}
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <video
            src={videoUrl}
            preload="metadata"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}

        {/* Center Play Button Overlay */}
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}>
            <Film size={22} />
          </div>
        </div>

        {/* Hover overlay with actions and info */}
        <div
          className="sfc-video-overlay"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.6) 100%)",
            opacity: 0,
            transition: "opacity 150ms ease",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "8px",
            pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", pointerEvents: "auto" }}>
            <HoverActionsBar file={file} onForward={onForward} onShowDetails={handleInfoClick} style={{ position: "static", transform: "none", opacity: 1 }} />
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#fff",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
          }}>
            {name} {size > 0 && `• ${formatFileSize(size)}`}
          </div>
        </div>
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
  if (kind === "image") {
    return <ImageThumbnailCard file={file} onOpen={onOpen} onForward={onForward} />;
  }

  if (kind === "video") {
    return <VideoThumbnailCard file={file} onOpen={onOpen} onForward={onForward} />;
  }

  return <FileCardGeneric file={file} onOpen={onOpen} onForward={onForward} kind={kind} />;
}

// Re-export helpers for reuse
export { getFileKind, KindIcon, formatFileSize, getKindColor, getFileExtension, getLanguageLabel };
