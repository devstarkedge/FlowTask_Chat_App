import React, { useRef } from "react";
import {
  Plus,
  X,
  Smile,
  Paperclip,
  CheckSquare,
  Table2,
  Heading1,
  List,
  ListOrdered,
  Code2,
  Undo2,
  Redo2,
  AtSign,
  LayoutGrid,
} from "lucide-react";

export default function CanvasBottomToolbar({
  editor,
  showBottomToolbar,
  isInsertMenuOpen,
  onToggleInsertMenu,
  onEmojiClick,
  onFileClick,
  onMentionClick,
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

        {/* Heading 1 */}
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
          <span className="canvas-toolbar-aa-label">H</span>
        </button>

        {/* Ordered List */}
        <button
          className={`canvas-toolbar-btn ${
            editor.isActive("orderedList") ? "is-active" : ""
          }`}
          title="Numbered list (Ctrl+Shift+7)"
          aria-label="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </button>

        {/* Bullet List */}
        <button
          className={`canvas-toolbar-btn ${
            editor.isActive("bulletList") ? "is-active" : ""
          }`}
          title="Bullet list (Ctrl+Shift+8)"
          aria-label="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
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

        <span className="canvas-toolbar-divider" />

        {/* Mention @ */}
        <button
          className="canvas-toolbar-btn"
          title="Mention a user (@)"
          aria-label="Mention user"
          onClick={onMentionClick}
        >
          <AtSign size={16} />
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

        {/* Code Block */}
        <button
          className={`canvas-toolbar-btn ${
            editor.isActive("codeBlock") ? "is-active" : ""
          }`}
          title="Code block (Ctrl+Alt+C)"
          aria-label="Code block"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 size={16} />
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

        <span className="canvas-toolbar-divider" />

        {/* Undo */}
        <button
          className="canvas-toolbar-btn"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={16} />
        </button>

        {/* Redo */}
        <button
          className="canvas-toolbar-btn"
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={16} />
        </button>
      </div>
    </div>
  );
}