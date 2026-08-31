const listeners = new Set();

export function onPreviewRequest(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function openPreview(file, files = []) {
  for (const fn of Array.from(listeners)) {
    try {
      fn(file, files);
    } catch (err) {
      // swallow individual handler errors but log for debugging
      // eslint-disable-next-line no-console
      console.error("previewService handler error", err);
    }
  }
}

export default {
  onPreviewRequest,
  openPreview,
};
