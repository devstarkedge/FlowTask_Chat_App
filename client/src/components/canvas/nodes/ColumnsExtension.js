import { Node } from "@tiptap/core";

const columnStyle = "position: relative; flex: 1 1 180px; min-width: 0; max-width: 100%; box-sizing: border-box; overflow-wrap: anywhere; min-height: 40px; padding: 8px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary);";

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
        style: "display: flex; flex-wrap: wrap; gap: 16px; width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; margin: 12px 0;",
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

  addCommands() {
    return {
      deleteCanvasColumn: position => ({ tr, dispatch }) => {
        if (!this.editor.isEditable || !Number.isInteger(position) || position < 0 || position > tr.doc.content.size) return false;
        const column = tr.doc.nodeAt(position);
        if (column?.type !== this.type) return false;
        const resolved = tr.doc.resolve(position), group = resolved.parent;
        if (group.type.name !== "columns") return false;
        if (dispatch) {
          const groupPos = resolved.before(resolved.depth);
          if (group.childCount > 1) {
            tr.delete(position, position + column.nodeSize);
            tr.setNodeMarkup(groupPos, undefined, { ...group.attrs, count: group.childCount - 1 });
          } else {
            const container = resolved.node(resolved.depth - 1);
            // A document/outer column still needs an editable block after its
            // final nested column group is removed.
            if (container.childCount === 1) tr.replaceWith(groupPos, groupPos + group.nodeSize, tr.doc.type.schema.nodes.paragraph.create());
            else tr.delete(groupPos, groupPos + group.nodeSize);
          }
          tr.scrollIntoView();
        }
        return true;
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos, view }) => {
      const doc = view.dom.ownerDocument;
      const dom = doc.createElement("div"), contentDOM = doc.createElement("div");
      dom.dataset.type = "column";
      dom.className = "canvas-column";
      dom.style.cssText = columnStyle;
      contentDOM.className = "canvas-column-content";
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "canvas-column-delete";
      button.contentEditable = "false";
      button.draggable = false;
      button.title = "Delete column";
      button.setAttribute("aria-label", "Delete column");
      button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';
      button.onmousedown = event => event.preventDefault();
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        if (editor.isDestroyed || !editor.isEditable) return;
        const position = typeof getPos === "function" ? getPos() : undefined;
        if (Number.isInteger(position)) editor.chain().focus().deleteCanvasColumn(position).run();
      };
      dom.append(button, contentDOM);
      return {
        dom,
        contentDOM,
        update: next => next.type === node.type,
        stopEvent: event => button.contains(event.target),
        ignoreMutation: mutation => mutation.type !== "selection" && button.contains(mutation.target),
        destroy: () => { button.onclick = null; button.onmousedown = null; },
      };
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "column",
        class: "canvas-column",
        style: columnStyle,
      },
      0,
    ];
  },
});
