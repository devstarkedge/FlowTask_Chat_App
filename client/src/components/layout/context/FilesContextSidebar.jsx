import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  File,
  FileText,
  Loader2,
  Search,
  FileImage,
  FileVideo,
  X,
  ChevronDown,
  Files,
  Hash,
  MessageSquare,
} from "lucide-react";
import toast from "react-hot-toast";
import { fileAPI } from "../../../services/api";
import SidebarContainer from "../sidebar/SidebarContainer";
import WorkspaceSwitcher from "../../workspace/WorkspaceSwitcher";

/* ─── Helpers ──────────────────────────────────────────────────────── */

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

function getFileKind(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

function formatUploadedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleString([], { month: "short", day: "numeric" });
}

function getFileExt(fileName = "") {
  return fileName.split(".").pop()?.toUpperCase()?.slice(0, 4) || "FILE";
}

/* ─── Injected CSS ──────────────────────────────────────────────────── */

const STYLES = `
/* ── Keyframes ── */
@keyframes fcs-fadeUp   { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@keyframes fcs-slideIn  { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }
@keyframes fcs-spin     { to { transform:rotate(360deg); } }
@keyframes fcs-shimmer  { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
@keyframes fcs-pop      { 0%{transform:scale(0.85)} 70%{transform:scale(1.06)} 100%{transform:scale(1)} }

/* ── Wrapper ── */
.fcs-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Header block ── */
.fcs-header {
  padding: 14px 12px 0;
  flex-shrink: 0;
}

.fcs-ws-wrap {
  margin-bottom: 14px;
}

/* Title row */
.fcs-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.fcs-title-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--accent-color, #1264a3) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-color, #1264a3) 28%, transparent);
  color: var(--accent-color, #1264a3);
}
.fcs-title-text {
  flex: 1;
  font-size: 14px;
  font-weight: 800;
  color: var(--sidebar-text, rgba(255,255,255,0.92));
  letter-spacing: -0.02em;
}
.fcs-count-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.45);
  letter-spacing: 0;
  transition: background 200ms ease, color 200ms ease;
}
.fcs-count-pill.has-files {
  background: color-mix(in srgb, var(--accent-color, #1264a3) 22%, transparent);
  border-color: color-mix(in srgb, var(--accent-color, #1264a3) 35%, transparent);
  color: color-mix(in srgb, var(--accent-color, #1264a3) 80%, #fff);
}

/* ── Search ── */
.fcs-search-wrap {
  margin-bottom: 10px;
}
.fcs-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-radius: 10px;
  background: rgba(255,255,255,0.07);
  border: 1.5px solid rgba(255,255,255,0.1);
  transition: border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;
}
.fcs-search:focus-within {
  background: rgba(255,255,255,0.1);
  border-color: color-mix(in srgb, var(--accent-color, #1264a3) 70%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color, #1264a3) 18%, transparent);
}
.fcs-search-icon {
  color: rgba(255,255,255,0.28);
  flex-shrink: 0;
  transition: color 180ms ease;
}
.fcs-search:focus-within .fcs-search-icon {
  color: var(--accent-color, #1264a3);
}
.fcs-search input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255,255,255,0.9);
  font-family: inherit;
  caret-color: var(--accent-color, #1264a3);
}
.fcs-search input::placeholder {
  color: rgba(255,255,255,0.28);
  font-weight: 400;
}
.fcs-search-clear {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background 120ms ease, color 120ms ease;
}
.fcs-search-clear:hover {
  background: rgba(255,255,255,0.22);
  color: rgba(255,255,255,0.9);
}

/* ── Filter chips ── */
.fcs-chips {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom: 10px;
  padding-bottom: 1px;
}
.fcs-chips::-webkit-scrollbar { display: none; }
.fcs-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  border: 1.5px solid rgba(255,255,255,0.09);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.45);
  font-family: inherit;
  transition: background 150ms ease, color 150ms ease, border-color 150ms ease,
    transform 200ms cubic-bezier(.34,1.56,.64,1), box-shadow 150ms ease;
}
.fcs-chip:hover {
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.8);
  border-color: rgba(255,255,255,0.16);
  transform: translateY(-1px);
}
.fcs-chip.active {
  background: var(--accent-color, #1264a3);
  color: #fff;
  border-color: var(--accent-color, #1264a3);
  box-shadow: 0 2px 10px color-mix(in srgb, var(--accent-color, #1264a3) 38%, transparent);
  transform: translateY(0);
}
.fcs-chip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  opacity: 0.75;
}

/* ── Divider ── */
.fcs-divider {
  height: 1px;
  margin: 0 0 6px;
  background: linear-gradient(90deg,
    transparent,
    rgba(255,255,255,0.08) 25%,
    rgba(255,255,255,0.08) 75%,
    transparent);
}

/* ── Section label ── */
.fcs-section-label {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px 4px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.28);
}
.fcs-section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.07);
}

/* ── Scrollable list ── */
.fcs-list-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 8px 16px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}
.fcs-list-scroll::-webkit-scrollbar { width: 4px; }
.fcs-list-scroll::-webkit-scrollbar-track { background: transparent; }
.fcs-list-scroll::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 4px;
}
.fcs-list-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.18);
}

/* ── File row ── */
.fcs-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1.5px solid transparent;
  cursor: pointer;
  width: 100%;
  text-align: left;
  background: transparent;
  font-family: inherit;
  position: relative;
  overflow: hidden;
  animation: fcs-slideIn 240ms ease both;
  transition: background 150ms ease, border-color 150ms ease,
    box-shadow 180ms ease, transform 200ms cubic-bezier(.34,1.56,.64,1);
  margin-bottom: 2px;
}
.fcs-row:hover {
  background: rgba(255,255,255,0.055);
  border-color: rgba(255,255,255,0.07);
  transform: translateX(2px);
}
.fcs-row:focus-visible {
  outline: none;
  border-color: var(--accent-color, #1264a3);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color, #1264a3) 30%, transparent);
}
.fcs-row.active {
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--accent-color, #1264a3) 24%, transparent),
    color-mix(in srgb, var(--accent-color, #1264a3) 12%, transparent));
  border-color: color-mix(in srgb, var(--accent-color, #1264a3) 36%, transparent);
  box-shadow:
    0 2px 12px color-mix(in srgb, var(--accent-color, #1264a3) 18%, transparent),
    inset 0 0 0 0.5px color-mix(in srgb, var(--accent-color, #1264a3) 28%, transparent);
  transform: translateX(0);
}
.fcs-row.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  bottom: 20%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent-color, #1264a3);
  box-shadow: 0 0 8px var(--accent-color, #1264a3);
}

/* ── Icon tile ── */
.fcs-tile {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex-shrink: 0;
  border: 1.5px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.05);
  position: relative;
  overflow: hidden;
  transition: border-color 150ms ease, background 150ms ease;
}
.fcs-row:hover .fcs-tile {
  border-color: rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.08);
}
.fcs-row.active .fcs-tile {
  border-color: color-mix(in srgb, var(--accent-color, #1264a3) 42%, transparent);
  background: color-mix(in srgb, var(--accent-color, #1264a3) 16%, rgba(0,0,0,0.1));
}
.fcs-tile img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.fcs-tile-ext {
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: rgba(255,255,255,0.32);
  font-family: var(--font-mono, monospace);
  line-height: 1;
  text-transform: uppercase;
}
.fcs-row.active .fcs-tile-ext {
  color: color-mix(in srgb, var(--accent-color, #1264a3) 70%, #fff);
}

/* ── Info ── */
.fcs-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.fcs-name {
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(255,255,255,0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
  letter-spacing: -0.01em;
  transition: color 150ms ease;
}
.fcs-row:hover .fcs-name { color: rgba(255,255,255,0.95); }
.fcs-row.active .fcs-name { color: #fff; font-weight: 700; }

.fcs-channel {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255,255,255,0.36);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}
.fcs-row.active .fcs-channel { color: rgba(255,255,255,0.6); }

.fcs-uploader {
  font-size: 10.5px;
  color: rgba(255,255,255,0.24);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}
.fcs-row.active .fcs-uploader { color: rgba(255,255,255,0.45); }

/* ── Right meta ── */
.fcs-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  flex-shrink: 0;
}
.fcs-time {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,0.28);
  white-space: nowrap;
  letter-spacing: 0.01em;
}
.fcs-row.active .fcs-time { color: rgba(255,255,255,0.55); }
.fcs-size {
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.26);
  letter-spacing: 0.02em;
  border: 1px solid rgba(255,255,255,0.06);
  transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
}
.fcs-row.active .fcs-size {
  background: color-mix(in srgb, var(--accent-color, #1264a3) 20%, transparent);
  color: rgba(255,255,255,0.6);
  border-color: color-mix(in srgb, var(--accent-color, #1264a3) 30%, transparent);
}

/* ── Skeleton ── */
.fcs-skel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  animation: fcs-fadeUp 280ms ease both;
  margin-bottom: 2px;
}
.fcs-skel {
  background: linear-gradient(90deg,
    rgba(255,255,255,0.05) 25%,
    rgba(255,255,255,0.1) 50%,
    rgba(255,255,255,0.05) 75%);
  background-size: 200% 100%;
  animation: fcs-shimmer 1.6s infinite linear;
  border-radius: 6px;
}

/* ── Empty state ── */
.fcs-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  gap: 10px;
  animation: fcs-fadeUp 320ms ease both;
  text-align: center;
}
.fcs-empty-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: rgba(255,255,255,0.05);
  border: 1.5px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

/* ── Load more ── */
.fcs-load-more {
  width: 100%;
  padding: 9px 14px;
  border-radius: 10px;
  border: 1.5px solid rgba(255,255,255,0.09);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.42);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: inherit;
  margin-top: 4px;
  transition: background 140ms ease, color 140ms ease,
    border-color 140ms ease,
    transform 200ms cubic-bezier(.34,1.56,.64,1);
}
.fcs-load-more:hover {
  background: rgba(255,255,255,0.09);
  color: rgba(255,255,255,0.78);
  border-color: rgba(255,255,255,0.15);
  transform: translateY(-1px);
}

/* ── Spinner ── */
.fcs-spin { animation: fcs-spin 700ms linear infinite; }

/* ── Pagination loader ── */
.fcs-pagination-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 0;
}

/* ── Responsive ── */
@media (max-width: 1024px) {
  .fcs-row { padding: 8px; }
  .fcs-name { font-size: 12px; }
  .fcs-channel { font-size: 10.5px; }
}
@media (max-width: 768px) {
  .fcs-right { flex-direction: row; justify-content: space-between; width: 100%; }
  .fcs-tile { width: 36px; height: 36px; }
  .fcs-name { font-size: 11.5px; }
}
`;

