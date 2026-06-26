import React from "react";
import {
  Plus,
  X,
  Smile,
  Paperclip,
  CheckSquare,
  Table2,
  LayoutGrid,
} from "lucide-react";

const CanvasBottomToolbar = React.memo(function CanvasBottomToolbar({
  editor,
  showBottomToolbar,
  isInsertMenuOpen,
  onToggleInsertMenu,
  onEmojiClick,
  onFileClick,
  emojiBtnRef,
  toggleBtnRef,
  children,
}) {
  if (!editor) return null;

  return (
    <div className="canvas-bottom-toolbar-container">
      {/* Insert Menu positioned above toolbar — rendered inside container */}
      {children}

      {/* Floating pill toolbar */}
      <div
        className={`canvas-bottom-toolbar ${showBottomToolbar ? "is-visible" : ""}`}
        role="toolbar"
        aria-label="Canvas formatting toolbar"
      >
        {/* Plus / X Menu Toggle */}
        <button
          ref={toggleBtnRef}
          className={`canvas-toolbar-btn canvas-toolbar-toggle ${
            isInsertMenuOpen ? "is-active" : ""
          }`}
          title="Insert menu"
          aria-label="Toggle insert menu"
          onClick={onToggleInsertMenu}
        >
          {isInsertMenuOpen ? <X size={16} /> : <Plus size={16} />}
        </button>

        <span className="canvas-toolbar-divider" />

        {/* Heading 1 (Aa) */}
        <button
          className={`canvas-toolbar-btn ${
            editor.isActive("heading", { level: 1 }) ? "is-active" : ""
          }`}
          title="Heading 1 (Ctrl+Alt+1)"
          aria-label="Heading 1"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          <span className="canvas-toolbar-aa-label">Aa</span>
        </button>

        {/* Emoji Selector */}
        <button
          ref={emojiBtnRef}
          className="canvas-toolbar-btn"
          title="Insert emoji"
          aria-label="Insert emoji"
          onClick={onEmojiClick}
        >
          <Smile size={16} />
        </button>

        {/* File Attachment */}
        <button
          className="canvas-toolbar-btn"
          title="Upload file (Ctrl+U)"
          aria-label="Upload file"
          onClick={onFileClick}
        >
          <Paperclip size={16} />
        </button>

        {/* Checklist */}
        <button
          className={`canvas-toolbar-btn ${
            editor.isActive("taskList") ? "is-active" : ""
          }`}
          title="Checklist"
          aria-label="Checklist"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <CheckSquare size={16} />
        </button>

        {/* Table */}
        <button
          className="canvas-toolbar-btn"
          title="Insert table"
          aria-label="Insert table"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <Table2 size={16} />
        </button>

        {/* Layout / Columns */}
        <button
          className="canvas-toolbar-btn"
          title="Insert columns"
          aria-label="Insert columns"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: "columns",
                attrs: { count: 3 },
                content: [
                  { type: "column", content: [{ type: "paragraph" }] },
                  { type: "column", content: [{ type: "paragraph" }] },
                  { type: "column", content: [{ type: "paragraph" }] },
                ],
              })
              .run()
          }
        >
          <LayoutGrid size={16} />
        </button>
      </div>
    </div>
  );
});

export default CanvasBottomToolbar;
