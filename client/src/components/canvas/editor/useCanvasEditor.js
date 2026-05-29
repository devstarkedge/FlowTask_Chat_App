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
      // Auto-detect the Yjs fragment name if possible so the extension binds
      // to the same fragment used by other clients/older deployments.
      let chosenField = 'prosemirror';
      try {
        if (ydoc && typeof ydoc.getXmlFragment === 'function') {
          const p = ydoc.getXmlFragment('prosemirror');
          const d = ydoc.getXmlFragment('document');
          if (p && typeof p.length === 'number' && p.length > 0) chosenField = 'prosemirror';
          else if (d && typeof d.length === 'number' && d.length > 0) chosenField = 'document';
          else chosenField = 'prosemirror';
        }
      } catch (e) {
        chosenField = 'prosemirror';
      }

      try {
        console.debug('[Canvas Collab] deferring Collaboration extension registration until provider sync', { chosenField });
      } catch (e) {}
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
  // Register Collaboration and CollaborationCursor dynamically after the
  // WebSocket connects so awareness.doc is guaranteed to exist and we can
  // detect the correct Yjs fragment to bind to (prevents fragment mismatch).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor || !provider) {
      cursorPluginRegistered.current = false;
      return undefined;
    }

    const tryRegisterCollabAndCursor = () => {
      if (!provider.awareness?.doc) return;

      // Register Collaboration extension dynamically (choose fragment after sync)
      try {
        if (!cursorPluginRegistered.current) {
          // Determine best fragment name now that Y.Doc may be populated
          let chosenField = 'prosemirror';
          try {
            if (ydoc && typeof ydoc.getXmlFragment === 'function') {
              const p = ydoc.getXmlFragment('prosemirror');
              const d = ydoc.getXmlFragment('document');
              if (p && typeof p.length === 'number' && p.length > 0) chosenField = 'prosemirror';
              else if (d && typeof d.length === 'number' && d.length > 0) chosenField = 'document';
              else chosenField = 'prosemirror';
            }
          } catch (e) {
            chosenField = 'prosemirror';
          }

          try {
            const collabExt = Collaboration.configure({ document: ydoc, field: chosenField });
            const collabCtx = { name: collabExt.name, options: collabExt.options, storage: {}, editor };
            const collabPlugins = collabExt.addProseMirrorPlugins?.call(collabCtx) ?? [];
            collabPlugins.forEach((plugin) => editor.registerPlugin(plugin));
          } catch (err) {
            console.warn('[Collaboration] deferred registration failed:', err);
          }

          // Register CollaborationCursor plugin (relies on awareness.doc)
          try {
            const ext = CollaborationCursor.configure({ provider, user: cursorUser(user) });
            const ctx = { name: ext.name, options: ext.options, storage: {}, editor };
            const plugins = ext.addProseMirrorPlugins?.call(ctx) ?? [];
            plugins.forEach((plugin) => editor.registerPlugin(plugin));
            cursorPluginRegistered.current = true;
          } catch (err) {
            console.warn('[CollaborationCursor] deferred registration failed:', err);
          }
        }
      } catch (err) {
        console.warn('[Canvas Collab] tryRegisterCollabAndCursor failed', err);
      }
    };

    const handleStatus = ({ status }) => {
      if (status === 'connected' || status === 'synced') tryRegisterCollabAndCursor();
    };

    if (provider.synced || provider.status === 'connected') {
      tryRegisterCollabAndCursor();
    }

    provider.on('status', handleStatus);
    provider.on('synced', tryRegisterCollabAndCursor);

    return () => {
      try { provider.off('status', handleStatus); } catch (e) {}
      try { provider.off('synced', tryRegisterCollabAndCursor); } catch (e) {}
      cursorPluginRegistered.current = false;
    };
  }, [editor, provider, user, ydoc]);

  // ------------------------------------------------------------------
  // Diagnostics: observe Yjs updates and editor update events to help
  // trace whether local edits are converted to Yjs updates and whether
  // remote Yjs updates arrive and are applied to the editor.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!ydoc) return undefined;

    const onYUpdate = (update, origin) => {
      try {
        const size = update && update.byteLength ? update.byteLength : (update && update.length ? update.length : null);
        console.debug('[Canvas Collab][YJS] update', { size, origin: origin ? String(origin).slice(0, 64) : null });
      } catch (e) {}
    };

    try {
      ydoc.on && ydoc.on('update', onYUpdate);
    } catch (e) {}

    return () => {
      try {
        ydoc.off && ydoc.off('update', onYUpdate);
      } catch (e) {}
    };
  }, [ydoc]);

  useEffect(() => {
    if (!editor) return undefined;
    const onEditorUpdate = () => {
      try {
        const json = editor.getJSON ? editor.getJSON() : null;
        const words = editor.storage?.characterCount?.words?.() || 0;
        console.debug('[Canvas Collab][Editor] update', { words, jsonSize: json ? JSON.stringify(json).length : null });
      } catch (e) {}
    };

    editor.on('update', onEditorUpdate);
    return () => {
      try { editor.off('update', onEditorUpdate); } catch (e) {}
    };
  }, [editor]);

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
        const container = document.querySelector('.canvas-document-surface');
        const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
        const x = Math.round(rect.right - containerRect.left);
        const y = Math.round(rect.top - containerRect.top);
        useCanvasStore.getState().updateCursor(blockId, x, y);
        try {
          const local = provider?.awareness?.getLocalState()?.user || {};
          provider?.awareness?.setLocalStateField('user', { ...local, cursor: { blockId, x, y } });
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
        const local = provider?.awareness?.getLocalState()?.user || {};
        // Clear typing/activity state when typing stops
        provider?.awareness?.setLocalStateField('user', { ...local, activity: 'viewing canvas', typing: false });
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
          const container = document.querySelector('.canvas-document-surface');
          const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
          const x = Math.round(coords.left - containerRect.left);
          const y = Math.round(coords.top - containerRect.top);
          useCanvasStore.getState().updateCursor(blockId, x, y);
          try {
            const local = provider?.awareness?.getLocalState()?.user || {};
            provider?.awareness?.setLocalStateField('user', { ...local, cursor: { blockId, x, y }, activity: 'typing', typing: true });
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
      if (lastBlockId) useCanvasStore.getState().setBlockTyping(lastBlockId, false);
    };
  }, [editor]);

  // ------------------------------------------------------------------
  // Seed initial content once Yjs doc is synced from server.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor || !ydoc || !canvas?.content) return undefined;

    const meta = ydoc.getMap("canvasMeta");

    // Local guard to prevent duplicate concurrent seeds within this
    // hook instance (helps with StrictMode double-mount / rapid events).
    let seedInProgress = false;
    let seededLocally = false;

    const seedIfNeeded = async () => {
      try {
        logger.debug('[Canvas Collab] seedIfNeeded invoked', { canvasId: canvas?._id });

        // If another local seed already happened, skip.
        if (seededLocally) {
          logger.debug('[Canvas Collab] seed skipped (already seeded locally)', { canvasId: canvas?._id });
          return;
        }

        // If shared meta marks seeded, skip.
        if (meta.get("seeded")) {
          logger.debug('[Canvas Collab] seed skipped (meta seeded)', { canvasId: canvas?._id });
          seededLocally = true;
          return;
        }

        // Prevent re-entrancy
        if (seedInProgress) {
          logger.debug('[Canvas Collab] seed already in progress, skipping duplicate invocation', { canvasId: canvas?._id });
          return;
        }
        seedInProgress = true;

        const newJSON = sanitizeDocJSON(canvas.content || EMPTY_DOC);
        const currentJSON = typeof editor.getJSON === "function" ? editor.getJSON() : null;
        const shouldSetContent = editor.isEmpty || !currentJSON || JSON.stringify(currentJSON) !== JSON.stringify(newJSON);

        // Decide whether it's safe to write into the editor (and thus
        // propagate into Y.Doc via the collaboration plugin). Only write
        // immediately when offline or when the provider is already bound
        // to awareness/doc or already synced. Otherwise defer until sync.
        const providerBound = provider && provider.awareness && provider.awareness.doc;
        const canWriteNow = !provider || provider.synced || (provider.status === 'connected' && providerBound);

        if (shouldSetContent) {
          if (canWriteNow) {
            logger.debug('[Canvas Collab] seed started', { canvasId: canvas?._id });
            try {
              editor.commands.setContent(newJSON, false);
              try { convertTokensToVariableNodes(editor); } catch (e) { /* ignore */ }
            } catch (e) {
              logger.warn('[Canvas Collab] setContent failed during seed', { canvasId: canvas?._id, err: e?.message || e });
            }
          } else {
            logger.debug('[Canvas Collab] seeding deferred until provider sync/awareness', { canvasId: canvas?._id, synced: provider?.synced, status: provider?.status });
          }
        }

        // Only mark as seeded in shared Yjs meta when provider isn't present
        // or has finished syncing / is bound. We mark seeded after writing
        // to ensure other peers don't see seeded=true before content lands.
        if (!provider || canWriteNow) {
          try {
            // Use a transaction to ensure the seeded flag is set atomically
            // on the Y.Doc shared map.
            ydoc.transact(() => {
              meta.set("seeded", true);
            });
            seededLocally = true;
            logger.debug('[Canvas Collab] seed completed', { canvasId: canvas?._id });
          } catch (e) {
            logger.warn('[Canvas Collab] marking meta.seeded failed', { canvasId: canvas?._id, err: e?.message || e });
          }
        } else {
          logger.debug('[Canvas Collab] will mark seeded after sync', { canvasId: canvas?._id });
        }
      } finally {
        seedInProgress = false;
      }
    };

    const handleSynced = ({ state }) => {
      try {
        if (state) {
          logger.debug('[Canvas Collab] provider synced (handler)', { canvasId: canvas?._id });
          window.requestAnimationFrame(() => seedIfNeeded());
        }
      } catch (e) {}
    };

    if (provider) {
      logger.debug('[Canvas Collab] seeding: waiting for provider sync', { canvasId: canvas?._id, synced: provider.synced, status: provider.status });

      const providerBound = provider.awareness && provider.awareness.doc;
      if (provider.synced || (provider.status === 'connected' && providerBound)) {
        window.requestAnimationFrame(() => seedIfNeeded());
      }

      // Still listen for a proper 'synced' event to handle late syncs.
      provider.on("synced", handleSynced);

      // Also listen for status transitions to 'connected' — some
      // deployments emit status changes but not a 'synced' event for
      // empty documents, so seed when we observe a connected status and
      // awareness is available.
      const handleStatusForSeed = ({ status }) => {
        if (status === 'connected') {
          try {
            if (provider.awareness && provider.awareness.doc) {
              window.requestAnimationFrame(() => seedIfNeeded());
            } else {
              setTimeout(() => {
                try {
                  if (provider.awareness && provider.awareness.doc) window.requestAnimationFrame(() => seedIfNeeded());
                } catch (e) {}
              }, 100);
            }
          } catch (e) {
            window.requestAnimationFrame(() => seedIfNeeded());
          }
        }
      };
      provider.on('status', handleStatusForSeed);
    } else {
      // Offline / no provider: seed immediately so the user sees content.
      try {
        logger.debug('[Canvas Collab] seeding: offline mode, seeding immediately', { canvasId: canvas?._id });
        seedIfNeeded();
      } catch (err) {
        /* ignore */
      }
    }

    return () => {
      try {
        if (provider) {
          try { provider.off("synced", handleSynced); } catch (e) {}
          try { provider.off("status", handleStatusForSeed); } catch (e) {}
        }
      } catch (e) {}
    };
  }, [canvas?.content, editor, provider, ydoc]);

  // For non-collab mode, convert tokens after initial content is set
  useEffect(() => {
    if (!editor || provider) return undefined;
    try {
      // Ensure editor mirrors the latest canvas content when not in
      // collaboration mode, but avoid setting content when it's already
      // identical to prevent redundant updates that can trigger save
      // cycles.
      const newJSON = sanitizeDocJSON(canvas?.content || EMPTY_DOC);
      const currentJSON = typeof editor.getJSON === "function" ? editor.getJSON() : null;
      if (!currentJSON || JSON.stringify(currentJSON) !== JSON.stringify(newJSON)) {
        editor.commands.setContent(newJSON, false);
        try {
          convertTokensToVariableNodes(editor);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("convertTokensToVariableNodes failed", e);
        }
      }
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