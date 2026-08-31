import { Node } from "@tiptap/core";

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column+",
  isolating: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      count: { default: 2 },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "columns",
        class: `canvas-columns columns-${node.attrs.count || 2}`,
        style: "display: flex; gap: 16px; width: 100%; margin: 12px 0;",
      },
      0,
    ];
  },
});

export const Column = Node.create({
  name: "column",
  group: "block",
  content: "block+",
  isolating: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "column",
        class: "canvas-column",
        style: "flex: 1; min-width: 0; min-height: 40px; padding: 8px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary);",
      },
      0,
    ];
  },
});