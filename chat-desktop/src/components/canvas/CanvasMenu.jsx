import { useEffect, useRef } from "react";
import { Plus, CopyPlus, LayoutTemplate, ChevronRight } from "lucide-react";

// ─── Menu Items Config ────────────────────────────────────────────────────────

const MENU_ITEMS = [
  {
    id: "blank",
    icon: Plus,
    label: "New blank canvas",
    description: "Start with an empty canvas",
    shortcut: "⌘N",
    iconBg: "rgba(78, 124, 255, 0.12)",
    iconColor: "var(--accent-primary)",
  },
  {
    id: "template",
    icon: LayoutTemplate,
    label: "Start with a template",
    description: "Choose from ready-made layouts",
    shortcut: null,
    iconBg: "rgba(124, 58, 237, 0.12)",
    iconColor: "var(--accent-purple)",
  },
  {
    id: "existing",
    icon: CopyPlus,
    label: "Add existing canvas",
    description: "Link a canvas from this workspace",
    shortcut: null,
    iconBg: "rgba(8, 145, 178, 0.12)",
    iconColor: "var(--accent-cyan)",
  },
];

// ─── Menu Item ────────────────────────────────────────────────────────────────

function MenuItem({ item, onClick }) {
  const { icon: Icon, label, description, shortcut, iconBg, iconColor } = item;

  return (
    <button
      onClick={() => onClick(item.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        borderRadius: "var(--radius-md)",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "background var(--transition-fast)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Icon */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: "var(--radius-md)",
          background: iconBg,
          color: iconColor,
        }}
      >
        <Icon size={14} strokeWidth={2} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.3 }}>
            {label}
          </span>
          {shortcut && (
            <span
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                background: "var(--bg-tertiary)",
                padding: "1px 5px",
                borderRadius: "var(--radius-xs)",
                border: "1px solid var(--border-primary)",
                flexShrink: 0,
              }}
            >
              {shortcut}
            </span>
          )}
        </div>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {description}
        </p>
      </div>

      {/* Arrow */}
      <ChevronRight size={13} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
//
// onSelect(type)  – called when the user picks an option; type is one of
//                   "blank" | "template" | "existing"
// onDismiss()     – called when the user clicks outside or presses Escape.
//                   NOTE: when used as the header popup, ChatHeader handles
//                   outside-click dismissal itself via canvasPopupRef, so
//                   onDismiss is mainly for the Escape key and the inline
//                   full-screen usage inside CanvasPanel.
//
export default function CanvasMenu({ onSelect, onDismiss }) {
  const menuRef = useRef(null);

  // Escape key closes the menu
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onDismiss?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onDismiss]);

  // NOTE: We intentionally do NOT attach a document click listener here for
  // outside-click detection when used as the header popup, because ChatHeader
  // already handles that via its canvasPopupRef / onCloseCanvasMenu mechanism.
  // Adding a second listener here caused a race condition where every click
  // (including the open-click) would immediately close the menu.
  // When used inside CanvasPanel as a full-screen view, there is nothing
  // outside to click through to, so this is also fine.

  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "flex-start" }}>
      <div
        ref={menuRef}
        style={{
          width: 290,
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--border-primary)",
          background: "var(--bg-modal)",
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
          animation: "fadeInScale 150ms ease forwards",
        }}
      >
        <style>{`
          @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.97) translateY(-4px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>

        {/* Items */}
        <div style={{ padding: "4px 6px" }}>
          {MENU_ITEMS.map((item, i) => (
            <div key={item.id}>
              <MenuItem item={item} onClick={onSelect} />
              {i < MENU_ITEMS.length - 1 && (
                <div
                  style={{
                    height: 1,
                    background: "var(--border-secondary)",
                    margin: "2px 10px",
                    opacity: 0.5,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 14px",
            borderTop: "1px solid var(--border-primary)",
            background: "var(--bg-secondary)",
          }}
        >
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Canvases are shared with all channel members
          </p>
        </div>
      </div>
    </div>
  );
}