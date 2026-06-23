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

export function ReactionRenderer({ emoji, count, hasReacted, onClick }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(emoji);
      }}
      title={`${emoji} ${count}`}
      className="reaction-renderer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        padding: '3px 8px',
        minHeight: '22px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: hasReacted ? '600' : '500',
        lineHeight: '1',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        background: hasReacted
          ? "color-mix(in srgb, var(--accent-primary, var(--accent-color, #1264a3)) 12%, transparent)"
          : "var(--bg-hover, rgba(255,255,255,0.05))",
        border: `1px solid ${hasReacted ? "var(--accent-primary, var(--accent-color, #1264a3))" : "var(--border-secondary, rgba(255,255,255,0.12))"}`,
        color: hasReacted ? "var(--accent-primary, var(--accent-color, #1264a3))" : "var(--text-primary, #d1d2d3)",
        outline: 'none',
        userSelect: 'none',
      }}
    >
      <EmojiComponent emoji={emoji} size={13} /> 
      <span style={{ fontSize: '11px', display: 'inline-block', color: 'inherit' }}>{count}</span>
    </button>
  );
}
