import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Bold,
  Code,
  Code2,
  Italic,
  Link,
  List,
  ListOrdered,
  MessageSquarePlus,
  Strikethrough,
  Underline,
  Pilcrow,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Smile,
  ChevronDown,
  CheckSquare,
} from "lucide-react";

const BLOCK_TYPES = [
  { 
    id: "paragraph", 
    label: "Paragraph", 
    icon: Pilcrow, 
    shortcut: "Ctrl+Alt+0", 
    action: (editor) => editor.chain().focus().setParagraph().run(), 
    isActive: (editor) => editor.isActive("paragraph") 
  },
  { 
    id: "h1", 
    label: "Big heading", 
    icon: () => <span style={{ fontWeight: "bold", fontSize: 13, fontFamily: "var(--font-sans)" }}>H1</span>, 
    shortcut: "Ctrl+Alt+1", 
    action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(), 
    isActive: (editor) => editor.isActive("heading", { level: 1 }) 
  },
  { 
    id: "h2", 
    label: "Medium heading", 
    icon: () => <span style={{ fontWeight: "bold", fontSize: 13, fontFamily: "var(--font-sans)" }}>H2</span>, 
    shortcut: "Ctrl+Alt+2", 
    action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(), 
    isActive: (editor) => editor.isActive("heading", { level: 2 }) 
  },
  { 
    id: "h3", 
    label: "Small heading", 
    icon: () => <span style={{ fontWeight: "bold", fontSize: 13, fontFamily: "var(--font-sans)" }}>H3</span>, 
    shortcut: "Ctrl+Alt+3", 
    action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(), 
    isActive: (editor) => editor.isActive("heading", { level: 3 }) 
  },
  { 
    id: "taskList", 
    label: "Check list", 
    icon: CheckSquare, 
    shortcut: "Ctrl+Shift+9", 
    action: (editor) => editor.chain().focus().toggleTaskList().run(), 
    isActive: (editor) => editor.isActive("taskList") 
  },
  { 
    id: "orderedList", 
    label: "Ordered list", 
    icon: ListOrdered, 
    shortcut: "Ctrl+Shift+7", 
    action: (editor) => editor.chain().focus().toggleOrderedList().run(), 
    isActive: (editor) => editor.isActive("orderedList") 
  },
  { 
    id: "bulletList", 
    label: "Bulleted list", 
    icon: List, 
    shortcut: "Ctrl+Shift+8", 
    action: (editor) => editor.chain().focus().toggleBulletList().run(), 
    isActive: (editor) => editor.isActive("bulletList") 
  },
  { 
    id: "codeBlock", 
    label: "Code block", 
    icon: Code2, 
    shortcut: "Ctrl+Alt+Shift+C", 
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(), 
    isActive: (editor) => editor.isActive("codeBlock") 
  },
];

