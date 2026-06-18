import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Trash2,
  Video,
  File as FileIcon,
  Search,
  Share2,
  Calendar,
  UserRound,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Play,
  Grid3X3,
  List,
  Filter,
  SortAsc,
  SortDesc,
  Clock,
  HardDrive,
} from "lucide-react";
import { fileAPI } from "../../services/api";
import toast from "react-hot-toast";
import { handleDownload } from "../../utils/handleDownload";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";

/* ─────────────────────────── helpers ───────────────────────────────────── */

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

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getFileKind(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

function getFileExt(fileName = "") {
  return fileName.split(".").pop()?.toUpperCase().slice(0, 4) || "FILE";
}

/* ─────────────────────── persisted state hook ──────────────────────────── */

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {}
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}

/* ─────────────────────────── sub-components ────────────────────────────── */

function KindIcon({ kind, size = 16 }) {
  if (kind === "image")
    return <ImageIcon size={size} style={{ color: "var(--accent-primary)", filter: "brightness(1.1)" }} />;
  if (kind === "video")
    return <Video size={size} style={{ color: "var(--accent-purple)", filter: "brightness(1.1)" }} />;
  return <FileText size={size} style={{ color: "var(--text-primary)", filter: "brightness(1.1)" }} />;
}

function ExtBadge({ fileName, kind }) {
  const colors = {
    image: { bg: "rgba(78,124,255,0.18)", color: "var(--accent-primary)" },
    video: { bg: "rgba(124,58,237,0.18)", color: "var(--accent-purple)" },
    file: { bg: "rgba(100,116,139,0.14)", color: "var(--text-secondary)" },
  };
  const { bg, color } = colors[kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 6px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: bg,
        color,
        fontFamily: "var(--font-mono)",
      }}
    >
      {getFileExt(fileName)}
    </span>
  );
}

function ActionBtn({ title, tone = "neutral", onClick, children, size = 28 }) {
  const [hover, setHover] = useState(false);
  const base = {
    width: size,
    height: size,
    borderRadius: 7,
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 140ms cubic-bezier(0.4,0,0.2,1)",
    transform: hover ? "translateY(-1px) scale(1.06)" : "none",
  };
  const tones = {
    danger: {
      color: "var(--accent-red)",
      background: hover ? "rgba(239,68,68,0.22)" : "rgba(239,68,68,0.12)",
    },
    primary: {
      color: "var(--text-white)",
      background: hover ? "rgba(78,124,255,0.85)" : "var(--accent-primary)",
    },
    neutral: {
      color: "var(--text-primary)",
      background: hover ? "var(--bg-hover)" : "rgba(255,255,255,0.08)",
    },
  };
  return (
    <button
      title={title}
      style={{ ...base, ...tones[tone] }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
  );
}

function Pill({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 12px",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        transition: "all 140ms ease",
        background: active ? "var(--accent-primary)" : "var(--bg-hover)",
        color: active ? "var(--text-white)" : "var(--text-primary)",
        boxShadow: active ? "0 2px 8px rgba(78,124,255,0.25)" : "none",
      }}
    >
      {children}
    </button>
  );
}

