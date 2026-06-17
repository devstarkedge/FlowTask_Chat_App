import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Table,
  TableRow,
  TableHeader,
  TableCell,
} from "@tiptap/extension-table";
import CharacterCount from "@tiptap/extension-character-count";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import TemplateVariable from "./extensions/TemplateVariable";
import TemplateVariableView from "./TemplateVariableView";
import CalloutNode from "../nodes/CalloutNode";
import FileNode from "../nodes/FileNode";
import AudioNode from "../nodes/AudioNode";
import VideoNode from "../nodes/VideoNode";
import ImageNode from "../nodes/ImageNode";
import { Columns, Column } from "../nodes/ColumnsExtension";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import { FontFamily } from "./extensions/FontFamily";

// Create a lowlight instance preloaded with common grammars.
const lowlight = createLowlight(common);
import Collaboration from "@tiptap/extension-collaboration";
import { Node, mergeAttributes } from "@tiptap/core";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import debounce from "lodash/debounce";
import logger from "../../../utils/logger";

import BlockWrapper from "../blocks/BlockWrapper";

import { useAuthStore } from "../../../stores/authStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";
import { useCanvasStore } from "../../../stores/canvasStore";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

// Sanitize a ProseMirror JSON doc to avoid empty text nodes which
// ProseMirror/TipTap rejects (RangeError: Empty text nodes are not allowed).
// Strategy: recursively walk the doc, replace any text node with empty
// `text` with a single space, and drop null children. If sanitization
// yields nothing, return `EMPTY_DOC` as a safe fallback.
function sanitizeDocJSON(node) {
  if (!node || typeof node !== "object") return node;

  const walk = (n) => {
    if (!n || typeof n !== "object") return null;
    if (n.type === "text") {
      const t = typeof n.text === "string" ? n.text : "";
      if (t.length === 0) return { type: "text", text: " " };
      const out = { type: "text", text: t };
      if (n.marks) out.marks = n.marks;
      return out;
    }

    const out = { type: n.type };
    if (n.attrs) out.attrs = n.attrs;
    if (Array.isArray(n.content)) {
      const children = n.content.map(walk).filter(Boolean);
      if (children.length) out.content = children;
    }
    if (n.marks) out.marks = n.marks;
    return out;
  };

  const sanitized = walk(node);
  return sanitized || EMPTY_DOC;
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function selectionToolbarPosition(editor) {
  const { from, to } = editor.state.selection;
  const start = editor.view.coordsAtPos(from);
  const end = editor.view.coordsAtPos(to);
  const midpoint = (start.left + end.right) / 2;
  const x = clamp(midpoint, 12, window.innerWidth - 12);
  const y = clamp(
    Math.min(start.top, end.top) - 56,
    8,
    window.innerHeight - 64,
  );
  return { x, y };
}

function slashMenuState(editor) {
  const { state } = editor;
  const { selection } = state;
  if (!selection.empty) return null;

  const { from, $from } = selection;
  const parentStart = $from.start();
  const textBefore = state.doc.textBetween(parentStart, from, "\n", "\0");
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBefore);

  if (!match) return null;

  const query = match[1] || "";
  const slashFrom = from - query.length - 1;
  const coords = editor.view.coordsAtPos(slashFrom);

  return {
    query,
    range: { from: slashFrom, to: from },
    x: clamp(coords.left, 12, window.innerWidth - 340),
    y: clamp(coords.bottom + 8, 12, window.innerHeight - 420),
  };
}

function cursorUser(user) {
  return {
    name: user?.name || "Anonymous",
    color: "#4e7cff",
  };
}

