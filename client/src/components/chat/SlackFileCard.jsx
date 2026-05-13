import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileArchive,
  FileCode,
  File,
  Play,
  Copy,
  Check,
  Table2,
  ExternalLink,
} from "lucide-react";
import { handleDownload } from "../../utils/handleDownload";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileKind(mime = "", name = "") {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "audio";
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (/^(zip|rar|7z|tar|gz|gzip)$/.test(ext)) return "archive";
  if (mime?.includes("zip") || mime?.includes("rar") || mime?.includes("tar") || mime?.includes("gzip") || mime?.includes("7z")) return "archive";
  if (/^(js|ts|py|java|c|cpp|json|xml|html|css|scss|sql|yaml|env)$/.test(ext)) return "code";
  if (/^(txt|md)$/.test(ext)) return "text";
  if (mime === "text/csv" || ext === "csv") return "csv";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (/^(doc|docx)$/.test(ext) || mime?.includes("word") || mime?.includes("msword")) return "word";
  if (/^(xls|xlsx)$/.test(ext) || mime?.includes("excel") || mime?.includes("spreadsheet")) return "spreadsheet";
  if (/^(ppt|pptx)$/.test(ext) || mime?.includes("presentation") || mime?.includes("powerpoint")) return "presentation";
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
    return <Film size={size} style={{ color: "#a855f7" }} />;
  if (kind === "audio")
    return <Music size={size} style={{ color: "#22c55e" }} />;
  if (kind === "archive")
    return <FileArchive size={size} style={{ color: "#ea580c" }} />;
  if (kind === "code" || kind === "text")
    return <FileCode size={size} style={{ color: "#059669" }} />;
  if (kind === "csv" || kind === "spreadsheet")
    return <Table2 size={size} style={{ color: "#22c55e" }} />;
  if (kind === "pdf")
    return <FileText size={size} style={{ color: "#ef4444" }} />;
  if (kind === "word")
    return <FileText size={size} style={{ color: "#3b82f6" }} />;
  if (kind === "presentation")
    return <FileText size={size} style={{ color: "#f59e0b" }} />;
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

// ─── Inline Code Preview (fetches first N lines) ─────────────────────────────

function CodePreviewBlock({ file, onOpen }) {
  const [lines, setLines] = useState(null);
  const [copied, setCopied] = useState(false);
  const url = file.secureUrl || file.url;
  const name = file.originalName || file.fileName || file.name || "File";
  const ext = getFileExtension(name);
  const fullTextRef = useRef(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) {
          fullTextRef.current = text;
          const allLines = text.split("\n");
          setLines(allLines.slice(0, 8));
        }
      })
      .catch(() => {
        if (!cancelled) setLines(null);
      });
    return () => { cancelled = true; };
  }, [url]);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      const r = await fetch(url);
      const text = await r.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  return (
    <div className="sfc-code-card" onClick={() => onOpen?.(file)}>
      <div className="sfc-code-header">
        <div className="sfc-code-lang-badge" style={{ background: `color-mix(in srgb, #059669 15%, transparent)`, color: "#059669" }}>
          {getLanguageLabel(ext)}
        </div>
        <button
          className="sfc-code-copy-btn"
          onClick={handleCopy}
          title="Copy file content"
          aria-label="Copy file content"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre className="sfc-code-body">
        <code>
          {lines ? lines.join("\n") : "Loading..."}
          {lines && lines.length >= 8 && "\n…"}
        </code>
      </pre>
      <div className="sfc-code-footer">
        <span className="sfc-code-filename" title={name}>{name}</span>
        <span className="sfc-code-meta">{formatFileSize(file.fileSize || file.size)}</span>
      </div>
    </div>
  );
}

// ─── Inline CSV Preview ──────────────────────────────────────────────────────

