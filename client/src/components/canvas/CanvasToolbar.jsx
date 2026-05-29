import { useEffect, useRef, useState } from "react";
import {
  Type, Heading1, Heading2, Heading3, List, ListOrdered,
  CheckSquare, Quote, Code2, Minus, Table2, Columns, AlertCircle,
  Paperclip, Search,
} from "lucide-react";

const BLOCK_TYPES = [
  { group: "Basic", items: [
    { type: "paragraph",   label: "Text",        desc: "Just start writing",                   icon: Type },
    { type: "heading-1",   label: "Heading 1",   desc: "Large section heading",                icon: Heading1 },
    { type: "heading-2",   label: "Heading 2",   desc: "Medium section heading",               icon: Heading2 },
    { type: "heading-3",   label: "Heading 3",   desc: "Small section heading",                icon: Heading3 },
  ]},
  { group: "Lists", items: [
    { type: "bullet-list", label: "Bullet List", desc: "Simple unordered list",                icon: List },
    { type: "numbered-list",label:"Numbered List",desc: "Ordered step-by-step list",           icon: ListOrdered },
    { type: "checklist",   label: "Checklist",   desc: "Trackable to-do items",                icon: CheckSquare },
  ]}, 
  { group: "Content", items: [
    { type: "quote",       label: "Quote",       desc: "Highlight a key message",              icon: Quote },
    { type: "code",        label: "Code Block",  desc: "Monospace code snippet",               icon: Code2 },
    { type: "callout",     label: "Callout",     desc: "Info or warning notice",               icon: AlertCircle },
    { type: "divider",     label: "Divider",     desc: "Visual horizontal separator",          icon: Minus },
    { type: "table",       label: "Table",       desc: "Simple data table",                    icon: Table2 },
    { type: "columns",     label: "Columns",     desc: "Side-by-side column layout",           icon: Columns },
    { type: "attachment",  label: "Attachment",  desc: "File or image reference",              icon: Paperclip },
  ]},
];

export default function CanvasToolbar1({ x, y, query, onSelect, onClose }) {
  const menuRef = useRef(null);
  const [search, setSearch] = useState(query || "");
  const [activeIndex, setActiveIndex] = useState(0);

  // Filter items based on search
  const filtered = BLOCK_TYPES.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.label.toLowerCase().includes(search.toLowerCase()) ||
        item.type.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((g) => g.items.length > 0);

  const flatItems = filtered.flatMap((g) => g.items);

  // Keep active index in bounds
  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatItems[activeIndex]) onSelect(flatItems[activeIndex].type);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [flatItems, activeIndex, onSelect, onClose]);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = menuRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let flatIdx = -1;

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 1000,
        width: 280,
        maxHeight: 360,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-modal)",
        border: "1px solid var(--border-primary)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-modal)",
        overflow: "hidden",
        animation: "slashMenuIn 130ms cubic-bezier(0.16,1,0.3,1) forwards",
      }}
    >
      <style>{`
        @keyframes slashMenuIn {
          from { opacity: 0; transform: scale(0.96) translateY(-6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Search bar */}
      <div style={{
        padding: "8px 10px", borderBottom: "1px solid var(--border-primary)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter blocks…"
          style={{
            border: "none", background: "transparent", outline: "none",
            fontSize: 12, color: "var(--text-primary)", width: "100%",
            fontFamily: "var(--font-sans)",
          }}
        />
      </div>

      {/* Block list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {flatItems.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
            No blocks match "{search}"
          </div>
        ) : (
          filtered.map((group) => (
            <div key={group.group}>
              <div style={{
                padding: "8px 12px 4px",
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--text-muted)",
              }}>
                {group.group}
              </div>
              {group.items.map((item) => {
                flatIdx++;
                const idx = flatIdx;
                const Icon = item.icon;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={item.type}
                    data-idx={idx}
                    onClick={() => onSelect(item.type)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "7px 12px",
                      border: "none", cursor: "pointer", textAlign: "left",
                      background: isActive ? "var(--bg-hover)" : "transparent",
                      transition: "background 100ms",
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: "var(--radius-sm)",
                      background: isActive ? "var(--accent-primary)" : "var(--bg-secondary)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, transition: "background 100ms",
                    }}>
                      <Icon size={13} style={{ color: isActive ? "#fff" : "var(--text-secondary)" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                        {item.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: "6px 12px", borderTop: "1px solid var(--border-primary)",
        fontSize: 10, color: "var(--text-muted)",
        display: "flex", gap: 12,
      }}>
        <span>↑↓ navigate</span>
        <span>↵ select</span>
        <span>Esc dismiss</span>
      </div>
    </div>
  );
}
