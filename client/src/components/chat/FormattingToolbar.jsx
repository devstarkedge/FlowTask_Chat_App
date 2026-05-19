/**
 * FormattingToolbar — shared rich-text formatting toolbar.
 *
 * Used by both MessageInput (full composer) and InlineEditor (message edit).
 * Accepts an editorRef (RichTextEditor imperative handle) and a formatState
 * object. All toggle actions are fired through the editorRef so focus is never
 * stolen from the TipTap editor.
 *
 * Props
 * ─────
 * editorRef      – React ref whose .current is the RichTextEditor imperative API
 * formatState    – { bold, italic, underline, strike, bulletList, orderedList,
 *                    blockquote, code, codeBlock }
 * onFormatChange – optional callback fired after every toggle (use to re-sync
 *                    formatState in the parent)
 * variant        – 'full' (all controls, default) | 'compact' (inline editor subset)
 * className      – extra class on the toolbar wrapper
 */

import { memo, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Braces,
  List,
  ListOrdered,
  Quote,
  Link,
} from "lucide-react";

// ─── Toolbar Button ──────────────────────────────────────────────────────────

export const ToolbarBtn = memo(function ToolbarBtn({
  icon: Icon,
  title,
  onClick,
  active = false,
  size = 14,
  disabled = false,
}) {
  return (
    <button
      type="button"
      className={`ft-btn${active ? " ft-btn--active" : ""}${disabled ? " ft-btn--disabled" : ""}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep editor focused
      onClick={onClick}
    >
      <Icon size={size} strokeWidth={1.9} />
    </button>
  );
});

// ─── Divider ─────────────────────────────────────────────────────────────────

export function ToolbarDivider() {
  return <span className="ft-divider" aria-hidden="true" />;
}

// ─── Inject shared CSS (once) ────────────────────────────────────────────────

const FT_STYLE_ID = "formatting-toolbar-styles";
if (typeof document !== "undefined" && !document.getElementById(FT_STYLE_ID)) {
  const s = document.createElement("style");
  s.id = FT_STYLE_ID;
  s.textContent = `
    /* ── Toolbar container ── */
    .ft-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-wrap: wrap;
    }

    /* ── Button ── */
    .ft-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 26px;
      border-radius: 5px;
      border: none;
      background: transparent;
      color: var(--text-secondary, #9b9b9b);
      cursor: pointer;
      transition: background 110ms ease, color 110ms ease, transform 80ms ease;
      flex-shrink: 0;
    }
    .ft-btn:hover {
      background: var(--bg-hover, rgba(255,255,255,0.08));
      color: var(--text-white, #fff);
    }
    .ft-btn:active {
      transform: scale(0.92);
    }
    .ft-btn--active {
      background: color-mix(in srgb, var(--accent-primary, #1264a3) 22%, transparent);
      color: var(--accent-primary, #4da8ff);
    }
    .ft-btn--active:hover {
      background: color-mix(in srgb, var(--accent-primary, #1264a3) 30%, transparent);
    }
    .ft-btn--disabled {
      opacity: 0.35;
      cursor: not-allowed;
      pointer-events: none;
    }

    /* ── Divider ── */
    .ft-divider {
      display: inline-block;
      width: 1px;
      height: 16px;
      background: var(--border-primary, rgba(255,255,255,0.1));
      margin: 0 3px;
      flex-shrink: 0;
    }

    /* ── Group ── */
    .ft-group {
      display: flex;
      align-items: center;
      gap: 1px;
    }

    /* ──────────────────────────────────────────────────────────────────
       Rich-text message content — styles for HTML rendered by TipTap.
       Applied to .rich-message-content wrapper in MessageItem.
       ────────────────────────────────────────────────────────────────── */
    .rich-message-content {
      word-break: break-word;
      overflow-wrap: anywhere;
      line-height: 1.55;
    }

    /* Paragraphs */
    .rich-message-content p {
      margin: 0 0 0.25em 0;
    }
    .rich-message-content p:last-child {
      margin-bottom: 0;
    }
    .rich-message-content p:only-child {
      margin: 0;
    }

    /* Inline marks */
    .rich-message-content strong,
    .rich-message-content b { font-weight: 700; }
    .rich-message-content em,
    .rich-message-content i  { font-style: italic; }
    .rich-message-content u  { text-decoration: underline; }
    .rich-message-content s,
    .rich-message-content del,
    .rich-message-content strike { text-decoration: line-through; }

    /* Inline code */
    .rich-message-content code {
      font-family: 'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace;
      font-size: 0.875em;
      background: var(--bg-code, rgba(255,255,255,0.08));
      padding: 1px 5px;
      border-radius: 4px;
      color: var(--accent-yellow, #e8c46a);
    }

    /* Code block */
    .rich-message-content pre {
      background: var(--bg-code-block, rgba(0,0,0,0.25));
      border: 1px solid var(--border-secondary, rgba(255,255,255,0.1));
      border-radius: 6px;
      padding: 10px 14px;
      margin: 6px 0;
      overflow-x: auto;
    }
    .rich-message-content pre code {
      background: transparent;
      padding: 0;
      color: var(--text-primary, #d1d2d3);
      font-size: 13px;
    }

    /* Blockquote */
    .rich-message-content blockquote {
      border-left: 3px solid var(--accent-primary, #1264a3);
      margin: 4px 0;
      padding: 2px 10px;
      color: var(--text-secondary, #9b9b9b);
      font-style: italic;
    }

    /* Lists */
    .rich-message-content ul,
    .rich-message-content ol {
      margin: 4px 0;
      padding-left: 20px;
    }
    .rich-message-content ul { list-style-type: disc; }
    .rich-message-content ol { list-style-type: decimal; }
    .rich-message-content li { margin: 2px 0; }
    .rich-message-content li p { margin: 0; }

    /* Nested lists */
    .rich-message-content ul ul,
    .rich-message-content ol ol,
    .rich-message-content ul ol,
    .rich-message-content ol ul {
      margin: 2px 0;
    }

    /* Links */
    .rich-message-content a {
      color: var(--text-link, #4da8ff);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .rich-message-content a:hover {
      color: var(--accent-primary, #1264a3);
    }

    /* Headings (rarely used in chat but TipTap StarterKit includes them) */
    .rich-message-content h1,
    .rich-message-content h2,
    .rich-message-content h3,
    .rich-message-content h4,
    .rich-message-content h5,
    .rich-message-content h6 {
      font-weight: 700;
      margin: 6px 0 2px;
      line-height: 1.3;
    }
    .rich-message-content h1 { font-size: 1.4em; }
    .rich-message-content h2 { font-size: 1.25em; }
    .rich-message-content h3 { font-size: 1.1em; }

    /* Mention nodes */
    .rich-message-content .mention-tag {
      display: inline-block;
      background: color-mix(in srgb, var(--accent-primary, #1264a3) 18%, transparent);
      color: var(--accent-primary, #4da8ff);
      border-radius: 4px;
      padding: 0 4px;
      font-weight: 600;
      font-size: 0.92em;
      cursor: default;
    }
  `;
  document.head.appendChild(s);
}

// ─── FormattingToolbar ────────────────────────────────────────────────────────

/**
 * @param {{ editorRef: React.RefObject, formatState: object, onFormatChange?: () => void, variant?: 'full'|'compact', className?: string, onLinkClick?: () => void }} props
 */
function FormattingToolbar({
  editorRef,
  formatState = {},
  onFormatChange,
  variant = "full",
  className = "",
  onLinkClick,
}) {
  const fire = useCallback(
    (fn) => {
      fn();
      // Give TipTap one tick to update marks, then notify parent
      setTimeout(() => onFormatChange?.(), 0);
    },
    [onFormatChange],
  );

  const ed = editorRef?.current;

  return (
    <div
      className={`ft-toolbar ${className}`}
      role="toolbar"
      aria-label="Text formatting"
    >
      {/* ── Inline marks ── */}
      <div className="ft-group">
        <ToolbarBtn
          icon={Bold}
          title="Bold (Ctrl+B)"
          active={formatState.bold}
          onClick={() => fire(() => ed?.toggleBold())}
        />
        <ToolbarBtn
          icon={Italic}
          title="Italic (Ctrl+I)"
          active={formatState.italic}
          onClick={() => fire(() => ed?.toggleItalic())}
        />
        <ToolbarBtn
          icon={Underline}
          title="Underline (Ctrl+U)"
          active={formatState.underline}
          onClick={() => fire(() => ed?.toggleUnderline())}
        />
        <ToolbarBtn
          icon={Strikethrough}
          title="Strikethrough"
          active={formatState.strike}
          onClick={() => fire(() => ed?.toggleStrike())}
        />
      </div>

      <ToolbarDivider />

      {/* ── Lists ── */}
      <div className="ft-group">
        <ToolbarBtn
          icon={List}
          title="Bullet list"
          active={formatState.bulletList}
          onClick={() => fire(() => ed?.toggleBulletList())}
        />
        <ToolbarBtn
          icon={ListOrdered}
          title="Numbered list"
          active={formatState.orderedList}
          onClick={() => fire(() => ed?.toggleOrderedList())}
        />
      </div>

      <ToolbarDivider />

      {/* ── Block formats ── */}
      <div className="ft-group">
        <ToolbarBtn
          icon={Quote}
          title="Blockquote"
          active={formatState.blockquote}
          onClick={() => fire(() => ed?.toggleBlockquote())}
        />
        <ToolbarBtn
          icon={Code}
          title="Inline code"
          active={formatState.code}
          onClick={() => fire(() => ed?.toggleCode())}
        />
        {variant === "full" && (
          <ToolbarBtn
            icon={Braces}
            title="Code block"
            active={formatState.codeBlock}
            onClick={() => fire(() => ed?.toggleCodeBlock())}
          />
        )}
      </div>

      {/* Link button — only shown in full variant or when handler provided */}
      {(variant === "full" || onLinkClick) && (
        <>
          <ToolbarDivider />
          <div className="ft-group">
            <ToolbarBtn icon={Link} title="Insert link" onClick={onLinkClick} />
          </div>
        </>
      )}
    </div>
  );
}

export default memo(FormattingToolbar);
