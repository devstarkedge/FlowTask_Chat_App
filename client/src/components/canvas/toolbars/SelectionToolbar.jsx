import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link,
  MessageSquarePlus,
  Strikethrough,
} from "lucide-react";

function ToolbarButton({ label, active, onClick, children }) {
  return (
    <button
      type="button"
      className={`canvas-selection-button${active ? " is-active" : ""}`}
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function SelectionToolbar({ editor, toolbar, onComment }) {
  if (!editor || !toolbar.visible) return null;

  const setLink = () => {
    const previous = editor.getAttributes("link").href;
    const href = window.prompt("Link URL", previous || "");
    if (href === null) return;

    if (href === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().setLink({ href }).run();
  };

  return (
    <div
      className="canvas-selection-toolbar"
      style={{ left: toolbar.x, top: toolbar.y }}
      role="toolbar"
      aria-label="Text formatting"
    >
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
        label="Strike"
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
      <ToolbarButton
        label="Highlight"
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter size={15} />
      </ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive("link")} onClick={setLink}>
        <Link size={15} />
      </ToolbarButton>
      <ToolbarButton label="Comment" onClick={onComment}>
        <MessageSquarePlus size={15} />
      </ToolbarButton>
    </div>
  );
}
