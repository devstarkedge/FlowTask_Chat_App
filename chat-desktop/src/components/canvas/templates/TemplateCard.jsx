import React, { useState } from "react";
import { Star, Eye, Plus, Copy, FileText } from "lucide-react";

function getPrimaryCover(template) {
  if (!template) return null;
  const c = template.cover;
  if (!c) return null;
  if (typeof c === "string") return { type: "image", url: c };
  if (Array.isArray(c)) return c[0];
  if (c.variations && c.variations.length) return c.variations[0];
  return c;
}

export default function TemplateCard({
  template,
  onUse,
  onPreview,
  onDuplicate,
  onToggleFavorite,
  isFavorite,
  isActive = false,
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = template.icon || null;

  const coverVar = getPrimaryCover(template);
  const coverInnerStyle = {};

  if (coverVar) {
    if (coverVar.type === "image" || coverVar.type === "photo" || coverVar.url) {
      const url = coverVar.url || coverVar.src || coverVar;
      coverInnerStyle.backgroundImage = `linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 60%), url(${url})`;
      coverInnerStyle.backgroundSize = "cover";
      coverInnerStyle.backgroundPosition = coverVar.focalPoint || "center";
    } else if (coverVar.type === "gradient" || coverVar.colorPalette) {
      const palette = coverVar.colorPalette || coverVar.colors || ["#eef2ff", "#fef3c7"];
      coverInnerStyle.background = `linear-gradient(135deg, ${palette[0]}, ${palette[1] || palette[0]})`;
    } else if (typeof coverVar === "string") {
      if (/^https?:\/\//.test(coverVar) || coverVar.startsWith("/")) {
        coverInnerStyle.backgroundImage = `url(${coverVar})`;
        coverInnerStyle.backgroundSize = "cover";
        coverInnerStyle.backgroundPosition = "center";
      } else {
        coverInnerStyle.background = coverVar;
      }
    } else {
      coverInnerStyle.background = "linear-gradient(135deg,#eef2ff,#fef3c7)";
    }
  } else {
    coverInnerStyle.background = "linear-gradient(135deg,#eef2ff,#fef3c7)";
  }

  const activeStyle = isActive
    ? { border: "2px solid var(--accent-primary)", boxShadow: "0 8px 24px rgba(2,6,23,0.12)" }
    : { border: "1px solid var(--border-primary)" };

  return (
    <div
      role="option"
      aria-selected={isActive}
      data-template-id={template.id}
      tabIndex={0}
      className={`template-card ${isActive ? "is-active" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview?.(template);
        }
      }}
      onClick={() => onPreview?.(template)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 12,
        background: "var(--bg-primary)",
        cursor: "pointer",
        transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hovered ? "0 12px 32px rgba(15, 23, 42, 0.14)" : "0 2px 8px rgba(15, 23, 42, 0.04)",
        overflow: "hidden",
        ...activeStyle,
      }}
    >
      {/* Cover Area */}
      <div
        className="template-card-cover"
        style={{
          position: "relative",
          height: 120,
          width: "100%",
        }}
      >
        <div style={{ width: "100%", height: "100%", ...coverInnerStyle }} />

        {/* Hover Action Overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: hovered ? 1 : 0,
            transition: "opacity 150ms ease",
            backdropFilter: "blur(2px)",
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onUse?.(template); }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: "var(--accent-primary)",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            <Plus size={16} /> Use
          </button>
        </div>

        {/* Favorite Button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(template); }}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            background: isFavorite ? "var(--accent-primary)" : "rgba(15, 23, 42, 0.4)",
            color: isFavorite ? "#fff" : "rgba(255,255,255,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(4px)",
            opacity: hovered || isFavorite ? 1 : 0,
            transition: "all 150ms ease",
          }}
        >
          <Star size={16} fill={isFavorite ? "#fff" : "none"} />
        </button>
      </div>

      {/* Body Area */}
      <div style={{ padding: "16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: template.iconBg || "var(--bg-secondary)",
            color: template.iconColor || "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {Icon ? <Icon size={18} /> : <FileText size={18} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            {template.label}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.4 }}>
            {template.description}
          </div>
        </div>
      </div>
    </div>
  );
}