/* ─── Styles hook ───────────────────────────────────────────────────── */

function useStylesInjected() {
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    if (document.getElementById("fcs-styles")) return;
    const el = document.createElement("style");
    el.id = "fcs-styles";
    el.textContent = STYLES;
    document.head.appendChild(el);
  }, []);
}

/* ─── Constants ─────────────────────────────────────────────────────── */

const CHIPS = [
  { value: "all", label: "All", dot: "rgba(255,255,255,0.4)" },
  { value: "image", label: "Images", dot: "#60a5fa" },
  { value: "video", label: "Videos", dot: "#a78bfa" },
  { value: "file", label: "Docs", dot: "#34d399" },
];

const KIND_COLORS = {
  image: "#60a5fa",
  video: "#a78bfa",
  file: "#34d399",
};

/* ─── Sub-components ────────────────────────────────────────────────── */

function KindIcon({ kind, size = 14 }) {
  const color = KIND_COLORS[kind] || "#34d399";
  if (kind === "image") return <FileImage size={size} style={{ color }} />;
  if (kind === "video") return <FileVideo size={size} style={{ color }} />;
  return <FileText size={size} style={{ color }} />;
}

function SkeletonRow({ index = 0 }) {
  return (
    <div className="fcs-skel-row" style={{ animationDelay: `${index * 45}ms` }}>
      <div
        className="fcs-skel"
        style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }}
      />
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}
      >
        <div
          className="fcs-skel"
          style={{ height: 11, width: "68%", borderRadius: 5 }}
        />
        <div
          className="fcs-skel"
          style={{ height: 9, width: "44%", borderRadius: 4 }}
        />
        <div
          className="fcs-skel"
          style={{ height: 9, width: "55%", borderRadius: 4 }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "flex-end",
          flexShrink: 0,
        }}
      >
        <div
          className="fcs-skel"
          style={{ height: 9, width: 28, borderRadius: 4 }}
        />
        <div
          className="fcs-skel"
          style={{ height: 16, width: 32, borderRadius: 999 }}
        />
      </div>
    </div>
  );
}

