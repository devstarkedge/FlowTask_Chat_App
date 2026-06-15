import { createPortal } from "react-dom";
import { useDownloadStore } from "../../stores/downloadStore";
import { useEffect, useState, useRef } from "react";
import { fileAPI, messageAPI } from "../../services/api";
import { getFileUrl } from "../../utils/fileProxy";
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
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getChannelPath,
  getDMPath,
  getThreadPath,
} from "../../utils/chatRoutes";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChatStore } from "../../stores/chatStore";
import "./custom-css/DownloadModal.css";
import { openPreview } from "../../services/previewService";
import toast from "react-hot-toast";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";

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

function FileIcon({ name, mime, size = 16, thumbnailUrl, fileUrl }) {
  const type = getFileType(name, mime);
  const { bg, border, color, Icon } = FILE_ICON_CONFIG[type];
  const [imgError, setImgError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(thumbnailUrl || fileUrl || null);

  // Reset currentSrc when inputs change
  useEffect(() => {
    setImgError(false);
    setCurrentSrc(thumbnailUrl || fileUrl || null);
  }, [thumbnailUrl, fileUrl]);

  // Show thumbnail for images if available
  if (type === "image" && !imgError && (thumbnailUrl || fileUrl)) {
    return (
      <div
        className="dl-file-icon"
        style={{
          background: bg,
          borderColor: border,
          padding: 0,
          overflow: "hidden",
        }}
      >
        <img
          src={currentSrc}
          alt={name || ""}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          onError={() => {
            // If we were showing the thumbnail and a fileUrl exists, try that next
            if (
              currentSrc &&
              thumbnailUrl &&
              currentSrc === thumbnailUrl &&
              fileUrl
            ) {
              setCurrentSrc(fileUrl);
              return;
            }
            // Otherwise both sources failed
            setImgError(true);
          }}
        />
      </div>
    );
  }

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
  const removeDownload = useDownloadStore((s) => s.removeDownload);
  const { confirm: confirmDelete } = useDeleteConfirm();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const overlayRef = useRef(null);
  const navigate = useNavigate();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  // Chat store actions for open-in-chat navigation
  const setScrollToMessageId = useChatStore((s) => s.setScrollToMessageId);
  const setHighlightMessageId = useChatStore((s) => s.setHighlightMessageId);

  const fetchFiles = async () => {
    // const [activeTab, setActiveTab] = useState("recent");
    if (!channelId) return;
    setLoading(true);
    try {
      const res = await fileAPI.listByChannel(channelId, { limit: 50 });
      const items = res.data.data.items || [];
      setFiles(items);
    } catch (err) {
      console.error("[DownloadsModal] Failed to fetch files:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFiles();
      // Debug: log downloads to see what data we have
      console.log(
        "[DownloadsModal] Current downloads:",
        downloads.map((d) => ({
          id: d.id,
          name: d.name,
          channelId: d.channelId,
          messageId: d.messageId,
          contextType: d.contextType,
          workspaceId: d.workspaceId,
          status: d.status,
        })),
      );
    }
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

  /* ── Open in Chat: navigate to original message and highlight it ── */
  const handleOpenInChat = async (file) => {
    if (!file || !file.channelId || !file.messageId) {
      console.warn(
        "[DownloadsModal] Missing channelId or messageId, cannot navigate",
      );
      toast.error(
        "Original message not found. This download may be from an older version.",
      );
      return;
    }

    const ws = file.workspaceId || activeWorkspaceId;

    // Check if message is in current store
    const messages =
      useChatStore.getState().messagesByChannel[file.channelId] || [];
    const messageInStore = messages.find((m) => m._id === file.messageId);

    // If not in store, fetch it from backend
    if (!messageInStore) {
      try {
        console.log(
          "[DownloadsModal] Message not in cache, fetching from backend...",
        );
        const loadingToast = toast.loading("Loading original message...");

        const { data } = await messageAPI.around(
          file.channelId,
          file.messageId,
          { limit: 24 },
        );
        const fetchedMessages = data?.data?.items || [];

        toast.dismiss(loadingToast);

        if (fetchedMessages.length === 0) {
          toast.error("Original message not found");
          return;
        }

        console.log(
          "[DownloadsModal] Successfully fetched message from backend",
        );
      } catch (err) {
        console.error("[DownloadsModal] Failed to fetch message:", err);
        toast.error("Failed to load original message");
        return;
      }
    }

    let path;

    // Determine conversation type from stored metadata
    if (file.contextType === "dm") {
      path = getDMPath(ws, file.channelId, file.messageId);
    } else if (file.contextType === "thread") {
      path = getThreadPath(ws, file.channelId, file.channelId, file.messageId);
    } else {
      // Default to channel path (covers channels and unknown types)
      path = getChannelPath(ws, file.channelId, file.messageId);
    }

    // Close modal FIRST, then navigate
    // The ChatLayout will handle the messageId route and auto-highlight
    onClose();

    // Use setTimeout to ensure modal closes before navigation
    setTimeout(() => {
      navigate(path);
    }, 50);
  };

  /* ── Preview: open file/image preview modal ── */
  const handlePreview = (file) => {
    if (!file) return;
    const url = getFileUrl(file) || file.blobUrl || file.url || file.secureUrl;
    if (!url) return;

    const preview = {
      url,
      blobUrl: file.blobUrl || null,
      remoteUrl: file.url || file.secureUrl || null,
      originalName: file.name,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      _id: file.assetId || file._id,
    };

    const all = downloads
      .slice()
      .reverse()
      .map((f) => ({
        url: getFileUrl(f) || f.blobUrl || f.url || f.secureUrl,
        blobUrl: f.blobUrl || null,
        remoteUrl: f.url || f.secureUrl || null,
        originalName: f.name,
        fileName: f.name,
        mimeType: f.type,
        fileSize: f.size,
        _id: f.assetId || f._id,
      }));

    openPreview(preview, all);
  };

  /* ── Delete: show confirmation dialog then remove ── */
  const handleDeleteRequest = async (file) => {
    const isImage = file.type && file.type.startsWith("image/");

    try {
      removeDownload(file.id);
      toast.success(`${isImage ? "Image" : "File"} removed from downloads`, {
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to remove download:", error);
      toast.error(`Failed to remove ${isImage ? "image" : "file"}`, {
        duration: 5000,
      });
    }
  };

  const handleOpenFile = (file) => {
    if (!file) return;
    const url = getFileUrl(file) || file.blobUrl || file.url || file.secureUrl;
    if (!url) return;
    const preview = {
      url,
      blobUrl: file.blobUrl || null,
      remoteUrl: file.url || file.secureUrl || null,
      originalName: file.name,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      _id: file.assetId || file._id,
    };
    const all = downloads
      .slice()
      .reverse()
      .map((f) => ({
        url: getFileUrl(f) || f.blobUrl || f.url || f.secureUrl,
        blobUrl: f.blobUrl || null,
        remoteUrl: f.url || f.secureUrl || null,
        originalName: f.name,
        fileName: f.name,
        mimeType: f.type,
        fileSize: f.size,
        _id: f.assetId || f._id,
      }));
    openPreview(preview, all);
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
                  .map((file, i) => {
                    // Create a truly unique key using multiple identifiers
                    const uniqueKey = file.id
                      ? `${file.id}-${i}`
                      : `download-${file.assetId || file.url}-${i}-${Date.now()}`;

                    return (
                      <div
                        key={uniqueKey}
                        className="dl-row"
                        style={{ animationDelay: `${i * 0.04}s` }}
                      >
                        {/* FILE THUMBNAIL / ICON - Click to preview */}
                        <div
                          className="dl-file-icon-wrapper"
                          onClick={() => handlePreview(file)}
                          title="Preview"
                          style={{ cursor: "pointer" }}
                        >
                          <FileIcon
                            name={file.name}
                            mime={file.type}
                            thumbnailUrl={file.thumbnailUrl}
                            fileUrl={
                              file.blobUrl ||
                              file.url ||
                              file.secureUrl
                            }
                          />
                        </div>

                        {/* FILE INFO */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="dl-file-name">
                            {file.name || "Unnamed file"}
                          </p>

                          {/* STATUS TEXT */}
                          {file.status === "completed" ? (
                            <div
                              className="dl-file-meta"
                              style={{ cursor: "pointer", color: "#3b82f6" }}
                              onClick={() => handlePreview(file)}
                            ></div>
                          ) : file.status === "downloading" ? (
                            <div className="dl-file-meta">
                              Downloading... {file.progress || 0}%
                            </div>
                          ) : (
                            <div className="dl-file-meta">Failed</div>
                          )}
                        </div>

                        {/* ACTION BUTTONS */}
                        <div style={{ display: "flex", gap: 6 }}>
                          {file.status === "completed" && (
                            <>
                              {/* Open in Chat button - always show, but disable if missing navigation data */}
                              <button
                                className="dl-action-btn"
                                title={
                                  file.channelId && file.messageId
                                    ? "Open in Chat"
                                    : "Original message not found"
                                }
                                aria-label="Open in Chat"
                                disabled={!file.channelId || !file.messageId}
                                style={{
                                  opacity:
                                    !file.channelId || !file.messageId
                                      ? 0.4
                                      : 1,
                                  cursor:
                                    !file.channelId || !file.messageId
                                      ? "not-allowed"
                                      : "pointer",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (file.channelId && file.messageId) {
                                    handleOpenInChat(file);
                                  }
                                }}
                              >
                                <FolderOpen size={14} />
                              </button>
                            </>
                          )}

                          {file.status === "downloading" && (
                            <button
                              className="dl-action-btn downloading"
                              aria-label="Downloading"
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}

                          {/* Delete button */}
                          <button
                            className="dl-action-btn"
                            onClick={() => removeDownload(file.id)}
                            title="Remove"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
