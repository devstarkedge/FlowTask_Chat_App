import React from 'react';

/**
 * EmojiComponent
 * A shared source of truth for rendering emojis consistently across the app.
 * Ensures consistent font-family rendering on all platforms.
 */
export function EmojiComponent({ emoji, size = 16, className = '', style = {} }) {
  if (!emoji) return null;
  
  return (
    <span
      className={`emoji-component ${className}`}
      style={{
        fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif',
        fontSize: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        ...style
      }}
      role="img"
      aria-label={emoji}
    >
      {emoji}
    </span>
  );
}

/**
 * EmojiRenderer
 * Default export matching standard naming.
 */
export default EmojiComponent;

/**
 * ReactionRenderer
 * Standardized component for rendering a reaction button with consistent emojis.
 */
export function ReactionRenderer({ emoji, count, hasReacted, onClick }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(emoji);
      }}
      title={`${emoji} ${count}`}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-all reaction-renderer"
      style={{
        background: hasReacted
          ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)"
          : "var(--bg-hover)",
        border: `1px solid ${hasReacted ? "var(--accent-primary)" : "var(--border-secondary)"}`,
        color: hasReacted ? "var(--accent-primary)" : "var(--text-primary)",
      }}
    >
      <EmojiComponent emoji={emoji} size={14} /> 
      <span style={{ fontWeight: hasReacted ? 600 : 500, fontSize: 11 }}>{count}</span>
    </button>
  );
}
