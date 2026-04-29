import { createPortal } from "react-dom";
import { useDownloadStore } from "../../stores/downloadStore";
import { useEffect, useState, useRef } from "react";
import { fileAPI } from "../../services/api";
import {
  X,
  Download,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  Code,
  File,
  Clock,
  FolderOpen,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import "./custom-css/DownloadModal.css";

/* ─────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────── */
function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0,
    value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getFileType(name = "", mime = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (
    /^(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/.test(ext) ||
    mime.startsWith("image/")
  )
    return "image";
  if (/^(mp4|mov|avi|mkv|webm)$/.test(ext) || mime.startsWith("video/"))
    return "video";
  if (/^(mp3|wav|ogg|flac|aac)$/.test(ext) || mime.startsWith("audio/"))
    return "audio";
  if (/^(zip|rar|7z|tar|gz)$/.test(ext)) return "archive";
  if (
    /^(js|ts|jsx|tsx|py|rb|go|java|c|cpp|cs|php|html|css|json|yml|yaml|xml|sh)$/.test(
      ext,
    )
  )
    return "code";
  if (/^(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md)$/.test(ext)) return "doc";
  return "file";
}

const FILE_ICON_CONFIG = {
  image: {
    bg: "color-mix(in srgb, #0891b2 12%, var(--bg-secondary))",
    border: "color-mix(in srgb, #0891b2 25%, var(--border-secondary))",
    color: "#0891b2",
    Icon: Image,
  },
  video: {
    bg: "color-mix(in srgb, #7c3aed 12%, var(--bg-secondary))",
    border: "color-mix(in srgb, #7c3aed 25%, var(--border-secondary))",
    color: "#7c3aed",
    Icon: Film,
  },
  audio: {
    bg: "color-mix(in srgb, #d97706 12%, var(--bg-secondary))",
    border: "color-mix(in srgb, #d97706 25%, var(--border-secondary))",
    color: "#d97706",
    Icon: Music,
  },
  archive: {
    bg: "color-mix(in srgb, #ea580c 12%, var(--bg-secondary))",
    border: "color-mix(in srgb, #ea580c 25%, var(--border-secondary))",
    color: "#ea580c",
    Icon: Archive,
  },
  code: {
    bg: "color-mix(in srgb, #059669 12%, var(--bg-secondary))",
    border: "color-mix(in srgb, #059669 25%, var(--border-secondary))",
    color: "#059669",
    Icon: Code,
  },
  doc: {
    bg: "color-mix(in srgb, #4e7cff 12%, var(--bg-secondary))",
    border: "color-mix(in srgb, #4e7cff 25%, var(--border-secondary))",
    color: "var(--accent-primary)",
    Icon: FileText,
  },
  file: {
    bg: "var(--bg-tertiary)",
    border: "var(--border-secondary)",
    color: "var(--text-muted)",
    Icon: File,
  },
};

function FileIcon({ name, mime, size = 16 }) {
  const type = getFileType(name, mime);
  const { bg, border, color, Icon } = FILE_ICON_CONFIG[type];
  return (
    <div
      className="dl-file-icon"
      style={{ background: bg, borderColor: border }}
    >
      <Icon size={size} color={color} />
    </div>
  );
}

/* need Check icon */
function Check({ size, strokeWidth }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SKELETON ROW
───────────────────────────────────────────────────────────────────────── */
function SkeletonRow() {
  return (
    <div className="dl-skeleton-row">
      <div className="dl-skeleton-icon" />
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}
      >
        <div
          className="dl-skeleton-line"
          style={{ height: 12, width: "60%" }}
        />
        <div className="dl-skeleton-line" style={{ height: 9, width: "35%" }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   EMPTY STATE
───────────────────────────────────────────────────────────────────────── */
function EmptyState({ icon: Icon, title, sub }) {
  return (
    <div className="dl-empty">
      <div className="dl-empty-icon">
        <Icon size={24} style={{ color: "var(--text-muted)" }} />
      </div>
      <p className="dl-empty-title">{title}</p>
      <p className="dl-empty-sub">{sub}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────── */
export default function DownloadsModal({ isOpen, onClose, channelId }) {
  const downloads = useDownloadStore((state) => state.downloads);
  const openFile = (url) => {
    if (!url) return;
    window.open(url, "_blank");
  };
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const overlayRef = useRef(null);

  const fetchFiles = async () => {
    // const [activeTab, setActiveTab] = useState("recent");
    if (!channelId) return;
    setLoading(true);
    try {
      const res = await fileAPI.listByChannel(channelId, { limit: 50 });
      setFiles(res.data.data.items || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchFiles();
  }, [channelId, isOpen]);

  /* close on backdrop click */
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  /* close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchFiles();
    setRefreshing(false);
  };

  /* bulk download trigger */
  const triggerDownload = async (url, name) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const bUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = bUrl;
      a.download = name || "file";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(bUrl);
    } catch {
      /* silent */
    }
  };

  const totalCount = files.length;

  return createPortal(
    <>
      <div className="dl-overlay" ref={overlayRef} onClick={handleOverlayClick}>
        <div
          className="dl-shell"
          style={{ position: "relative" }}
          role="dialog"
          aria-modal="true"
          aria-label="Downloads"
        >
          {/* ══ HEADER ══ */}
          <div className="dl-header">
            <div className="dl-header-left">
              <div className="dl-header-icon">
                <Download size={17} color="#fff" />
              </div>
              <div>
                <p className="dl-title">Downloads</p>
                <p className="dl-subtitle">
                  {downloads.length} file{downloads.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <button
              className="app-topbar__icon"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>

          {/* ══ BODY ══ */}
          <div className="dl-body">
            {downloads.length === 0 ? (
              <EmptyState
                icon={Download}
                title="No downloads yet"
                sub="Files you download will appear here."
              />
            ) : (
              <>
                <p className="dl-section-label">Recent Downloads</p>

                {downloads
                  .slice()
                  .reverse()
                  .map((file, i) => (
                    <div
                      key={file.id || i}
                      className="dl-row"
                      style={{ animationDelay: `${i * 0.04}s` }}
                      onClick={() => openFile(file.url)}
                    >
                      <FileIcon name={file.name} mime={file.type} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="dl-file-name">
                          {file.name || "Unnamed file"}
                        </p>
                        <div className="dl-file-meta">
                          <span>{file.size || "—"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>

          {/* ══ FOOTER ══ */}
          <div className="dl-footer">
            <span>
              {downloads.length} downloaded file
              {downloads.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