function CsvPreviewBlock({ file, onOpen }) {
  const [rows, setRows] = useState(null);
  const url = file.secureUrl || file.url;
  const name = file.originalName || file.fileName || file.name || "File";

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) {
          const parsed = text.split("\n").filter(Boolean).slice(0, 6).map((line) => {
            // Basic CSV parse (handles quoted commas)
            const result = [];
            let current = "";
            let inQuotes = false;
            for (const ch of line) {
              if (ch === '"') { inQuotes = !inQuotes; continue; }
              if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
              current += ch;
            }
            result.push(current.trim());
            return result;
          });
          setRows(parsed);
        }
      })
      .catch(() => {
        if (!cancelled) setRows(null);
      });
    return () => { cancelled = true; };
  }, [url]);

  if (!rows || rows.length < 2) {
    return <FileCardGeneric file={file} onOpen={onOpen} kind="csv" />;
  }

  const header = rows[0];
  const dataRows = rows.slice(1);

  return (
    <div className="sfc-csv-card" onClick={() => onOpen?.(file)}>
      <div className="sfc-csv-header">
        <Table2 size={14} style={{ color: "#22c55e" }} />
        <span className="sfc-csv-title" title={name}>{name}</span>
        <span className="sfc-csv-meta">{formatFileSize(file.fileSize || file.size)}</span>
      </div>
      <div className="sfc-csv-table-wrap">
        <table className="sfc-csv-table">
          <thead>
            <tr>{header.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {dataRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sfc-csv-footer">
        Click to view full file
      </div>
    </div>
  );
}

// ─── Inline Video Player ─────────────────────────────────────────────────────

function VideoCard({ file, onOpen }) {
  const url = file.secureUrl || file.url;
  const thumb = file.thumbnailUrl || null;
  const name = file.originalName || file.fileName || file.name || "Video";

  return (
    <div className="sfc-video-card">
      <video
        src={url}
        controls
        preload="metadata"
        poster={thumb || undefined}
        className="sfc-video-player"
        onClick={(e) => e.stopPropagation()}
      >
        Your browser does not support the video tag.
      </video>
      <div className="sfc-video-info">
        <Film size={14} style={{ color: "#a855f7", flexShrink: 0 }} />
        <span className="sfc-video-name" title={name}>{name}</span>
        <span className="sfc-video-size">{formatFileSize(file.fileSize || file.size)}</span>
        <button
          className="sfc-mini-open"
          onClick={(e) => { e.stopPropagation(); onOpen?.(file); }}
          title="Open"
          aria-label="Open"
        >
          <ExternalLink size={13} />
        </button>
        <button
          className="sfc-mini-download"
          onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
          title="Download"
          aria-label="Download"
        >
          <Download size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Inline Audio Player ─────────────────────────────────────────────────────

function AudioCard({ file }) {
  const url = file.secureUrl || file.url;
  const name = file.originalName || file.fileName || file.name || "Audio";

  return (
    <div className="sfc-audio-card">
      <div className="sfc-audio-header">
        <div className="sfc-audio-icon-wrap">
          <Music size={18} style={{ color: "#22c55e" }} />
        </div>
        <div className="sfc-audio-meta">
          <span className="sfc-audio-name" title={name}>{name}</span>
          <span className="sfc-audio-size">{formatFileSize(file.fileSize || file.size)}</span>
        </div>
        <button
          className="sfc-mini-download"
          onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
          title="Download"
          aria-label="Download"
        >
          <Download size={13} />
        </button>
      </div>
      <audio
        src={url}
        controls
        preload="metadata"
        className="sfc-audio-player"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Generic File Card (for docs, archives, spreadsheets, etc.) ──────────────

function FileCardGeneric({ file, onOpen, kind }) {
  const name = file.originalName || file.fileName || file.name || "File";
  const size = file.fileSize || file.size || file.fileSizeBytes;
  const ext = getFileExtension(name);
  const color = getKindColor(kind);

  return (
    <div
      className="sfc-generic-card"
      onClick={() => onOpen?.(file)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen?.(file); }}
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
      <button
        className="sfc-mini-download"
        onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
        title="Download"
        aria-label="Download"
      >
        <Download size={14} />
      </button>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function SlackFileCard({
  file,
  onOpen,
  onDownload,
  compact = false,
  isSingle = false,
}) {
  if (!file) return null;

  const name = file.originalName || file.fileName || file.name || "File";
  const mime = file.mimeType || file.type || "";
  const thumb = file.thumbnailUrl || file.secureUrl || file.url || file.preview || null;
  const kind = getFileKind(mime, name);

  // ── Image: inline thumbnail with click-to-preview ──
  if (kind === "image" && thumb) {
    return (
      <div
        className="slack-image-attachment group"
        onClick={() => onOpen?.(file)}
        style={{
          position: "relative",
          cursor: "pointer",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          border: "1px solid var(--border-secondary)",
          maxWidth: isSingle ? "360px" : "240px",
          minWidth: "100px",
          minHeight: "80px",
          display: "inline-block",
          backgroundColor: "var(--bg-secondary)",
          lineHeight: 0,
        }}
      >
        <img
          src={thumb}
          alt={name}
          style={{
            maxWidth: "100%",
            height: "auto",
            maxHeight: "350px",
            objectFit: "contain",
            display: "block",
          }}
          loading="lazy"
        />
        {/* Hover overlay with download button */}
        <div className="slack-image-attachment-overlay">
          <button
            className="slack-file-download"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(file);
            }}
            aria-label="Download"
            title="Download"
          >
            <Download size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── Video: inline player ──
  if (kind === "video") {
    return <VideoCard file={file} onOpen={onOpen} />;
  }

  // ── Audio: inline player ──
  if (kind === "audio") {
    return <AudioCard file={file} />;
  }

  // ── Code / Text: inline code preview ──
  if (kind === "code" || kind === "text") {
    const url = file.secureUrl || file.url;
    if (url && !compact) {
      return <CodePreviewBlock file={file} onOpen={onOpen} />;
    }
    return <FileCardGeneric file={file} onOpen={onOpen} kind={kind} />;
  }

  // ── CSV: inline table preview ──
  if (kind === "csv") {
    const url = file.secureUrl || file.url;
    if (url && !compact) {
      return <CsvPreviewBlock file={file} onOpen={onOpen} />;
    }
    return <FileCardGeneric file={file} onOpen={onOpen} kind={kind} />;
  }

  // ── PDF / Word / Spreadsheet / Archive / Presentation / Generic: card ──
  return <FileCardGeneric file={file} onOpen={onOpen} kind={kind} />;
}

// Re-export helpers for reuse
export { getFileKind, KindIcon, formatFileSize, getKindColor, getFileExtension, getLanguageLabel };