export function useCanvasEditor({ canvas, onSave, provider, ydoc }) {
  const user = useAuthStore((s) => s.user);
  const setFocused = useCanvasUiStore((s) => s.setFocused);
  const openSlashMenu = useCanvasUiStore((s) => s.openSlashMenu);
  const updateSlashMenu = useCanvasUiStore((s) => s.updateSlashMenu);
  const closeSlashMenu = useCanvasUiStore((s) => s.closeSlashMenu);
  const showSelectionToolbar = useCanvasUiStore((s) => s.showSelectionToolbar);
  const hideSelectionToolbar = useCanvasUiStore((s) => s.hideSelectionToolbar);

  const [saveStatus, setSaveStatus] = useState("saved");
  const wordCountRef = useRef(0);
  const cursorPluginRegistered = useRef(false);
  const providerRef = useRef(provider);
  const ydocRef = useRef(ydoc);
  // Track whether the editor has been locally edited since the last
  // non-collab sync.  When true, the sync effect skips setContent()
  // to prevent cursor resets / editor flicker after file uploads or
  // debounced saves that bounce content through the store.
  const localEditRef = useRef(false);
  // Track whether the initial content has been set so we only run
  // token conversion once (not on every canvas.content change).
  const initialContentSetRef = useRef(false);

  // Update refs when provider/ydoc change
  useEffect(() => {
    providerRef.current = provider;
    ydocRef.current = ydoc;
  }, [provider, ydoc]);

  // withCollab is declared here (at hook scope) so it is always
  // defined before any reference to it — previously this was missing from
  // the compiled bundle, causing the "withCollab is not defined" crash.
  const withCollab = Boolean(provider && ydoc);
  // Stable withCollab ref for use in callbacks
  const withCollabRef = useRef(withCollab);
  withCollabRef.current = withCollab;

  const debouncedSave = useMemo(
    () =>
      debounce(async (json) => {
        try {
          setSaveStatus("saving");
          await onSave?.(json);
          setSaveStatus("saved");
        } catch (error) {
          console.error(error);
          setSaveStatus("error");
        }
      }, 900),
    [onSave],
  );

  // Memoize nodeViews to prevent editor recreation on every render.
  // taskItem is registered here so BlockWrapper handles checklist items,
  // ensuring cursor lands correctly beside the checkbox and Enter key
  // creates new items via TipTap's built-in TaskItem behavior.
  const nodeViews = useMemo(() => ({
    paragraph: ReactNodeViewRenderer(BlockWrapper),
    heading: ReactNodeViewRenderer(BlockWrapper),
    taskItem: ReactNodeViewRenderer(BlockWrapper),
    templateVariable: ReactNodeViewRenderer(TemplateVariableView),
  }), []);

  // Memoize content to prevent editor recreation on every render.
  // In collab mode content is always undefined; in offline mode we
  // deep-compare the serialised JSON so the reference only changes when
  // the actual document content changes.
  const stableContent = useMemo(() => {
    if (withCollab) return undefined;
    return sanitizeDocJSON(canvas?.content || EMPTY_DOC);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withCollab, canvas?.content]);

  const extensions = useMemo(() => {
    // Lightweight mention node (used for @user and #channel tags)
    const MentionNode = Node.create({
      name: "mention",
      group: "inline",
      inline: true,
      selectable: false,
      atom: true,

      addAttributes() {
        return {
          id: { default: null },
          label: { default: null },
          mentionType: { default: "user" },
        };
      },

      parseHTML() {
        return [{ tag: "span[data-mention-id]" }];
      },

      renderHTML({ node, HTMLAttributes }) {
        const prefix = node.attrs.mentionType === "channel" ? "#" : "@";
        return [
          "span",
          mergeAttributes(HTMLAttributes, {
            class: "mention-tag",
            "data-mention-id": node.attrs.id,
            "data-mention-type": node.attrs.mentionType,
            contenteditable: "false",
          }),
          `${prefix}${node.attrs.label}`,
        ];
      },
    });
    const list = [
      MentionNode,
      StarterKit.configure({
        // When Collaboration is active, y-prosemirror provides its own
        // undo/redo. StarterKit's built-in History must be disabled to avoid
        // the "[tiptap warn] not compatible with @tiptap/extension-undo-redo"
        // warning. history: false tells StarterKit to skip registering History.
        // When not using collaboration, leave it undefined (StarterKit default
        // = enabled) so Ctrl+Z works normally offline.
        history: withCollab ? false : undefined,
        // Disable StarterKit's codeBlock so we can use the lowlight-powered
        // code block extension which provides proper syntax highlighting.
        codeBlock: false,
        link: false,
        underline: false,
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Heading";
          return "Type '/' for commands";
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      ImageNode.configure({ inline: false, allowBase64: false }),
      VideoNode,
      AudioNode,
      FileNode,
      CalloutNode,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CharacterCount,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      FontFamily,
      Color,
      // Register template variable node to render placeholder chips
      TemplateVariable,
      // Lowlight-powered code block (rendering + highlighting)
      Columns,
      Column,
      CodeBlockLowlight.configure({ lowlight }),
    ];

    if (withCollab) {
      // Determine fragment name upfront (default to 'prosemirror')
      let chosenField = "prosemirror";
      try {
        if (ydoc && typeof ydoc.getXmlFragment === "function") {
          const p = ydoc.getXmlFragment("prosemirror");
          const d = ydoc.getXmlFragment("document");
          if (d && typeof d.length === "number" && d.length > 0) {
            chosenField = "document";
          }
        }
      } catch (e) {
        // default to prosemirror
      }

      // Register Collaboration extension IMMEDIATELY
      list.push(
        Collaboration.configure({
          document: ydoc,
          field: chosenField,
        }),
      );

      // Register CollaborationCursor extension IMMEDIATELY
      list.push(
        CollaborationCursor.configure({
          provider,
          user: cursorUser(user),
        }),
      );
    }

    // Deduplicate by extension name (guards against HMR double-mount).
    const seen = new Set();
    return list.filter((ext) => {
      if (!ext?.name || !seen.has(ext.name)) {
        if (ext?.name) seen.add(ext.name);
        return true;
      }
      return false;
    });
  }, [withCollab, ydoc]);
  // Note: `user` is intentionally NOT a dependency here — the cursor
  // extension reads the user from a closure that we keep up-to-date via
  // the CollaborationCursor provider.  Adding `user` would recreate all
  // extensions (and thus the editor) on every profile change.

  // Store syncContextualUi in a ref so the useEditor callbacks never
  // change identity (preventing TipTap from recreating the editor).
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

  // Keep the ref up-to-date without causing useEditor to recreate
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
      showSelectionToolbarRef.current(slashMenuState ? selectionToolbarPosition(editorInstance) : { x: 0, y: 0 });
    } else {
      hideSelectionToolbarRef.current();
    }
  };

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
    // NodeViews: memoized to prevent editor recreation
    nodeViews,
    // Use stable callback refs so useEditor never sees changing deps
    onUpdate: ({ editor: e }) => {
      // Mark that a local edit occurred so the non-collab sync effect
      // skips setContent() on the next canvas.content store update.
      // This prevents cursor resets and editor flicker after file uploads
      // and debounced saves.
      localEditRef.current = true;
      wordCountRef.current = e.storage.characterCount.words();
      syncContextualUiRef.current(e);
      debouncedSave(e.getJSON());
    },
    onSelectionUpdate: ({ editor: e }) => {
      syncContextualUiRef.current(e);
    },
  });

  // ------------------------------------------------------------------
  // Recalculate selection toolbar position when the canvas surface is
  // scrolled.  Uses ref to avoid re-attaching on every render.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor) return undefined;
    const scrollEl = document.querySelector(".canvas-scroll-surface");
    if (!scrollEl) return undefined;

    const onScroll = () => syncContextualUiRef.current(editor);
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, [editor]);

  // Convert text tokens like {{name}} or [name] into templateVariable nodes
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

  // ------------------------------------------------------------------
  // Diagnostics: observe Yjs updates and editor update events to help
  // trace whether local edits are converted to Yjs updates and whether
  // remote Yjs updates arrive and are applied to the editor.
  // ------------------------------------------------------------------
  // YJS update logging removed to reduce per-keystroke overhead.

  // Editor update logging removed to reduce per-keystroke overhead.

  // ------------------------------------------------------------------
  // Emit cursor position when selection changes so other peers can show
  // a lightweight presence cursor anchored to the block DOM element.
  // ------------------------------------------------------------------
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
        useCanvasStore.getState().updateCursor(blockId, x, y);
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
  }, [editor]);

  // ------------------------------------------------------------------
  // Detect typing activity and emit per-block typing state (start/stop).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor) return undefined;

    let lastBlockId = null;
    const stopTypingDebounced = debounce((blockId) => {
      if (blockId) useCanvasStore.getState().setBlockTyping(blockId, false);
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
          useCanvasStore.getState().setBlockTyping(lastBlockId, false);
        }
        lastBlockId = blockId;
        useCanvasStore.getState().setBlockTyping(blockId, true);
        stopTypingDebounced(blockId);

        // Also emit current caret coordinates so typing bubble can be
        // positioned near the caret for remote viewers. Also update Yjs awareness
        // with cursor coordinates for Yjs-driven presence.
        try {
          const pos = editor.state.selection.from;
          const coords = editor.view.coordsAtPos(pos);
          const container = document.querySelector(".canvas-document-surface");
          const containerRect = container
            ? container.getBoundingClientRect()
            : { left: 0, top: 0 };
          const x = Math.round(coords.left - containerRect.left);
          const y = Math.round(coords.top - containerRect.top);
          useCanvasStore.getState().updateCursor(blockId, x, y);
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
        useCanvasStore.getState().setBlockTyping(lastBlockId, false);
    };
  }, [editor]);

  // ------------------------------------------------------------------
  // Seed initial content once Yjs doc is synced from server.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor || !ydocRef.current || !canvas?.content) return undefined;

    const doc = ydocRef.current;
    const prov = providerRef.current;
    const meta = doc.getMap("canvasMeta");
    let seeded = false;

    const seedIfNeeded = () => {
      if (seeded || meta.get("seeded")) return;

      // Check if the Yjs fragment is empty
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

    // Seed immediately if provider is synced, otherwise wait for sync
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
  }, [canvas?.content, editor]);

  // For non-collab mode: set initial content and convert tokens.
  // CRITICAL: This effect must NOT call setContent() after local edits
  // (file uploads, typing, etc.) because the save cycle bounces content
  // through the store, which would trigger setContent() and reset the
  // cursor / cause editor flicker.  The localEditRef guard prevents this.
  useEffect(() => {
    if (!editor || providerRef.current) return undefined;

    // If the content change was triggered by a local edit (typing, file
    // upload, node insert, etc.), skip setContent() entirely — the editor
    // already has the correct content.
    if (localEditRef.current) {
      localEditRef.current = false;
      return undefined;
    }

    try {
      const newJSON = sanitizeDocJSON(canvas?.content || EMPTY_DOC);
      const currentJSON =
        typeof editor.getJSON === "function" ? editor.getJSON() : null;

      // Only call setContent() when:
      // 1. Initial load (no current content), OR
      // 2. External change (content differs and we haven't just edited locally)
      if (
        !currentJSON ||
        JSON.stringify(currentJSON) !== JSON.stringify(newJSON)
      ) {
        editor.commands.setContent(newJSON, false);
        try {
          convertTokensToVariableNodes(editor);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("convertTokensToVariableNodes failed", e);
        }
        initialContentSetRef.current = true;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("non-collab content sync failed", e);
    }
  }, [editor, canvas?.content]);

  // Ctrl/Cmd+S shortcut.
  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        debouncedSave.flush();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [debouncedSave]);

  useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

  return { editor, saveStatus, wordCount: wordCountRef.current, flushSave: debouncedSave.flush };
}
