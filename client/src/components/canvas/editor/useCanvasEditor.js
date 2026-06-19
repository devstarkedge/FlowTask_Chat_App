/**
 * useCanvasEditor.js — Thin orchestrator that composes focused sub-hooks.
 *
 * Creates the TipTap editor via useEditor(), wires up stable callback refs,
 * and delegates save / content-sync / cursor / typing to dedicated hooks.
 */
import { useEffect, useMemo, useRef } from "react";
import { useEditor } from "@tiptap/react";
import { useAuthStore } from "../../../stores/authStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";
import {
  sanitizeDocJSON,
  EMPTY_DOC,
  slashMenuState,
  selectionToolbarPosition,
  buildExtensions,
  buildNodeViews,
} from "./CanvasEditorCore";
import { useCanvasSave } from "./useCanvasSave";
import { useCanvasContentSync } from "./useCanvasContentSync";
import { useCanvasCursor } from "./useCanvasCursor";
import { useCanvasTyping } from "./useCanvasTyping";

export function useCanvasEditor({ canvas, onSave, provider, ydoc }) {
  const user = useAuthStore((s) => s.user);
  const setFocused = useCanvasUiStore((s) => s.setFocused);
  const openSlashMenu = useCanvasUiStore((s) => s.openSlashMenu);
  const updateSlashMenu = useCanvasUiStore((s) => s.updateSlashMenu);
  const closeSlashMenu = useCanvasUiStore((s) => s.closeSlashMenu);
  const showSelectionToolbar = useCanvasUiStore((s) => s.showSelectionToolbar);
  const hideSelectionToolbar = useCanvasUiStore((s) => s.hideSelectionToolbar);

  const wordCountRef = useRef(0);
  const providerRef = useRef(provider);
  const ydocRef = useRef(ydoc);

  const withCollab = Boolean(provider && ydoc);
  const withCollabRef = useRef(withCollab);
  withCollabRef.current = withCollab;

  // Keep ydocRef up to date (providerRef is synced by useCanvasContentSync)
  useEffect(() => {
    providerRef.current = provider;
    ydocRef.current = ydoc;
  }, [provider, ydoc]);

  // ── Stable extensions & nodeViews ─────────────────────────────────

  const extensions = useMemo(
    () => buildExtensions({ withCollab, ydoc, provider, user }),
    // `user` intentionally omitted — cursor extension reads user via provider
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withCollab, ydoc],
  );

  const stableContent = useMemo(() => {
    if (withCollab) return undefined;
    return sanitizeDocJSON(canvas?.content || EMPTY_DOC);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withCollab, canvas?.content]);

  const nodeViews = useMemo(() => buildNodeViews(), []);

  // ── Stable callback refs (prevent useEditor recreation) ───────────

  const syncContextualUiRef = useRef(() => {});
  const updateSlashMenuRef = useRef(updateSlashMenu);
  updateSlashMenuRef.current = updateSlashMenu;
  const openSlashMenuRef = useRef(openSlashMenu);
  openSlashMenuRef.current = openSlashMenu;
  const closeSlashMenuRef = useRef(closeSlashMenu);
  closeSlashMenuRef.current = closeSlashMenu;
  const showSelectionToolbarRef = useRef(showSelectionToolbar);
  showSelectionToolbarRef.current = showSelectionToolbar;
  const hideSelectionToolbarRef = useRef(hideSelectionToolbar);
  hideSelectionToolbarRef.current = hideSelectionToolbar;

  syncContextualUiRef.current = (editorInstance) => {
    const slashState = slashMenuState(editorInstance);
    if (slashState) {
      const currentSlashMenu = useCanvasUiStore.getState().slashMenu;
      if (currentSlashMenu.open) updateSlashMenuRef.current(slashState);
      else openSlashMenuRef.current(slashState);
    } else {
      closeSlashMenuRef.current();
    }

    const { selection } = editorInstance.state;
    if (!selection.empty) {
      showSelectionToolbarRef.current(
        slashMenuState
          ? selectionToolbarPosition(editorInstance)
          : { x: 0, y: 0 },
      );
    } else {
      hideSelectionToolbarRef.current();
    }
  };

  // ── Save (debounced + Ctrl+S) — must be created before useEditor ──

  const { saveStatus, flushSave, debouncedSave } = useCanvasSave(null, onSave);

  // ── Content Sync — must be created BEFORE useEditor so onUpdate can reference it ──
  // We pass editor: null initially and patch it after useEditor creates the instance.
  const contentSync = useCanvasContentSync({
    editor: null,
    canvas,
    provider,
    ydoc,
    providerRef,
    withCollab,
  });

  // ── Create the TipTap editor ──────────────────────────────────────

  const editor = useEditor({
    extensions,
    content: stableContent,
    editorProps: {
      attributes: {
        class: "canvas-prosemirror",
        "aria-label": "Canvas editor",
      },
      handleDOMEvents: {
        focus: () => {
          setFocused(true);
          const prov = providerRef.current;
          if (prov?.awareness) {
            try {
              prov.awareness.setLocalStateField("user", {
                ...prov.awareness.getLocalState()?.user,
                activity: "editing canvas",
              });
            } catch (e) {}
          }
          return false;
        },
        blur: () => {
          setFocused(false);
          const prov = providerRef.current;
          if (prov?.awareness) {
            try {
              prov.awareness.setLocalStateField("user", {
                ...prov.awareness.getLocalState()?.user,
                activity: "viewing canvas",
              });
            } catch (e) {}
          }
          return false;
        },
      },
    },
    nodeViews,
    onUpdate: ({ editor: e }) => {
      contentSync.localEditRef.current = true;
      wordCountRef.current = e.storage.characterCount.words();
      syncContextualUiRef.current(e);
      debouncedSave(e.getJSON());
    },
    onSelectionUpdate: ({ editor: e }) => {
      syncContextualUiRef.current(e);
    },
  });

  // ── Scroll handler (reposition selection toolbar) ─────────────────

  useEffect(() => {
    if (!editor) return undefined;
    const scrollEl = document.querySelector(".canvas-scroll-surface");
    if (!scrollEl) return undefined;
    const onScroll = () => syncContextualUiRef.current(editor);
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, [editor]);

  // ── Patch contentSync with the real editor after useEditor creates it ─────────
  useEffect(() => {
    if (contentSync && editor) {
      // @ts-ignore — patch the editor ref inside contentSync after mount
      contentSync.editor = editor;
    }
  }, [contentSync, editor]);

  useCanvasCursor(editor, providerRef);
  useCanvasTyping(editor, providerRef);

  return { editor, saveStatus, wordCount: wordCountRef.current, flushSave };
}
