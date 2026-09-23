import {
  CheckSquare,
  Code2,
  Heading1,
  Image,
  List,
  ListOrdered,
  MessageSquareText,
  PanelRightOpen,
  Redo2,
  Table2,
  Undo2,
} from "lucide-react";

const TOOLBAR_PLUGINS = [
  {
    id: "history",
    controls: [
      {
        id: "undo",
        label: "Undo",
        icon: Undo2,
        run: (editor) => editor.chain().focus().undo().run(),
        disabled: (editor) => !editor.can().undo(),
      },
      {
        id: "redo",
        label: "Redo",
        icon: Redo2,
        run: (editor) => editor.chain().focus().redo().run(),
        disabled: (editor) => !editor.can().redo(),
      },
    ],
  },
  {
    id: "blocks",
    controls: [
      {
        id: "heading",
        label: "Heading",
        icon: Heading1,
        run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        active: (editor) => editor.isActive("heading", { level: 1 }),
      },
      {
        id: "bullet-list",
        label: "Bullet list",
        icon: List,
        run: (editor) => editor.chain().focus().toggleBulletList().run(),
        active: (editor) => editor.isActive("bulletList"),
      },
      {
        id: "ordered-list",
        label: "Number list",
        icon: ListOrdered,
        run: (editor) => editor.chain().focus().toggleOrderedList().run(),
        active: (editor) => editor.isActive("orderedList"),
      },
      {
        id: "task-list",
        label: "Checklist",
        icon: CheckSquare,
        run: (editor) => editor.chain().focus().toggleTaskList().run(),
        active: (editor) => editor.isActive("taskList"),
      },
    ],
  },
  {
    id: "insert",
    controls: [
      {
        id: "table",
        label: "Table",
        icon: Table2,
        run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        id: "code-block",
        label: "Code block",
        icon: Code2,
        run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
        active: (editor) => editor.isActive("codeBlock"),
      },
      {
        id: "image",
        label: "Image",
        icon: Image,
        run: (editor) => {
          const src = window.prompt("Image URL");
          if (src) editor.chain().focus().setImage({ src }).run();
        },
      },
    ],
  },
];

function ControlButton({ editor, control }) {
  const Icon = control.icon;
  const disabled = control.disabled?.(editor) || false;
  const active = control.active?.(editor) || false;

  return (
    <button
      type="button"
      className={`canvas-editor-toolbar-button${active ? " is-active" : ""}`}
      disabled={disabled}
      aria-label={control.label}
      title={control.label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => control.run(editor)}
    >
      <Icon size={15} />
    </button>
  );
}

export default function EditorToolbar({
  editor,
  visible,
  saveStatus,
  onOpenComments,
  onOpenHistory,
}) {
  if (!editor || !visible) return null;

  return (
    <div className="canvas-editor-toolbar" role="toolbar" aria-label="Canvas editor controls">
      {TOOLBAR_PLUGINS.map((plugin) => (
        <div className="canvas-editor-toolbar-group" key={plugin.id}>
          {plugin.controls.map((control) => (
            <ControlButton key={control.id} editor={editor} control={control} />
          ))}
        </div>
      ))}
      <div className="canvas-editor-toolbar-group">
        <button
          type="button"
          className="canvas-editor-toolbar-button"
          title="Comments"
          aria-label="Comments"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onOpenComments}
        >
          <MessageSquareText size={15} />
        </button>
        <button
          type="button"
          className="canvas-editor-toolbar-button"
          title="History"
          aria-label="History"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onOpenHistory}
        >
          <PanelRightOpen size={15} />
        </button>
      </div>
      <span className={`canvas-save-pill is-${saveStatus}`}>{saveStatus}</span>
    </div>
  );
}
