import { useState, useEffect } from "react";
import {
  File,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Archive,
  Table2,
  Download,
} from "lucide-react";
import { openPreview } from "../../services/previewService";
import { handleDownload as downloadFile } from "../../utils/handleDownload";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return a Lucide icon component and accent colour for a given MIME type.
 */
/** Map verbose MIME subtypes to short friendly labels; truncate anything else. */
const MIME_LABELS = {
  // documents
  "vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "vnd.ms-excel": "xls",
  "vnd.ms-powerpoint": "ppt",
  "vnd.oasis.opendocument.text": "odt",
  "vnd.oasis.opendocument.spreadsheet": "ods",
  // archives
  "x-zip-compressed": "zip",
  "x-rar-compressed": "rar",
  "x-7z-compressed": "7z",
  "x-tar": "tar",
  // images
  "svg+xml": "svg",
  "vnd.adobe.photoshop": "psd",
  // audio / video
  "mpeg": "mp3",
  "x-matroska": "mkv",
  "quicktime": "mov",
};

function getMimeLabel(mimeType = "") {
  const [, subtype = ""] = mimeType.toLowerCase().split("/");
  const base = subtype.split("+")[0];
  if (MIME_LABELS[base]) return MIME_LABELS[base];
  // Truncate long subtypes so the badge never overflows
  return base.length > 20 ? base.slice(0, 20) + "…" : base || mimeType.split("/")[0] || "file";
}