function FileRow({ file, isSelected, onClick, onKeyDown, index }) {
  const kind = getFileKind(file.mimeType);
  const ext = getFileExt(file.fileName);
  const isImage = kind === "image";
  const previewSrc = file.thumbnailUrl || (isImage ? file.url : null);
  const isDM = file.channel?.type === "dm";
  const channelLabel = isDM
    ? "Direct message"
    : `#${file.channel?.name || "channel"}`;

  return (
    <button
      role="option"
      aria-selected={isSelected}
      className={`fcs-row${isSelected ? " active" : ""}`}
      style={{ animationDelay: `${Math.min(index * 30, 400)}ms` }}
      onClick={() => onClick?.(file)}
      onKeyDown={onKeyDown}
    >
      {/* Icon tile */}
      <div className="fcs-tile">
        {previewSrc ? (
          <img src={previewSrc} alt="" loading="lazy" />
        ) : (
          <>
            <KindIcon kind={kind} size={14} />
            <span className="fcs-tile-ext">{ext}</span>
          </>
        )}
      </div>

      {/* Info */}
      <div className="fcs-info">
        <span className="fcs-name" title={file.fileName}>
          {file.fileName}
        </span>
        <span className="fcs-channel">
          {isDM ? (
            <MessageSquare size={9} style={{ opacity: 0.6 }} />
          ) : (
            <Hash size={9} style={{ opacity: 0.6 }} />
          )}
          {channelLabel}
        </span>
        <span className="fcs-uploader">
          {file.uploadedBy?.name || "Unknown"}
        </span>
      </div>

      {/* Right */}
      <div className="fcs-right">
        <span className="fcs-time">{formatUploadedAt(file.uploadedAt)}</span>
        <span className="fcs-size">{formatSize(file.fileSize)}</span>
      </div>
    </button>
  );
}

