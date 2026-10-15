import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * TableResponsive Extension
 * Keep the table's minimum width proportional to its logical column count.
 * Added columns grow horizontally instead of squeezing the existing cells.
 */
export const TableResponsive = Extension.create({
  name: "tableResponsive",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("tableResponsivePlugin"),
        view(editorView) {
          const updateTables = () => {
            const dom = editorView?.dom;
            if (!dom) return;
            const tables = dom.querySelectorAll("table");
            tables.forEach((table) => {
              const firstRow = table.querySelector("tr");
              if (firstRow) {
                const cols = [...firstRow.cells].reduce((count, cell) => count + cell.colSpan, 0);
                const minimum = `max(100%, ${cols * 160}px)`;
                if (table.style.minWidth !== minimum) table.style.minWidth = minimum;
              }
            });
          };

          // Initial tagging
          updateTables();

          return {
            update() {
              updateTables();
            },
          };
        },
      }),
    ];
  },
});

export default TableResponsive;
