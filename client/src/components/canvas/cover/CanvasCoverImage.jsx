import { useMemo } from "react";

/**
 * CanvasCoverImage — Pure presentational component for cover image rendering.
 * Handles gradient, color, and image cover types with proper styling.
 */
export default function CanvasCoverImage({ cover, yOffset = 50, isDragging = false }) {
  const coverStyle = useMemo(() => {
    if (!cover) {
      return {
        background: "linear-gradient(135deg, #1e293b 0%, #334155 60%, #475569 100%)",
      };
    }

    if (cover.type === "gradient" || cover.type === "color") {
      return { background: cover.value };
    }

    if (cover.type === "image") {
      return {
        backgroundImage: `url(${cover.value})`,
        backgroundSize: "cover",
        backgroundPosition: `center ${yOffset}%`,
      };
    }

    return {};
  }, [cover, yOffset]);

  return (
    <div
      style={{
        ...coverStyle,
        width: "100%",
        height: "100%",
        minHeight: "var(--canvas-cover-height, 240px)",
        position: "relative",
        cursor: cover?.type === "image" ? (isDragging ? "grabbing" : "grab") : "default",
        overflow: "hidden",
        userSelect: "none",
      }}
    />
  );
}