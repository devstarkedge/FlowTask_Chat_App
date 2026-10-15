import { Extension } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Row nodes themselves are the identity: never resolve a drag by text or by
// an old index. Abort if the document changes while the native drag is active.
export function reorderTableRow(view, tablePos, sourceRow, targetRow, after) {
  const table = view.state.doc.nodeAt(tablePos);
  if (table?.type.name !== 'table') return false;
  const rows = [];
  table.forEach(row => rows.push(row));
  const from = rows.indexOf(sourceRow), target = rows.indexOf(targetRow);
  if (from < 0 || target < 0) return false;
  const boundary = target + (after ? 1 : 0);
  const to = boundary > from ? boundary - 1 : boundary;
  if (to === from) return false;
  const next = [...rows];
  next.splice(from, 1); next.splice(to, 0, sourceRow);
  view.dispatch(view.state.tr.replaceWith(tablePos, tablePos + table.nodeSize,
    table.copy(Fragment.fromArray(next))).scrollIntoView());
  return true;
}

export const TableRowSorting = Extension.create({
  name: 'tableRowSorting',
  addProseMirrorPlugins() {
    const rowKeys = new WeakMap();
    let nextKey = 0;
    return [new Plugin({
      key: new PluginKey('tableRowSorting'),
      props: {
        decorations(state) {
          const widgets = [];
          state.doc.descendants((table, pos) => {
            if (table.type.name !== 'table') return;
            // Moving a row through a rowspan can change cell ownership.
            // Leave merged tables to their existing editing controls.
            let merged = false;
            table.descendants(cell => { if (cell.attrs.rowspan > 1) merged = true; });
            if (merged) return false;
            table.forEach((row, offset) => {
              if (!rowKeys.has(row)) rowKeys.set(row, `row-drag-${++nextKey}`);
              widgets.push(Decoration.widget(pos + offset + 3, () => {
                const handle = document.createElement('span');
                handle.className = 'canvas-table-row-drag';
                handle.contentEditable = 'false'; handle.draggable = true;
                handle.setAttribute('role', 'button');
                handle.setAttribute('aria-label', 'Drag row');
                handle.title = 'Drag row'; handle.textContent = '⠿';
                return handle;
              }, { key: rowKeys.get(row), side: -1, stopEvent: () => true }));
            });
            return false;
          });
          return DecorationSet.create(state.doc, widgets);
        },
      },
      view(view) {
        let drag = null, marker = null;
        const positionHandles = () => {
          view.dom.querySelectorAll('.canvas-table-row-drag').forEach(handle => {
            handle.style.left = `${handle.closest('.tableWrapper')?.scrollLeft || 0}px`;
          });
        };
        const scroll = () => {
          positionHandles();
          marker?.remove(); marker = null;
          if (drag) drag.target = null;
        };
        const clear = () => {
          marker?.remove(); marker = null;
          drag = null;
        };
        const rowInfo = element => {
          const rowDOM = element?.closest?.('tr');
          if (!rowDOM || !view.dom.contains(rowDOM)) return null;
          const resolved = view.state.doc.resolve(view.posAtDOM(rowDOM, 0));
          for (let depth = resolved.depth; depth > 0; depth--) {
            if (resolved.node(depth).type.name === 'tableRow') {
              return { row: resolved.node(depth), tablePos: resolved.before(depth - 1), rowDOM };
            }
          }
          return null;
        };
        const start = event => {
          if (!event.target.closest?.('.canvas-table-row-drag') || !view.editable) return;
          const source = rowInfo(event.target);
          if (!source) return;
          event.stopPropagation();
          drag = { ...source, doc: view.state.doc };
          view.dragging = null;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', 'Canvas table row');
          event.dataTransfer.setDragImage(source.rowDOM, 0, 0);
        };
        const over = event => {
          if (!drag) return;
          event.preventDefault(); event.stopPropagation();
          if (drag.cancelled) return;
          const target = rowInfo(event.target);
          marker?.remove(); marker = null;
          drag.target = null;
          if (!target || target.tablePos !== drag.tablePos) return;
          const bounds = target.rowDOM.getBoundingClientRect();
          const after = event.clientY >= bounds.top + bounds.height / 2;
          drag.target = { ...target, after };
          // An overlay outside editable DOM avoids DOMObserver reparsing rows.
          const wrapper = target.rowDOM.closest('.tableWrapper')?.getBoundingClientRect() || bounds;
          marker = document.createElement('div');
          marker.className = 'canvas-table-row-drop';
          marker.setAttribute('data-row-drop', after ? 'after' : 'before');
          Object.assign(marker.style, { position: 'fixed', pointerEvents: 'none', height: '2px', zIndex: '1100',
            left: `${Math.max(bounds.left, wrapper.left)}px`, top: `${after ? bounds.bottom : bounds.top}px`,
            width: `${Math.max(0, Math.min(bounds.right, wrapper.right) - Math.max(bounds.left, wrapper.left))}px`,
            background: 'var(--accent-primary, #1666aa)' });
          document.body.append(marker);
          event.dataTransfer.dropEffect = 'move';
        };
        const drop = event => {
          if (!drag) return;
          over(event);
          const current = drag;
          clear();
          if (!current.cancelled && current.doc === view.state.doc && current.target) {
            reorderTableRow(view, current.tablePos, current.row, current.target.row, current.target.after);
          }
        };
        view.dom.addEventListener('dragstart', start, true);
        view.dom.addEventListener('dragover', over, true);
        view.dom.addEventListener('drop', drop, true);
        view.dom.addEventListener('dragend', clear, true);
        document.addEventListener('scroll', scroll, true);
        positionHandles();
        return {
          update() {
            positionHandles();
            if (drag && drag.doc !== view.state.doc) {
              drag.cancelled = true; drag.target = null;
              marker?.remove(); marker = null;
            }
          },
          destroy() {
            clear();
            view.dom.removeEventListener('dragstart', start, true);
            view.dom.removeEventListener('dragover', over, true);
            view.dom.removeEventListener('drop', drop, true);
            view.dom.removeEventListener('dragend', clear, true);
            document.removeEventListener('scroll', scroll, true);
          },
        };
      },
    })];
  },
});

export default TableRowSorting;
