import { useState } from "react";

import CanvasMenu from "./CanvasMenu";
import CanvasEditor from "./CanvasEditor";
import TemplateSelector from "./TemplateSelector";

export default function CanvasPanel() {

  const [canvasView, setCanvasView] =
    useState(null);

  // ─────────────────────────────────────────────
  // Menu
  // ─────────────────────────────────────────────

  if (!canvasView) {
    return (
      <CanvasMenu
        onSelect={(type) => {

          if (type === "blank") {
            setCanvasView("editor");
          }

          if (type === "template") {
            setCanvasView("template");
          }

          if (type === "existing") {
            setCanvasView("existing");
          }
        }}
      />
    );
  }

  // ─────────────────────────────────────────────
  // Template Selector
  // ─────────────────────────────────────────────

  if (canvasView === "template") {
    return (
      <TemplateSelector />
    );
  }

  // ─────────────────────────────────────────────
  // Existing Canvas
  // ─────────────────────────────────────────────

  if (canvasView === "existing") {
    return (
      <div className="p-5">
        Existing canvases list
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Editor
  // ─────────────────────────────────────────────

  return (
    <CanvasEditor />
  );
}