/* ─── Media card (photo/video grid) ─────────────────────────────────────── */
function MediaCard({ file, onPreview, onShare, onDownload, onDelete, index }) {
  const kind = getFileKind(file.mimeType);
  const previewSrc = file.thumbnailUrl || file.url;
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid var(--border-secondary)",
        background: "var(--bg-secondary)",
        boxShadow: hover
          ? "0 12px 32px rgba(0,0,0,0.22)"
          : "0 2px 8px rgba(0,0,0,0.08)",
        transform: hover
          ? "translateY(-3px) scale(1.012)"
          : "translateY(0) scale(1)",
        transition: "all 200ms cubic-bezier(0.4,0,0.2,1)",
        animation: `fadeInUp 300ms ${index * 50}ms both`,
        cursor: "pointer",
        flexShrink: 0,
        width: 188,
      }}
    >
      {/* thumbnail */}
      <button
        onClick={() => onPreview?.(file)}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            height: 128,
            background: "var(--bg-input)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {kind === "image" && previewSrc ? (
            <img
              src={previewSrc}
              alt={file.fileName}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: loaded ? 1 : 0,
                transition: "opacity 300ms ease",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                color: "var(--text-muted)",
              }}
            >
              <Video size={22} />
              <span style={{ fontSize: 11 }}>Video</span>
            </div>
          )}
          {/* zoom / play icon on hover */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--bg-hover)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: hover ? 1 : 0,
              transition: "opacity 180ms ease",
            }}
          >
            {kind === "video" ? (
              <Play size={26} style={{ color: "var(--text-white)" }} />
            ) : (
              <ZoomIn size={22} style={{ color: "var(--text-white)" }} />
            )}
          </div>
        </div>
      </button>

      {/* action strip – floats on hover */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          gap: 4,
          opacity: hover ? 1 : 0,
          transform: hover ? "translateY(0)" : "translateY(-4px)",
          transition: "all 180ms ease",
          background: "var(--bg-hover)",
          backdropFilter: "blur(6px)",
          borderRadius: 10,
          padding: "4px 5px",
          border: "1px solid var(--border-secondary)",
        }}
      >
        <ActionBtn
          title="Share"
          onClick={(e) => {
            e.stopPropagation();
            onShare(file);
          }}
        >
          <Share2 size={13} />
        </ActionBtn>
        <ActionBtn title="Download" onClick={() => handleDownload(file)}>
          <Download size={13} />
        </ActionBtn>
        <ActionBtn
          title="Delete"
          tone="danger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(file);
          }}
        >
          <Trash2 size={13} />
        </ActionBtn>
      </div>

      {/* meta */}
      <div style={{ padding: "10px 12px 12px" }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: "-0.01em",
          }}
          title={file.fileName}
        >
          {file.fileName}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginTop: 5,
            color: "var(--text-secondary)",
          }}
        >
          <UserRound size={11} />
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.uploadedBy?.name || "Unknown"}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 500, flexShrink: 0 }}>
            {formatDate(file.uploadedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Document row ───────────────────────────────────────────────────────── */
function DocRow({ file, onPreview, onShare, onDownload, onDelete, index }) {
  const kind = getFileKind(file.mimeType);
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 12,
        border: `1px solid ${hover ? "var(--border-primary)" : "var(--border-secondary)"}`,
        background: hover ? "var(--bg-hover)" : "var(--bg-secondary)",
        transition: "all 160ms cubic-bezier(0.4,0,0.2,1)",
        animation: `fadeInUp 280ms ${index * 40}ms both`,
        cursor: "pointer",
      }}
    >
      {/* icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 2,
          background:
            kind === "image"
              ? "rgba(78,124,255,0.1)"
              : kind === "video"
                ? "rgba(124,58,237,0.1)"
                : "var(--bg-hover)",
        }}
      >
        <KindIcon kind={kind} size={18} />
      </div>

      {/* info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          onClick={() => onPreview?.(file)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-primary)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: "-0.01em",
          }}
        >
          {file.fileName}
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          <ExtBadge fileName={file.fileName} kind={kind} />
          <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 500 }}>
            {formatSize(file.fileSize)}
          </span>
          <span
            style={{
              fontSize: 11.5,
              color: "var(--text-secondary)",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <UserRound size={10} />
            {file.uploadedBy?.name || "Unknown"}
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11.5,
              color: "var(--text-secondary)",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Clock size={10} />
            {formatDate(file.uploadedAt)}
          </span>
        </div>
      </div>

      {/* actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          opacity: hover ? 1 : 0,
          transition: "opacity 160ms ease",
          flexShrink: 0,
        }}
      >
        <ActionBtn title="Share" onClick={() => onShare(file)}>
          <Share2 size={14} />
        </ActionBtn>
        <ActionBtn title="Download" onClick={() => onDownload(file)}>
          <Download size={14} />
        </ActionBtn>
        <ActionBtn title="Delete" tone="danger" onClick={() => onDelete(file)}>
          <Trash2 size={14} />
        </ActionBtn>
      </div>
    </div>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────────── */
function Empty({ query }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "56px 24px",
        gap: 12,
        animation: "fadeInUp 300ms both",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: "var(--bg-hover)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FileIcon
          size={28}
          style={{ color: "var(--text-primary)", filter: "brightness(1.2)" }}
        />
      </div>
      <p
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        {query ? `No files match "${query}"` : "No files shared yet"}
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          margin: 0,
          textAlign: "center",
        }}
      >
        {query
          ? "Try a different search term"
          : "Share a file in the chat to see it here"}
      </p>
    </div>
  );
}