function ToolbarButton({ label, active, onClick, children, disabled }) {
  return (
    <button
      type="button"
      className={`canvas-selection-button${active ? " is-active" : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <span
      className="canvas-selection-divider"
      style={{
        display: "inline-block",
        width: 1,
        height: 20,
        background: "var(--border-primary, rgba(255,255,255,0.15))",
        margin: "0 6px",
        flexShrink: 0,
      }}
    />
  );
}

function BlockSelector({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeBlock = BLOCK_TYPES.find(b => b.isActive(editor)) || BLOCK_TYPES[0];
  const ActiveIcon = activeBlock.icon;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="canvas-selection-button block-selector-btn"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 8px",
          width: "auto",
          height: 34,
          color: "var(--text-secondary)",
          background: "transparent",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <ActiveIcon size={15} />
        <ChevronDown size={12} style={{ opacity: 0.8 }} />
      </button>
      {open && (
        <div
          className="canvas-block-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 1010,
            width: 260,
            background: "var(--bg-primary, #1e1f22)",
            border: "1px solid var(--border-primary, rgba(255,255,255,0.1))",
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            padding: "4px 0",
            display: "flex",
            flexDirection: "column",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {BLOCK_TYPES.map((b) => {
            const isActive = b.isActive(editor);
            const Icon = b.icon;
            return (
              <button
                key={b.id}
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "transparent",
                  border: "none",
                  color: isActive ? "var(--accent-primary, #38bdf8)" : "var(--text-primary, #e2e8f0)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 13,
                  fontWeight: 500,
                  gap: 10,
                  width: "100%",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.08))"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => {
                  b.action(editor);
                  setOpen(false);
                }}
              >
                <span style={{ width: 12, display: "inline-flex", justifyContent: "center", fontWeight: "bold" }}>
                  {isActive ? "✓" : ""}
                </span>
                <span style={{ display: "inline-flex", width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
                  <Icon size={14} />
                </span>
                <span style={{ flex: 1 }}>{b.label}</span>
                {b.shortcut && (
                  <span style={{ fontSize: 10.5, color: "var(--text-muted, #94a3b8)", opacity: 0.8 }}>
                    {b.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AlignDropdown({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const alignments = [
    { value: "left", label: "Align left", icon: AlignLeft },
    { value: "center", label: "Align center", icon: AlignCenter },
    { value: "right", label: "Align right", icon: AlignRight },
    { value: "justify", label: "Justify", icon: AlignJustify },
  ];

  const activeAlign = alignments.find(a => editor.isActive({ textAlign: a.value })) || alignments[0];
  const ActiveIcon = activeAlign.icon;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <ToolbarButton
        label="Align text"
        active={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ActiveIcon size={15} />
      </ToolbarButton>
      {open && (
        <div
          className="canvas-align-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1010,
            background: "var(--bg-primary, #1e1f22)",
            border: "1px solid var(--border-primary, rgba(255,255,255,0.1))",
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            padding: "4px",
            display: "flex",
            gap: 4,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {alignments.map((a) => {
            const isActive = editor.isActive({ textAlign: a.value });
            const Icon = a.icon;
            return (
              <button
                key={a.value}
                type="button"
                title={a.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  border: "none",
                  background: isActive ? "var(--bg-hover, rgba(255,255,255,0.12))" : "transparent",
                  color: isActive ? "var(--accent-primary, #38bdf8)" : "var(--text-secondary, #94a3b8)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => !isActive && (e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.08))")}
                onMouseLeave={(e) => !isActive && (e.currentTarget.style.background = "transparent")}
                onClick={() => {
                  editor.chain().focus().setTextAlign(a.value).run();
                  setOpen(false);
                }}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SelectionToolbar = React.memo(function SelectionToolbar({ editor, toolbar, onComment }) {
  if (!editor || !toolbar.visible) return null;

  const setLink = () => {
    const previous = editor.getAttributes("link").href;
    const href = window.prompt("Link URL", previous || "");
    if (href === null) return;
    if (href === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div
      className="canvas-selection-toolbar"
      style={{ left: `${toolbar.x}px`, top: `${toolbar.y}px` }}
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* 1. Paragraph / Heading Dropdown */}
      <BlockSelector editor={editor} />
      <ToolbarDivider />

      {/* 2. Bold, Italic, Underline, Strikethrough */}
      <ToolbarButton
        label="Bold (Ctrl+B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Italic (Ctrl+I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Underline (Ctrl+U)"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={15} />
      </ToolbarButton>
      <ToolbarDivider />

      {/* 3. Bullet list, Inline Code, Link, Text Align Dropdown */}
      <ToolbarButton
        label="Bulleted list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Link"
        active={editor.isActive("link")}
        onClick={setLink}
      >
        <Link size={15} />
      </ToolbarButton>
      <AlignDropdown editor={editor} />
      <ToolbarDivider />

      {/* 4. Reaction / Comment */}
      <ToolbarButton
        label="Add reaction"
        onClick={() => {
          // Open comments sidebar as a placeholder for reactions/comments
          onComment?.();
        }}
      >
        <Smile size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Comment"
        onClick={onComment}
      >
        <MessageSquarePlus size={15} />
      </ToolbarButton>
    </div>
  );
});

export default SelectionToolbar;
