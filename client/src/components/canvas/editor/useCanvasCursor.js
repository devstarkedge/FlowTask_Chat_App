/**
 * useCanvasCursor.js — Cursor position emission for collaborative presence.
 *
 * Emits cursor position on selectionUpdate so other peers can show a
 * lightweight presence cursor anchored to the block DOM element.
 */
import { useEffect } from "react";
import debounce from "lodash/debounce";
import { useCanvasCollabStore } from "../../../stores/canvasCollabStore";

/**
 * @param {object} editor     - TipTap editor instance
 * @param {object} providerRef - Mutable ref to latest Hocuspocus provider
 */
export function useCanvasCursor(editor, providerRef) {
  useEffect(() => {
    if (!editor) return undefined;

    const getBlockIdFromSelection = (ed) => {
      try {
        const { $from } = ed.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          const n = $from.node(d);
          if (!n) continue;
          const name = n?.type?.name;
          if (["paragraph", "heading", "taskItem"].includes(name)) {
            return n.attrs?.blockId || null;
          }
        }
      } catch (e) {
        // ignore
      }
      return null;
    };

    const sendCursor = () => {
      try {
        const blockId = getBlockIdFromSelection(editor);
        if (!blockId) return;
        const el = document.querySelector(`[data-block-id="${blockId}"]`);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const container = document.querySelector(".canvas-document-surface");
        const containerRect = container
          ? container.getBoundingClientRect()
          : { left: 0, top: 0 };
        const x = Math.round(rect.right - containerRect.left);
        const y = Math.round(rect.top - containerRect.top);
        useCanvasCollabStore.getState().updateCursor(blockId, x, y);
        try {
          const local =
            providerRef.current?.awareness?.getLocalState()?.user || {};
          providerRef.current?.awareness?.setLocalStateField("user", {
            ...local,
            cursor: { blockId, x, y },
          });
        } catch (e) {
          // ignore awareness update errors
        }
      } catch (err) {
        // ignore
      }
    };

    const debouncedSend = debounce(sendCursor, 120);
    const onSelection = () => debouncedSend();

    editor.on("selectionUpdate", onSelection);

    return () => {
      try {
        editor.off("selectionUpdate", onSelection);
      } catch (e) {}
      debouncedSend.cancel();
    };
  }, [editor, providerRef]);
}
