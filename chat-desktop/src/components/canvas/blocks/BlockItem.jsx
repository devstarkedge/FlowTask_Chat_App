import React from "react";

export default function BlockItem({ block, index, onMoveUp, onMoveDown }) {
  const excerpt = (() => {
    if (!block) return "";
    if (typeof block.content === "string") return block.content.slice(0, 120);
    try {
      if (block.content?.text) return block.content.text.slice(0, 120);
    } catch (e) {
      // ignore
    }
    return JSON.stringify(block.content).slice(0, 120);
  })();

  return (
    <div className="canvas-block-item" role="article" aria-label={`Block ${block.type || "block"}`}>
      <div className="block-drag-handle" role="group">
        <button className="block-move-btn" onClick={onMoveUp} aria-label="Move block up">▲</button>
        <button className="block-move-btn" onClick={onMoveDown} aria-label="Move block down">▼</button>
      </div>
      <div className="block-body">
        <div className="block-type">{block.type || "block"}</div>
        <div className="block-excerpt">{excerpt}</div>
      </div>
    </div>
  );
}

