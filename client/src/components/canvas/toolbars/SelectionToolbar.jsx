import { useState, useRef, useEffect } from "react";
import {
  Bold,
  Code,
  Code2,
  Highlighter,
  Italic,
  Link,
  List,
  ListOrdered,
  MessageSquarePlus,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Strikethrough,
  Underline,
  Palette,
  Type,
  RemoveFormatting,
  Pilcrow,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from "lucide-react";

const TEXT_COLORS = [
  { label: "Default", value: "" },
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Yellow", value: "#eab308" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Pink", value: "#ec4899" },
];

const HIGHLIGHT_COLORS = [
  { label: "None", value: "" },
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Purple", value: "#e9d5ff" },
  { label: "Orange", value: "#fed7aa" },
  { label: "Red", value: "#fecaca" },
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
  return <span className="canvas-selection-divider" />;
}

function ColorDropdown({ icon: Icon, label, colors, activeColor, onSelect }) {
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

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <ToolbarButton
        label={label}
        active={open || !!activeColor}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon size={15} />
      </ToolbarButton>
      {open && (
        <div
          className="canvas-color-dropdown"
          onMouseDown={(e) => e.preventDefault()}
        >
          {colors.map((c) => (
            <button
              key={c.label}
              type="button"
              title={c.label}
              className={`canvas-color-swatch${c.value === activeColor ? " is-active" : ""}`}
              style={{
                background: c.value || "transparent",
                border: c.value ? "none" : "1px dashed var(--text-muted)",
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(c.value);
                setOpen(false);
              }}
            >
              {!c.value && (
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  ∅
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SelectionToolbar({ editor, toolbar, onComment }) {
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

  const activeTextColor = editor.getAttributes("textStyle")?.color || "";
  const activeHighlight = editor.getAttributes("highlight")?.color || "";

  return (
    <div
      className="canvas-selection-toolbar"
      style={{ left: `${toolbar.x}px`, top: `${toolbar.y}px` }}
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Headings */}
      <ToolbarButton
        label="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={15} />
      </ToolbarButton>
      <ToolbarDivider />

      {/* Inline formatting */}
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
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
      <ToolbarButton
        label="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={15} />
      </ToolbarButton>
      <ToolbarDivider />

      {/* Block formatting */}
      <ToolbarButton
        label="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Ordered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={15} />
      </ToolbarButton>
      <ToolbarDivider />

      {/* Text Alignment */}
      <ToolbarButton
        label="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Align center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Justify"
        active={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        <AlignJustify size={15} />
      </ToolbarButton>
      <ToolbarDivider />

      {/* Link */}
      <ToolbarButton
        label="Link"
        active={editor.isActive("link")}
        onClick={setLink}
      >
        <Link size={15} />
      </ToolbarButton>

      {/* Colors */}
      <ColorDropdown
        icon={Type}
        label="Text color"
        colors={TEXT_COLORS}
        activeColor={activeTextColor}
        onSelect={(color) => {
          if (color) {
            editor.chain().focus().setHighlight({ color }).run();
            console.log("set text color", color);
          } else {
            editor.chain().focus().unsetColor().run();
          }
        }}
      />
      <ColorDropdown
        icon={Highlighter}
        label="Highlight color"
        colors={HIGHLIGHT_COLORS}
        activeColor={activeHighlight}
        onSelect={(color) => {
          if (color) {
            editor.chain().focus().setHighlight({ color }).run();
            console.log("set highlight", color);
          } else {
            editor.chain().focus().unsetHighlight().run();
          }
        }}
      />

      {/* Clear formatting */}
      <ToolbarButton
        label="Clear formatting"
        onClick={() =>
          editor.chain().focus().clearNodes().unsetAllMarks().run()
        }
      >
        <RemoveFormatting size={15} />
      </ToolbarButton>

      {/* Comment */}
      <ToolbarDivider />
      <ToolbarButton label="Comment" onClick={onComment}>
        <MessageSquarePlus size={15} />
      </ToolbarButton>
    </div>
  );
}
