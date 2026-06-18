/**
 * useCanvasTyping.js — Typing indicator emission for collaborative presence.
 *
 * Detects typing activity and emits per-block typing state (start/stop)
 * along with caret coordinates for remote typing bubbles.
 */
import { useEffect } from "react";
import debounce from "lodash/debounce";
import { useCanvasCollabStore } from "../../../stores/canvasCollabStore";

/**
 * @param {object} editor     - TipTap editor instance
 * @param {object} providerRef - Mutable ref to latest Hocuspocus provider
 */
export function useCanvasTyping(editor, providerRef) {
  useEffect(() => {
    if (!editor) return undefined;

    let lastBlockId = null;
    const stopTypingDebounced = debounce((blockId) => {
      if (blockId) useCanvasCollabStore.getState().setBlockTyping(blockId, false);
      try {
        const local =
          providerRef.current?.awareness?.getLocalState()?.user || {};
        // Clear typing/activity state when typing stops
        providerRef.current?.awareness?.setLocalStateField("user", {
          ...local,
          activity: "viewing canvas",
          typing: false,
        });
      } catch (e) {
        // ignore
      }
    }, 1400);

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

    const handleKey = () => {
      try {
        const blockId = getBlockIdFromSelection(editor);
        if (!blockId) return;
        if (lastBlockId && lastBlockId !== blockId) {
          useCanvasCollabStore.getState().setBlockTyping(lastBlockId, false);
        }
        lastBlockId = blockId;
        useCanvasCollabStore.getState().setBlockTyping(blockId, true);
        stopTypingDebounced(blockId);

        // Emit current caret coordinates for remote typing bubble positioning
        try {
          const pos = editor.state.selection.from;
          const coords = editor.view.coordsAtPos(pos);
          const container = document.querySelector(".canvas-document-surface");
          const containerRect = container
            ? container.getBoundingClientRect()
            : { left: 0, top: 0 };
          const x = Math.round(coords.left - containerRect.left);
          const y = Math.round(coords.top - containerRect.top);
          useCanvasCollabStore.getState().updateCursor(blockId, x, y);
          try {
            const local =
              providerRef.current?.awareness?.getLocalState()?.user || {};
            providerRef.current?.awareness?.setLocalStateField("user", {
              ...local,
              cursor: { blockId, x, y },
              activity: "typing",
              typing: true,
            });
          } catch (e) {
            // ignore awareness set errors
          }
        } catch (err) {
          // ignore positioning errors
        }
      } catch (err) {
        // ignore
      }
    };

    const dom = editor.view?.dom;
    if (dom && dom.addEventListener) {
      dom.addEventListener("keydown", handleKey);
      dom.addEventListener("input", handleKey);
      dom.addEventListener("compositionstart", handleKey);
    }

    return () => {
      stopTypingDebounced.cancel();
      if (dom && dom.removeEventListener) {
        dom.removeEventListener("keydown", handleKey);
        dom.removeEventListener("input", handleKey);
        dom.removeEventListener("compositionstart", handleKey);
      }
      if (lastBlockId)
        useCanvasCollabStore.getState().setBlockTyping(lastBlockId, false);
    };
  }, [editor, providerRef]);
}
