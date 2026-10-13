import { TextSelection } from '@tiptap/pm/state';

export function dismissTextSelectionOnMedia(editor, target) {
  if (!editor?.isFocused || !editor.isEditable || !target?.closest) return;
  const media = target.closest('img, video, audio, iframe, .canvas-image-node-container, .canvas-video-node-container, [data-type="file-attachment"], [data-type="video-block"], [data-type="audio-block"], .canvas-cover-strip, .canvas-cover-actions, .canvas-cover-picker-panel');
  if (!media) return;
  if (editor.view.dom.contains(media)) {
    const pos = editor.view.posAtDOM(media, 0);
    if (editor.state.doc.nodeAt(pos)?.isAtom) { editor.commands.setNodeSelection(pos); return; }
  }
  // Transition the old range to a caret, without blurring media or moving DOM.
  editor.commands.setTextSelection(editor.state.selection.from);
}

export function textSelectionPosition(editor) {
  if (!editor || editor.isDestroyed || !editor.isEditable || !editor.isFocused) return null;
  const selection = editor.state.selection;
  if (!(selection instanceof TextSelection) || selection.empty || !selection.$from.parent.inlineContent || !selection.$to.parent.inlineContent) return null;
  let media = false;
  editor.state.doc.nodesBetween(selection.from, selection.to, node => {
    if (node.isAtom && !node.isText && !node.isInline) media = true;
  });
  if (media || !editor.state.doc.textBetween(selection.from, selection.to).trim()) return null;
  try {
    const start = editor.view.coordsAtPos(selection.from);
    const end = editor.view.coordsAtPos(selection.to);
    let top = 0, bottom = window.innerHeight, left = 0, right = window.innerWidth;
    for (let parent = editor.view.dom.parentElement; parent; parent = parent.parentElement) {
      const css = window.getComputedStyle(parent);
      if (/(auto|scroll|hidden|clip)/.test(css.overflow + css.overflowY + css.overflowX)) {
        const rect = parent.getBoundingClientRect();
        top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom);
        left = Math.max(left, rect.left); right = Math.min(right, rect.right);
      }
    }
    if (Math.max(start.bottom, end.bottom) <= top || Math.min(start.top, end.top) >= bottom || start.right < left || start.left > right) return null;
    return { x: Math.max(left + 12, Math.min((start.left + end.right) / 2, right - 12)),
      y: Math.max(top + 8, Math.min(Math.min(start.top, end.top) - 56, bottom - 64)) };
  } catch { return null; }
}
