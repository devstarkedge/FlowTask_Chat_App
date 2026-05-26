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
import TemplateVariable from "./extensions/TemplateVariable";
import TemplateVariableView from "./TemplateVariableView";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";

// Create a lowlight instance preloaded with common grammars.
const lowlight = createLowlight(common);
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import debounce from "lodash/debounce";

import BlockWrapper from "../blocks/BlockWrapper";

import { useAuthStore } from "../../../stores/authStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";

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
  const y = clamp(Math.min(start.top, end.top) - 56, 8, window.innerHeight - 64);
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
  const [wordCount, setWordCount] = useState(0);
  const cursorPluginRegistered = useRef(false);

  // withCollab is declared here (at hook scope) so it is always
  // defined before any reference to it — previously this was missing from
  // the compiled bundle, causing the "withCollab is not defined" crash.
  const withCollab = Boolean(provider && ydoc);

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

  const extensions = useMemo(() => {
    const list = [
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
      Image.configure({ inline: false, allowBase64: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CharacterCount,
      Highlight,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // Register template variable node to render placeholder chips
      TemplateVariable,
      // Lowlight-powered code block (rendering + highlighting)
      CodeBlockLowlight.configure({ lowlight }),
    ];

    if (withCollab) {
      // Collaboration brings y-prosemirror undo/redo — no extra History needed.
      list.push(
        Collaboration.configure({ document: ydoc, field: "document" }),
        // CollaborationCursor is registered dynamically after socket connects
        // (see useEffect below) — adding it here crashes because
        // awareness.doc is undefined before the WebSocket handshake.
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

  const syncContextualUi = useCallback(
    (editorInstance) => {
      const slashState = slashMenuState(editorInstance);
      if (slashState) {
        const currentSlashMenu = useCanvasUiStore.getState().slashMenu;
        if (currentSlashMenu.open) updateSlashMenu(slashState);
        else openSlashMenu(slashState);
      } else {
        closeSlashMenu();
      }

      const { selection } = editorInstance.state;
      if (!selection.empty) {
        showSelectionToolbar(selectionToolbarPosition(editorInstance));
      } else {
        hideSelectionToolbar();
      }
    },
    [
      closeSlashMenu,
      hideSelectionToolbar,
      openSlashMenu,
      showSelectionToolbar,
      updateSlashMenu,
    ],
  );

  const editor = useEditor({
    extensions,
    // Only defer setting initial content when a real collaboration session
    // is active (provider + ydoc). Use `withCollab` so offline mode always
    // gets its content immediately.
    content: withCollab ? undefined : sanitizeDocJSON(canvas?.content || EMPTY_DOC),
    editorProps: {
      attributes: {
        class: "canvas-prosemirror",
        "aria-label": "Canvas editor",
      },
      handleDOMEvents: {
        focus: () => {
          setFocused(true);
          provider?.awareness?.setLocalStateField("user", {
            ...provider.awareness.getLocalState()?.user,
            activity: "editing canvas",
          });
          return false;
        },
        blur: () => {
          setFocused(false);
          provider?.awareness?.setLocalStateField("user", {
            ...provider.awareness.getLocalState()?.user,
            activity: "viewing canvas",
          });
          return false;
        },
      },
    },
    // NodeViews: attach our React-based BlockWrapper to top-level block nodes
    nodeViews: {
      paragraph: ReactNodeViewRenderer(BlockWrapper),
      heading: ReactNodeViewRenderer(BlockWrapper),
      taskItem: ReactNodeViewRenderer(BlockWrapper),
      // Inline template variable node view (editable chip)
      templateVariable: ReactNodeViewRenderer(TemplateVariableView),
    },
    onUpdate: ({ editor: e }) => {
      setWordCount(e.storage.characterCount.words());
      syncContextualUi(e);
      debouncedSave(e.getJSON());
    },
    onSelectionUpdate: ({ editor: e }) => {
      syncContextualUi(e);
    },
  });

  // Convert text tokens like {{name}} or [name] into templateVariable nodes
  const convertTokensToVariableNodes = (editorInstance) => {
    if (!editorInstance) return;
    const { doc, tr, schema } = editorInstance.state;
    const varNodeType = schema.nodes.templateVariable;
    if (!varNodeType) return;

    const tokenPatterns = [
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      /\[([^\]]+)\]/g,
    ];

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
    matches.sort((a, b) => b.start - a.start).forEach((m) => {
      const node = varNodeType.create({ name: m.name, value: "" });
      tr.replaceWith(m.start, m.end, node);
    });

    if (tr.docChanged) {
      editorInstance.view.dispatch(tr);
    }
  };

  // ------------------------------------------------------------------
  // Register CollaborationCursor dynamically after the WebSocket connects
  // so awareness.doc is guaranteed to exist (prevents the .doc crash).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor || !provider) {
      cursorPluginRegistered.current = false;
      return undefined;
    }

    const tryRegisterCursor = () => {
      if (cursorPluginRegistered.current) return;
      if (!provider.awareness?.doc) return;

      try {
        const ext = CollaborationCursor.configure({
          provider,
          user: cursorUser(user),
        });

        const ctx = {
          name: ext.name,
          options: ext.options,
          storage: {},
          editor,
        };

        const plugins = ext.addProseMirrorPlugins?.call(ctx) ?? [];
        plugins.forEach((plugin) => editor.registerPlugin(plugin));
        cursorPluginRegistered.current = true;
      } catch (err) {
        console.warn("[CollaborationCursor] deferred registration failed:", err);
      }
    };

    const handleStatus = ({ status }) => {
      if (status === "connected" || status === "synced") tryRegisterCursor();
    };

    if (provider.synced || provider.status === "connected") {
      tryRegisterCursor();
    }

    provider.on("status", handleStatus);
    provider.on("synced", tryRegisterCursor);

    return () => {
      provider.off("status", handleStatus);
      provider.off("synced", tryRegisterCursor);
      cursorPluginRegistered.current = false;
    };
  }, [editor, provider, user]);

  // ------------------------------------------------------------------
  // Seed initial content once Yjs doc is synced from server.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor || !ydoc || !canvas?.content) return undefined;

    const meta = ydoc.getMap("canvasMeta");

    const seedIfNeeded = () => {
      if (meta.get("seeded")) return;
      if (!editor.isEmpty) {
        // If the editor already has content, only mark seeded when
        // collaboration is active so other peers receive the state.
        if (!provider || provider.synced) {
          meta.set("seeded", true);
        }
        return;
      }

      // If a provider exists but hasn't synced yet, defer seeding until
      // the provider completes its initial sync so the editor changes
      // are applied to the Yjs document (and propagated to peers).
      if (provider && !provider.synced) return;

      editor.commands.setContent(sanitizeDocJSON(canvas.content || EMPTY_DOC), false);
      // Convert any token placeholders into inline variable nodes
      try {
        convertTokensToVariableNodes(editor);
      } catch (e) {
        /* ignore */
      }
      meta.set("seeded", true);
    };

    const handleSynced = ({ state }) => {
      if (state) window.requestAnimationFrame(seedIfNeeded);
    };

    // Seed immediately only if there's no provider (offline/non-collab)
    // or if the provider is already synced/connected. Otherwise wait for
    // the provider to emit a "synced" event so the Editor->Yjs bridge
    // is active when we set content.
    try {
      if (!provider) {
        seedIfNeeded();
      } else if (provider.synced || provider.status === "connected") {
        seedIfNeeded();
      }
    } catch (err) {
      /* ignore */
    }

    if (provider) provider.on("synced", handleSynced);

    return () => {
      if (provider) provider.off("synced", handleSynced);
    };
  }, [canvas?.content, editor, provider, ydoc]);

  // For non-collab mode, convert tokens after initial content is set
  useEffect(() => {
    if (!editor || provider) return undefined;
    try {
      // Ensure editor mirrors the latest canvas content when not in
      // collaboration mode (editor `content` option is only applied on
      // initial mount). This keeps the editor in sync with the preview
      // / create flow so templates are visible immediately.
      editor.commands.setContent(sanitizeDocJSON(canvas?.content || EMPTY_DOC), false);
      convertTokensToVariableNodes(editor);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("convertTokensToVariableNodes failed", e);
    }
    // run on editor/content changes
  }, [editor, provider, canvas?.content]);

  // ------------------------------------------------------------------
  // Ctrl/Cmd+S shortcut.
  // ------------------------------------------------------------------
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

  return { editor, saveStatus, wordCount, flushSave: debouncedSave.flush };
}