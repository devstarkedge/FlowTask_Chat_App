import { useEffect, useMemo, useState } from "react";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import debounce from "lodash/debounce";

export default function CanvasEditor({
  canvas,
  onSave,
}) {

  const [saveStatus, setSaveStatus] = useState("saved");

  // ─────────────────────────────────────────────────────────────
  // Debounced Save
  // ─────────────────────────────────────────────────────────────

  const debouncedSave = useMemo(() => {

    return debounce(async (json) => {

      try {

        setSaveStatus("saving");

        await onSave?.(json);

        setSaveStatus("saved");

      } catch (error) {

        console.error(error);

        setSaveStatus("error");
      }

    }, 2000);

  }, [onSave]);

  // ─────────────────────────────────────────────────────────────
  // Editor
  // ─────────────────────────────────────────────────────────────

  const editor = useEditor({

    extensions: [
      StarterKit,
    ],

    content: canvas?.content || {
      type: "doc",
      content: [],
    },

    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none min-h-full outline-none",
      },
    },

    onUpdate: ({ editor }) => {

      const json = editor.getJSON();

      debouncedSave(json);
    },
  });

  // ─────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {

    return () => {
      debouncedSave.cancel();
    };

  }, [debouncedSave]);

  // ─────────────────────────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────────────────────────

  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">

      {/* ───────────────────────────────────────────────────── */}
      {/* Header */}
      {/* ───────────────────────────────────────────────────── */}

      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)]">

        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {canvas?.title || "Untitled Canvas"}
        </h2>

        <div className="text-xs text-[var(--text-muted)]">

          {saveStatus === "saving" && "Saving..."}

          {saveStatus === "saved" && "Saved"}

          {saveStatus === "error" && "Save failed"}

        </div>
      </div>

      {/* ───────────────────────────────────────────────────── */}
      {/* Editor */}
      {/* ───────────────────────────────────────────────────── */}

      <div className="flex-1 overflow-auto p-5">

        <EditorContent editor={editor} />

      </div>
    </div>
  );
}