function moveListFocus(e, dir) {
  const sibling =
    dir === "next"
      ? e.currentTarget.nextElementSibling
      : e.currentTarget.previousElementSibling;
  if (sibling?.tagName === "BUTTON") sibling.focus();
}

/* ─── Main ──────────────────────────────────────────────────────────── */

export default function FilesContextSidebar({
  selectedFileId,
  onSelectFile,
  onFilesChanged,
}) {
  useStylesInjected();

  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 260);
    return () => clearTimeout(t);
  }, [query]);

  const loadFiles = useCallback(
    async ({ reset = false, cursor = null } = {}) => {
      setIsLoading(true);
      try {
        const { data } = await fileAPI.listWorkspace({
          limit: 40,
          cursor: cursor || undefined,
          q: debouncedQuery || undefined,
          kind: kind === "all" ? undefined : kind,
        });
        const incoming = data.data.items || [];
        const incomingHasMore = !!data.data.hasMore;
        const incomingCursor = data.data.pagination?.nextCursor || null;

        setFiles((prev) => {
          if (reset) return incoming;
          const seen = new Set(prev.map((f) => f.referenceId));
          const unique = incoming.filter((f) => !seen.has(f.referenceId));
          return [...prev, ...unique];
        });
        setHasMore(incomingHasMore);
        setNextCursor(incomingCursor);
      } catch (err) {
        toast.error(
          err.response?.data?.error?.message || "Failed to load files",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [debouncedQuery, kind],
  );

  useEffect(() => {
    setNextCursor(null);
    loadFiles({ reset: true, cursor: null });
  }, [debouncedQuery, kind, loadFiles]);

  useEffect(() => {
    onFilesChanged?.(files);
  }, [files, onFilesChanged]);

  const selectedFile = useMemo(
    () => files.find((f) => f.referenceId === selectedFileId) || null,
    [files, selectedFileId],
  );
  useEffect(() => {
    if (selectedFile || files.length === 0) return;
    onSelectFile?.(files[0]);
  }, [selectedFile, files, onSelectFile]);

  /* ── Header passed to SidebarContainer ── */
  const header = (
    <>
      {/* Workspace switcher */}
      <div className="fcs-ws-wrap">
        <WorkspaceSwitcher />
      </div>

      {/* Title row */}
      <div className="fcs-title-row">
        <div className="fcs-title-icon">
          <Files size={14} />
        </div>
        <span className="fcs-title-text">Files</span>
        <span
          className={`fcs-count-pill${files.length > 0 ? " has-files" : ""}`}
        >
          {files.length}
        </span>
      </div>

      {/* Search */}
      <div className="fcs-search-wrap">
        <div className="fcs-search">
          <Search size={13} className="fcs-search-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            aria-label="Search files"
          />
          {isLoading && query && (
            <Loader2
              size={12}
              className="fcs-spin"
              style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}
            />
          )}
          {query && !isLoading && (
            <button
              className="fcs-search-clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={9} />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="fcs-chips" role="group" aria-label="File type filter">
        {CHIPS.map((chip) => (
          <button
            key={chip.value}
            className={`fcs-chip${kind === chip.value ? " active" : ""}`}
            onClick={() => setKind(chip.value)}
            aria-pressed={kind === chip.value}
          >
            {kind !== chip.value && (
              <span className="fcs-chip-dot" style={{ background: chip.dot }} />
            )}
            {chip.label}
          </button>
        ))}
      </div>

      <div className="fcs-divider" />
    </>
  );

  return (
    <SidebarContainer header={header} aria-label="Files sidebar">
      {/* Scrollable list */}
      <div className="fcs-list-scroll" role="listbox" aria-label="Files list">
        {/* Skeletons */}
        {isLoading && files.length === 0 && (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} index={i} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && files.length === 0 && (
          <div className="fcs-empty">
            <div className="fcs-empty-icon">
              <File size={22} style={{ color: "rgba(255,255,255,0.2)" }} />
            </div>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "rgba(255,255,255,0.65)",
                margin: 0,
              }}
            >
              {query ? "No results" : "No files yet"}
            </p>
            <p
              style={{
                fontSize: 11.5,
                color: "rgba(255,255,255,0.28)",
                margin: 0,
                lineHeight: 1.6,
                maxWidth: 168,
              }}
            >
              {query
                ? `Nothing matched "${query}"`
                : "Files shared in channels and DMs will appear here."}
            </p>
          </div>
        )}

        {/* File list */}
        {files.length > 0 && (
          <div>
            {kind !== "all" && (
              <div className="fcs-section-label">
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: KIND_COLORS[kind] || "rgba(255,255,255,0.4)",
                  }}
                />
                {CHIPS.find((c) => c.value === kind)?.label}
              </div>
            )}
            {files.map((file, i) => (
              <FileRow
                key={file.referenceId}
                file={file}
                index={i}
                isSelected={file.referenceId === selectedFileId}
                onClick={onSelectFile}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    moveListFocus(e, "next");
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    moveListFocus(e, "prev");
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Pagination spinner */}
        {isLoading && files.length > 0 && (
          <div className="fcs-pagination-loader">
            <Loader2
              size={15}
              className="fcs-spin"
              style={{ color: "rgba(255,255,255,0.2)" }}
            />
          </div>
        )}

        {/* Load more */}
        {!isLoading && hasMore && (
          <button
            className="fcs-load-more"
            onClick={() => loadFiles({ cursor: nextCursor })}
          >
            <ChevronDown size={13} />
            Load more
          </button>
        )}
      </div>
    </SidebarContainer>
  );
}
