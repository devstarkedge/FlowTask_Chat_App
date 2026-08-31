import React from "react";
import { Loader2 } from "lucide-react";

/**
 * Reusable, centralized, theme-aware Loader component.
 * Adapts to Light/Dark themes and works in buttons, modals, cards, or fullscreen.
 *
 * Props:
 *   - size: number or 'xs' (12) | 'sm' (16) | 'md' (24) | 'lg' (40) | 'xl' (64)
 *   - color: CSS color string, defaults to 'var(--accent-primary)'
 *   - center: if true, centers the loader inside its parent with padding
 *   - fullscreen: if true, covers the viewport with a blurred overlay
 *   - label: text to display below the spinner
 *   - className: custom class for styling overrides
 */
export default function Loader({
  size = "md",
  color = "var(--accent-primary)",
  center = false,
  fullscreen = false,
  label = "",
  className = "",
  style = {},
}) {
  // Resolve size to pixel value
  const sizeMap = {
    xs: 12,
    sm: 16,
    md: 24,
    lg: 40,
    xl: 64,
  };
  const pixelSize = typeof size === "number" ? size : sizeMap[size] || 24;

  const spinner = (
    <div
      className={`centralized-loader-container ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        ...style,
      }}
    >
      <style>{`
        @keyframes centralLoaderSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .centralized-loader-icon {
          animation: centralLoaderSpin 1.1s linear infinite;
          color: ${color};
          flex-shrink: 0;
        }
        .centralized-loader-label {
          margin: 0;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary, #8b949e);
          text-align: center;
          font-family: var(--font-sans);
          letter-spacing: -0.01em;
        }
      `}</style>
      <Loader2
        size={pixelSize}
        className="centralized-loader-icon"
      />
      {label && <p className="centralized-loader-label">{label}</p>}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="centralized-loader-fullscreen"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10002,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--preview-overlay, rgba(10, 8, 69, 0.4))",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {spinner}
      </div>
    );
  }

  if (center) {
    return (
      <div
        className="centralized-loader-center"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          minHeight: 120,
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        {spinner}
      </div>
    );
  }

  return spinner;
}