function getMimeIcon(mimeType = "") {
  const m = mimeType.toLowerCase();
  if (m.startsWith("image/")) return { Icon: ImageIcon, color: "#4ade80" };
  if (m.startsWith("video/")) return { Icon: Video, color: "#60a5fa" };
  if (m.startsWith("audio/")) return { Icon: Music, color: "#a78bfa" };
  if (m === "application/pdf") return { Icon: FileText, color: "#f87171" };
  if (
    m === "application/zip" ||
    m === "application/x-zip-compressed" ||
    m === "application/x-rar-compressed" ||
    m === "application/vnd.rar" ||
    m === "application/x-7z-compressed"
  )
    return { Icon: Archive, color: "#fb923c" };
  if (
    m === "application/msword" ||
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return { Icon: FileText, color: "#3b82f6" };
  if (
    m === "application/vnd.ms-excel" ||
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return { Icon: Table2, color: "#22c55e" };
  if (
    m === "application/vnd.ms-powerpoint" ||
    m === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  )
    return { Icon: FileText, color: "#f59e0b" };
  if (m.startsWith("text/")) return { Icon: FileText, color: "#94a3b8" };
  return { Icon: File, color: "#94a3b8" };
}

/** Format byte count to human-readable KB/MB/GB */
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Truncate a filename keeping the extension visible */
function truncateFilename(name = "", maxLen = 32) {
  if (name.length <= maxLen) return name;
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx > 0 && name.length - dotIdx <= 8) {
    const ext = name.slice(dotIdx);
    const base = name.slice(0, maxLen - ext.length - 1);
    return `${base}…${ext}`;
  }
  return `${name.slice(0, maxLen)}…`;
}

// ─── Single attachment row ────────────────────────────────────────────────────

function AttachmentRow({ attachment, compact, allAttachments = [] }) {
  // Define these up-front (even if attachment is null) so hooks keep stable order
  const name = attachment?.originalName || attachment?.fileName || "Attachment";
  const mimeType = attachment?.mimeType || "";
  const fileUrl = attachment?.url || attachment?.secureUrl || null;
  const thumbUrl = attachment?.thumbnailUrl || null;
  const size = attachment?.fileSize ?? null;
  const { Icon, color } = getMimeIcon(mimeType);
  const isImage = mimeType.startsWith("image/");

  const [imgError, setImgError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(thumbUrl || fileUrl || null);

  useEffect(() => {
    setImgError(false);
    setCurrentSrc(thumbUrl || fileUrl || null);
  }, [thumbUrl, fileUrl]);

  if (!attachment) return null;

  const showThumb = isImage && currentSrc && !imgError;

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPreview(attachment, allAttachments);
  };

  const handleDownloadClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    downloadFile(attachment);
  };

  return (
    <div
        className="pac-row"
        onClick={handleClick}
        title={name}
        aria-label={`Preview ${name}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleClick(e)}
      >
        {/* Thumbnail or icon */}
        {showThumb ? (
          <img
            className="pac-thumb"
            src={currentSrc}
            alt={name}
            loading="lazy"
            onError={() => {
              if (currentSrc && thumbUrl && currentSrc === thumbUrl && fileUrl) {
                setCurrentSrc(fileUrl);
                return;
              }
              setImgError(true);
            }}
          />
        ) : (
          <div className="pac-icon" style={{ "--icon-color": color }}>
            <Icon size={16} style={{ color }} strokeWidth={1.8} />
          </div>
        )}

        {/* Name + metadata */}
        <div className="pac-meta">
          <span className="pac-name" title={name}>
            {compact ? truncateFilename(name, 24) : truncateFilename(name, 38)}
          </span>
          <div className="pac-info">
            {mimeType && (
              <span className="pac-ext" title={mimeType}>
                {getMimeLabel(mimeType)}
              </span>
            )}
            {size !== null && <span className="pac-size">{formatSize(size)}</span>}
          </div>
        </div>

        {/* Actions */}
        {fileUrl && (
          <div className="pac-action">
            <button
              type="button"
              className="pac-action-btn"
              title="Download"
              aria-label="Download attachment"
              onClick={handleDownloadClick}
            >
              <Download size={13} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * PinnedAttachmentCard
 *
 * Renders one or more attachment rows inside a pinned message card.
 *
 * @param {{ attachments: object[], compact?: boolean }} props
 *   - attachments: array of attachment objects from the Message model
 *   - compact:     if true, uses shorter filename truncation (for PinnedBar)
 */
export default function PinnedAttachmentCard({ attachments = [], compact = false }) {
  if (!attachments || attachments.length === 0) return null;

  // Filter out any null/corrupted entries — require at minimum a URL
  const valid = attachments.filter(
    (a) => a && (a.url || a.secureUrl)
  );

  if (valid.length === 0) return null;

  return (
    <>
      <style>{`
        .pac-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 9px;
          border-radius: 8px;
          border: 1px solid var(--border-color, var(--border-primary));
          background: var(--surface-tertiary, var(--bg-primary));
          min-width: 0;
          max-width: 100%;
          text-decoration: none;
          color: inherit;
          cursor: pointer;
          transition: border-color 130ms ease, background 130ms ease;
        }
        .pac-row:hover {
          border-color: color-mix(in srgb, var(--accent-color, var(--accent-primary)) 30%, var(--border-color));
          background: var(--surface-secondary, var(--bg-secondary));
        }
        .pac-thumb {
          width: 34px;
          height: 34px;
          border-radius: 6px;
          object-fit: cover;
          flex-shrink: 0;
          background: var(--surface-hover, var(--bg-hover));
        }
        .pac-icon {
          width: 34px;
          height: 34px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: color-mix(in srgb, var(--icon-color, #94a3b8) 12%, transparent);
        }
        .pac-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .pac-name {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.3;
          max-width: 100%;
        }
        .pac-info {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 2px;
        }
        .pac-ext {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          background: var(--surface-hover, var(--bg-hover));
          border-radius: 3px;
          padding: 1px 4px;
          line-height: 1.4;
          max-width: 80px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: inline-block;
        }
        .pac-size {
          font-size: 10.5px;
          color: var(--text-muted);
        }
        .pac-action {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-left: auto;
          flex-shrink: 0;
          opacity: 0;
          transition: opacity 130ms ease;
        }
        .pac-row:hover .pac-action { opacity: 1; }
        .pac-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0;
          text-decoration: none;
          transition: background 130ms ease, color 130ms ease;
        }
        .pac-action-btn:hover {
          background: var(--surface-hover, var(--bg-hover));
          color: var(--text-primary);
        }
      `}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 5,
          marginTop: 4,
        }}
      >
      {valid.map((attachment, i) => (
        <AttachmentRow
          key={attachment._id || attachment.url || i}
          attachment={attachment}
          compact={compact}
          allAttachments={valid}
        />
      ))}
      </div>
    </>
  );
}

// ─── Named helper exports (used by PinnedBar preview) ───────────────────────

/** Return a human-readable label for the first attachment in a message. */
export function getAttachmentPreviewLabel(attachments = []) {
  if (!attachments || attachments.length === 0) return null;
  const first = attachments.find((a) => a && (a.originalName || a.fileName));
  if (!first) return null;
  return first.originalName || first.fileName;
}

/** Return the thumbnail URL for the first image attachment, or null. */
export function getAttachmentThumbnailUrl(attachments = []) {
  if (!attachments || attachments.length === 0) return null;
  const first = attachments.find(
    (a) => a && a.mimeType?.startsWith("image/") && a.thumbnailUrl
  );
  return first?.thumbnailUrl || null;
}
