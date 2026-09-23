import React, { useState, useMemo, useEffect } from "react";
import TemplateCard from "./TemplateCard";

export default function TemplateGallery({
  templates = [],
  categories = [],
  onUse,
  onPreview,
  onDuplicate,
  onToggleFavorite,
  activeTemplateId = null,
}) {
  const [favorites, setFavorites] = useState(new Set());

  // Load persisted favorites from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ft_template_favs");
      if (raw) {
        const arr = JSON.parse(raw);
        setFavorites(new Set(arr));
      }
    } catch (err) {
      // ignore
    }
  }, []);

  const toggleFavorite = (tpl) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(tpl.id)) next.delete(tpl.id);
      else next.add(tpl.id);
      try {
        localStorage.setItem("ft_template_favs", JSON.stringify(Array.from(next)));
      } catch (err) {
        // ignore
      }
      onToggleFavorite?.(tpl, next.has(tpl.id));
      return next;
    });
  };

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    const groups = {};
    templates.forEach((t) => {
      const cat = t.category || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return groups;
  }, [templates]);

  const groupKeys = Object.keys(groupedTemplates).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, paddingBottom: 40 }}>
      {groupKeys.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No templates found
        </div>
      )}

      {groupKeys.map((category) => (
        <div key={category}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: "var(--text-muted)",
              marginBottom: 12,
              paddingLeft: 4,
            }}
          >
            {category}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {groupedTemplates[category].map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                isFavorite={favorites.has(t.id)}
                isActive={activeTemplateId === t.id}
                onUse={(tpl) => onUse?.(tpl)}
                onPreview={(tpl) => onPreview?.(tpl)}
                onDuplicate={(tpl) => onDuplicate?.(tpl)}
                onToggleFavorite={(tpl) => toggleFavorite(tpl)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