/* ─── Section header ─────────────────────────────────────────────────────── */
function SectionHeader({ title, count, action }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          {title}
        </h3>
        {count > 0 && (
          <span
            style={{
              minWidth: 20,
              height: 20,
              borderRadius: 99,
              padding: "0 6px",
              fontSize: 10.5,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-hover)",
              color: "var(--text-secondary)",
            }}
          >
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

/* ─── Stat pill row ──────────────────────────────────────────────────────── */
function StatBar({ total, images, videos, docs, filter, onFilter }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      <Pill active={filter === "all"} onClick={() => onFilter("all")}>
        All <span style={{ opacity: 0.7 }}>{total}</span>
      </Pill>
      <Pill active={filter === "image"} onClick={() => onFilter("image")}>
        <ImageIcon size={11} /> Photos{" "}
        <span style={{ opacity: 0.7 }}>{images}</span>
      </Pill>
      <Pill active={filter === "video"} onClick={() => onFilter("video")}>
        <Video size={11} /> Videos{" "}
        <span style={{ opacity: 0.7 }}>{videos}</span>
      </Pill>
      <Pill active={filter === "file"} onClick={() => onFilter("file")}>
        <FileText size={11} /> Docs <span style={{ opacity: 0.7 }}>{docs}</span>
      </Pill> 
    </div>
  );
}

/* ─── Skeleton loader ────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        paddingTop: 4,
      }}
    >
      <div>
        <div
          className="skeleton"
          style={{ height: 14, width: 100, borderRadius: 6, marginBottom: 12 }}
        />
        <div style={{ display: "flex", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ width: 188, flexShrink: 0 }}>
              <div
                className="skeleton"
                style={{ height: 128, borderRadius: 12, marginBottom: 8 }}
              />
              <div
                className="skeleton"
                style={{ height: 12, borderRadius: 4, marginBottom: 6 }}
              />
              <div
                className="skeleton"
                style={{ height: 10, borderRadius: 4, width: "70%" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div
          className="skeleton"
          style={{ height: 14, width: 80, borderRadius: 6, marginBottom: 12 }}
        />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 58, borderRadius: 12, marginBottom: 8 }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── main component ────────────────────────────────── */

export default function FilesTab({ channelId, onOpenFilePreview }) {
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useLocalStorage("filesTab:filter", "all"); // all | image | video | file
  const [sort, setSort] = useLocalStorage("filesTab:sort", "date-desc"); // date-desc | date-asc | name | size
  const [viewMode, setViewMode] = useLocalStorage("filesTab:viewMode", "split"); // split | list
  const searchRef = useRef(null);
  const { confirm } = useDeleteConfirm();

  /* load */
  const loadFiles = useCallback(async () => {
    if (!channelId) return;
    setIsLoading(true);
    try {
      const { data } = await fileAPI.listByChannel(channelId, { limit: 50 });
      setFiles(data.data.items || []);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Failed to load files");
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  /* keyboard shortcut */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  /* derived */
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        (f.fileName || "").toLowerCase().includes(q) ||
        (f.uploadedBy?.name || "").toLowerCase().includes(q),
    );
  }, [files, query]);

  const filtered = useMemo(() => {
    if (filter === "all") return searched;
    return searched.filter((f) => getFileKind(f.mimeType) === filter);
  }, [searched, filter]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (sort === "date-desc")
          return new Date(b.uploadedAt) - new Date(a.uploadedAt);
        if (sort === "date-asc")
          return new Date(a.uploadedAt) - new Date(b.uploadedAt);
        if (sort === "name")
          return (a.fileName || "").localeCompare(b.fileName || "");
        if (sort === "size") return (b.fileSize || 0) - (a.fileSize || 0);
        return 0;
      }),
    [filtered, sort],
  );

  const counts = useMemo(
    () => ({
      total: searched.length,
      images: searched.filter((f) => getFileKind(f.mimeType) === "image")
        .length,
      videos: searched.filter((f) => getFileKind(f.mimeType) === "video")
        .length,
      docs: searched.filter((f) => getFileKind(f.mimeType) === "file").length,
    }),
    [searched],
  );

  const mediaFiles = useMemo(
    () =>
      sorted.filter((f) =>
        ["image", "video"].includes(getFileKind(f.mimeType)),
      ),
    [sorted],
  );
  const docFiles = useMemo(
    () => sorted.filter((f) => getFileKind(f.mimeType) === "file"),
    [sorted],
  );

  /* actions */
  const handleDelete = async (file) => {
    const ok = await confirm({
      title: "Delete file",
      message: `"${file.fileName}" will be removed from this channel permanently.`,
    });
    if (!ok) return;
    try {
      await fileAPI.deleteFromChannel(channelId, file._id);
      setFiles((prev) =>
        prev.filter((f) => f.referenceId !== file.referenceId),
      );
      toast.success("File removed");
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Failed to delete");
    }
  };

  const handleShare = async (file) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(file.url);
        toast.success("Link copied to clipboard");
      } else {
        window.prompt("Copy link:", file.url);
      }
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const forceDownload = (url, fileName) => {
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", fileName || "download");
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /* ── render ───────────────────────────────────────────────────────────── */

  const sharedActions = {
    onShare: handleShare,
    onDownload: handleDownload,
    onDelete: handleDelete,
  };

  /* view mode: 'grid' shows all files as media grid cards, 'list' as rows, 'split' is default */
  const showMedia =
    filter === "all" || filter === "image" || filter === "video";
  const showDocs = filter === "all" || filter === "file";

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        
        /* Enhanced icon visibility */
        .file-icon-container {
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--bg-tertiary), var(--bg-hover));
          border: 1px solid var(--border-secondary);
          border-radius: 8px;
          padding: 8px;
          min-width: 48px;
          min-height: 48px;
        }
        
        .file-icon-container svg {
          filter: brightness(1.2) contrast(1.3);
          stroke-width: 1.5;
        }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: "var(--bg-primary)",
        }}
      >
        {/* Top Bar - Enhanced Contrast */}
        <div
          style={{
            padding: "14px 16px 0",
            borderBottom: "2px solid var(--border-secondary)",
            background:
              "linear-gradient(180deg, var(--surface-primary), var(--bg-secondary))",
            flexShrink: 0,
          }}
        >
          {/* Search Row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 12px",
                borderRadius: 10,
                height: 36,
                background: "var(--bg-input)",
                border: "1.5px solid var(--border-primary)",
                transition: "all 160ms ease",
              }}
            >
              <Search
                size={16}
                style={{
                  color: "var(--accent-primary)",
                  flexShrink: 0,
                  filter: "brightness(1.1)",
                }}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files…"
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  fontSize: 13,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-sans)",
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  style={{
                    padding: 0,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    color: "var(--accent-primary)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Sort & View Controls */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{
                height: 36,
                padding: "0 10px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 500,
                background: "var(--bg-input)",
                border: "1.5px solid var(--border-primary)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="date-desc">Newest</option>
              <option value="date-asc">Oldest</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
            </select>

            {/* View Mode Toggle - Enhanced */}
            <div
              style={{
                display: "flex",
                borderRadius: 10,
                border: "1.5px solid var(--border-primary)",
                overflow: "hidden",
                background: "var(--bg-input)",
              }}
            >
              {[
                { mode: "split", icon: <Grid3X3 size={16} />, label: "Split" },
                { mode: "list", icon: <List size={16} />, label: "List" },
              ].map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    width: 36,
                    height: 36,
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      viewMode === mode
                        ? "var(--accent-primary)"
                        : "transparent",
                    color: viewMode === mode ? "var(--text-white)" : "var(--text-muted)",
                    transition: "all 150ms ease",
                    filter:
                      viewMode === mode ? "brightness(1.1)" : "brightness(1)",
                  }}
                  title={label}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Pills */}
          <div style={{ paddingBottom: 12 }}>
            <StatBar
              total={counts.total}
              images={counts.images}
              videos={counts.videos}
              docs={counts.docs}
              filter={filter}
              onFilter={setFilter}
            />
          </div>
        </div>

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "18px 16px 24px",
            background: "var(--bg-primary)",
          }}
        >
          {isLoading ? (
            <Skeleton />
          ) : sorted.length === 0 ? (
            <Empty query={query} />
          ) : viewMode === "list" ? (
            <div>
              <SectionHeader title="All files" count={sorted.length} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sorted.map((file, i) => (
                  <DocRow
                    key={file.referenceId}
                    file={file}
                    index={i}
                    onPreview={(f) => onOpenFilePreview?.(f, sorted)}
                    onShare={() => handleShare(file)}
                    onDownload={() => handleDownload(file)}
                    onDelete={() => handleDelete(file)}
                  />
                ))}
              </div>
            </div>
          ) : (
            // Split view with enhanced visibility
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {/* Media Section */}
              {showMedia && mediaFiles.length > 0 && (
                <section>
                  <SectionHeader
                    title="Photos & Videos"
                    count={mediaFiles.length}
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      overflowX: "auto",
                      paddingBottom: 6,
                    }}
                  >
                    {mediaFiles.map((file, i) => (
                      <MediaCard
                        key={file.referenceId}
                        file={file}
                        index={i}
                        onPreview={(f) => onOpenFilePreview?.(f, mediaFiles)}
                        onShare={() => handleShare(file)}
                        onDownload={() => handleDownload(file)}
                        onDelete={() => handleDelete(file)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Docs Section */}
              {showDocs && (
                <section>
                  <SectionHeader title="Documents" count={docFiles.length} />
                  {docFiles.length === 0 ? (
                    <div
                      style={{
                        padding: "20px",
                        borderRadius: 12,
                        textAlign: "center",
                        border: "1px dashed var(--border-secondary)",
                        color: "var(--text-muted)",
                        fontSize: 13,
                      }}
                    >
                      No documents found
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {docFiles.map((file, i) => (
                        <DocRow
                          key={file.referenceId}
                          file={file}
                          index={i}
                          onPreview={(f) => onOpenFilePreview?.(f, docFiles)}
                          onShare={() => handleShare(file)}
                          onDownload={() => handleDownload(file)}
                          onDelete={() => handleDelete(file)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && files.length > 0 && (
          <div
            style={{
              flexShrink: 0,
              padding: "8px 16px",
              borderTop: "1px solid var(--border-secondary)",
              background: "var(--bg-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <HardDrive size={14} style={{ color: "var(--accent-primary)" }} />
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 500 }}>
              {sorted.length} of {files.length} file
              {files.length !== 1 ? "s" : ""}
              {" · "}
              {formatSize(
                files.reduce((acc, f) => acc + (f.fileSize || 0), 0),
              )}{" "}
              total
            </span>
          </div>
        )}
      </div>
    </>
  );
}