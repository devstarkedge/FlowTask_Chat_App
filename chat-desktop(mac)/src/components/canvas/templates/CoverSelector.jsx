import React from "react";

export default function CoverSelector({ template, selectedVariationId, onSelectVariation }) {
  const cover = template?.cover;
  if (!cover) return null;

  const variations = Array.isArray(cover) ? cover : (cover.variations || [cover]);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {variations.map((v) => {
        const key = v.id || (v.url || v.type || JSON.stringify(v));
        const thumbStyle = {};
        if (v.url) {
          thumbStyle.backgroundImage = `url(${v.url})`;
          thumbStyle.backgroundSize = "cover";
          thumbStyle.backgroundPosition = v.focalPoint || "center";
        } else if (v.type === "gradient" || v.colorPalette) {
          const palette = v.colorPalette || v.colors || ["#eef2ff", "#fef3c7"];
          thumbStyle.background = `linear-gradient(135deg, ${palette[0]}, ${palette[1] || palette[0]})`;
        } else if (v.type === "photo" && v.prompt) {
          thumbStyle.background = "linear-gradient(90deg,#eee,#ddd)";
        } else {
          thumbStyle.background = "linear-gradient(90deg,#f3f4f6,#e5e7eb)";
        }

        return (
          <button
            key={key}
            onClick={() => onSelectVariation?.(v)}
            title={v.type || v.id}
            style={{
              width: 120,
              height: 68,
              borderRadius: 8,
              border: selectedVariationId === v.id ? "2px solid var(--accent-primary)" : "1px solid var(--border-primary)",
              overflow: "hidden",
              cursor: "pointer",
              padding: 0,
              background: "transparent",
            }}
          >
            <div style={{ width: "100%", height: "100%", ...thumbStyle }} />
          </button>
        );
      })}
    </div>
  );
}
