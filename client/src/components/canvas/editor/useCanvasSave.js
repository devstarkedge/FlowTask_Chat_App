/**
   Debounced save with Ctrl+S shortcut.
 *
 * Owns: debouncedSave, saveStatus state, Ctrl+S handler, cleanup.
 */
import { useEffect, useMemo, useState } from "react";
import debounce from "lodash/debounce";

/**
 * @param {object} editor - TipTap editor instance (or null while loading)
 * @param {Function} onSave - async (json) => void callback
 * @returns {{ saveStatus: string, flushSave: Function, debouncedSave: Function }}
 */
export function useCanvasSave(editor, onSave) {
  const [saveStatus, setSaveStatus] = useState("saved");

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

  // Cleanup on unmount.
  useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

  return { saveStatus, flushSave: debouncedSave.flush, debouncedSave };
}
