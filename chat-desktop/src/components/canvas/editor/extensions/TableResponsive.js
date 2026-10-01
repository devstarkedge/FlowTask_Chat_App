import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * TableResponsive Extension
 * Automatically tags tables in the DOM with `.is-compact` and `data-cols="compact"`
 * whenever column count exceeds 6, ensuring dynamic responsive column layout.
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
                const cols = firstRow.children.length;
                if (cols > 6) {
                  table.classList.add("is-compact");
                  table.setAttribute("data-cols", "compact");
                } else {
                  table.classList.remove("is-compact");
                  table.setAttribute("data-cols", "standard");
                }
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
