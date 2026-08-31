/**
 * Collab seeding + non-collab content sync.
 *
 * Handles seeding initial content into the Yjs fragment when it is empty,
 * and syncing content from the store in non-collab mode (with a localEditRef
 * guard to prevent cursor resets after file uploads / debounced saves).
 */
import { useEffect, useRef } from "react";
import { sanitizeDocJSON, EMPTY_DOC } from "./CanvasEditorCore";
import logger from "../../../utils/logger";

/**
 * @param {object} params
 * @param {object} params.editor     - TipTap editor instance
 * @param {object} params.canvas     - Canvas data object
 * @param {object} params.provider   - Hocuspocus provider (or null)
 * @param {object} params.ydoc       - Yjs document (or null)
 * @param {object} params.providerRef - Mutable ref to latest provider
 * @param {boolean} params.withCollab - Whether collab mode is active
 */
export function useCanvasContentSync({
  editor,
  canvas,
  provider,
  ydoc,
  providerRef,
  withCollab,
}) {
  const localEditRef = useRef(false);
  const initialContentSetRef = useRef(false);
  const previousCanvasIdRef = useRef(null);

  // Keep providerRef up to date
  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  // ─── Shared helper ───────────────────────────────────────────────

  /** Convert text tokens like {{name}} or [name] into templateVariable nodes */
  const convertTokensToVariableNodes = (editorInstance) => {
    if (!editorInstance) return;
    const { doc, tr, schema } = editorInstance.state;
    const varNodeType = schema.nodes.templateVariable;
    if (!varNodeType) return;

    const tokenPatterns = [/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, /\[([^\]]+)\]/g];
    const matches = [];

    doc.descendants((node, pos) => {
      if (!node.isText) return;
      const text = node.text || "";
      tokenPatterns.forEach((pat) => {
        let m;
        while ((m = pat.exec(text)) !== null) {
          const name = m[1];
          const start = pos + m.index;
          const end = start + m[0].length;
          matches.push({ start, end, name });
        }
      });
    });

    if (matches.length === 0) return;

    // Replace from end to start so positions remain valid
    matches
      .sort((a, b) => b.start - a.start)
      .forEach((m) => {
        const node = varNodeType.create({ name: m.name, value: "" });
        tr.replaceWith(m.start, m.end, node);
      });

    if (tr.docChanged) {
      editorInstance.view.dispatch(tr);
    }
  };

  // ─── Collab seeding ──────────────────────────────────────────────

  useEffect(() => {
    if (!editor || !ydoc || !canvas?.content) return undefined;

    const doc = ydoc;
    const prov = providerRef.current;
    const meta = doc.getMap("canvasMeta");
    let seeded = false;

    const seedIfNeeded = () => {
      if (seeded || meta.get("seeded")) return;

      const fragment = doc.getXmlFragment("prosemirror");
      const isEmpty = !fragment || fragment.length === 0;

      if (isEmpty) {
        const newJSON = sanitizeDocJSON(canvas.content || EMPTY_DOC);
        try {
          editor.commands.setContent(newJSON, false);
          convertTokensToVariableNodes(editor);
          meta.set("seeded", true);
          seeded = true;
          logger.info("[Canvas Collab] Seeded initial content", {
            canvasId: canvas._id,
          });
        } catch (err) {
          logger.warn("[Canvas Collab] Seeding failed", { error: err.message });
        }
      } else {
        logger.debug("[Canvas Collab] Yjs fragment not empty, skipping seed", {
          canvasId: canvas._id,
        });
        seeded = true;
      }
    };

    if (!prov || prov.synced) {
      seedIfNeeded();
    } else {
      const handleSynced = () => seedIfNeeded();
      prov.on("synced", handleSynced);
      return () => {
        try {
          prov.off("synced", handleSynced);
        } catch (e) {}
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas?.content, editor]);

  // ─── Non-collab content sync ─────────────────────────────────────
  //
  // IMPORTANT: This effect MUST always run when canvas?._id changes, even if
  // localEditRef is true from a previous canvas's edits.  The localEditRef
  // guard only applies when sync fires for the SAME canvas (to prevent cursor
  // reset after debounced saves / file uploads that update the store's content
  // pointer).  When switching to an entirely different canvas, the ref is
  // overridden below.

  useEffect(() => {
    if (!editor || providerRef.current) return undefined;

    const newCanvasId = canvas?._id;
    const prevCanvasId = previousCanvasIdRef.current;

    // Canvas switched — always sync, regardless of localEditRef state
    // from prior canvas interaction.
    if (newCanvasId && newCanvasId !== prevCanvasId) {
      localEditRef.current = false;
      initialContentSetRef.current = false;
      previousCanvasIdRef.current = newCanvasId;
    }

    // If the content change was triggered by a local edit on the *same* canvas,
    // skip setContent() to avoid cursor/selection reset.
    if (localEditRef.current) {
      localEditRef.current = false;
      return undefined;
    }

    try {
      const newJSON = sanitizeDocJSON(canvas?.content || EMPTY_DOC);
      const currentJSON =
        typeof editor.getJSON === "function" ? editor.getJSON() : null;

      // Also skip if content hasn't changed at all (prevents unnecessary DOM
      // churn on re-renders that don't change the actual document).
      if (currentJSON && JSON.stringify(currentJSON) === JSON.stringify(newJSON)) {
        return undefined;
      }

      editor.commands.setContent(newJSON, false);
      try {
        convertTokensToVariableNodes(editor);
      } catch (e) {
        console.warn("convertTokensToVariableNodes failed", e);
      }
      initialContentSetRef.current = true;
    } catch (e) {
      console.warn("non-collab content sync failed", e);
    }
  }, [editor, canvas?._id, canvas?.content]);

  // Also clear localEditRef when canvas changes (defensive catch-all)
  useEffect(() => {
    if (!canvas?._id) return;
    previousCanvasIdRef.current = canvas._id;
  }, [canvas?._id]);

  return { localEditRef, initialContentSetRef };
}
