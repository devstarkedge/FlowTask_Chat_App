import React, { useCallback } from "react";
import BlockItem from "./BlockItem";
import { useCanvasStore } from "../../../stores/canvasStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";

function arrayMove(arr, from, to) {
  const next = arr.slice();
  const item = next.splice(from, 1)[0];
  next.splice(to, 0, item);
  return next;
}

export default function BlockList() {
  const blocks = useCanvasStore((s) => s.blocks);
  const reorderBlocks = useCanvasStore((s) => s.reorderBlocks);
  const setDragging = useCanvasUiStore((s) => s.setDragging);

  const moveUp = useCallback(
    (index) => {
      if (index <= 0) return;
      setDragging({ active: false, blockIds: [] });
      const ids = blocks.map((b) => b._id);
      const next = arrayMove(ids, index, index - 1);
      reorderBlocks(next);
    },
    [blocks, reorderBlocks, setDragging],
  );

  const moveDown = useCallback(
    (index) => {
      if (index >= blocks.length - 1) return;
      setDragging({ active: false, blockIds: [] });
      const ids = blocks.map((b) => b._id);
      const next = arrayMove(ids, index, index + 1);
      reorderBlocks(next);
    },
    [blocks, reorderBlocks, setDragging],
  );

  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="canvas-block-list" aria-label="Canvas block list">
      {blocks.map((b, i) => (
        <BlockItem key={b._id} block={b} index={i} onMoveUp={() => moveUp(i)} onMoveDown={() => moveDown(i)} />
      ))}
    </div>
  );
}
