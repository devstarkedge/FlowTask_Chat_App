/**
 * CanvasEditorCore.js — Pure configuration for the TipTap editor.
 *
 * Exports pure functions (no React hooks) that build the extensions array,
 * nodeViews, and utility helpers used by the editor orchestrator.
 */
import { ReactNodeViewRenderer } from "@tiptap/react";
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
import Collaboration from "@tiptap/extension-collaboration";
import { Node, mergeAttributes } from "@tiptap/core";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import BlockWrapper from "../blocks/BlockWrapper";

// Create a lowlight instance preloaded with common grammars.
const lowlight = createLowlight(common);

// ─── Constants & Pure Helpers ────────────────────────────────────────

export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Sanitize a ProseMirror JSON doc to avoid empty text nodes which
 * ProseMirror/TipTap rejects (RangeError: Empty text nodes are not allowed).
 */
export function sanitizeDocJSON(node) {
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

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function selectionToolbarPosition(editor) {
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

export function slashMenuState(editor) {
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

export function cursorUser(user) {
  return {
    name: user?.name || "Anonymous",
    color: "#4e7cff",
  };
}

// ─── NodeViews ───────────────────────────────────────────────────────

/**
 * Build the memoized nodeViews object.
 * taskItem is registered here so BlockWrapper handles checklist items,
 * ensuring cursor lands correctly beside the checkbox.
 */
export function buildNodeViews() {
  return {
    paragraph: ReactNodeViewRenderer(BlockWrapper),
    heading: ReactNodeViewRenderer(BlockWrapper),
    taskItem: ReactNodeViewRenderer(BlockWrapper),
    templateVariable: ReactNodeViewRenderer(TemplateVariableView),
  };
}

// ─── Extensions ──────────────────────────────────────────────────────

/**
 * Build the full TipTap extensions array.
 * Pure function — call inside useMemo with the appropriate deps.
 */
export function buildExtensions({ withCollab, ydoc, provider, user }) {
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
      // undo/redo. StarterKit's built-in History must be disabled.
      history: withCollab ? false : undefined,
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
    TemplateVariable,
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

    list.push(
      Collaboration.configure({
        document: ydoc,
        field: chosenField,
      }),
    );

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
}
