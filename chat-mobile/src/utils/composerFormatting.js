export const FORMAT_STATE_KEYS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'codeBlock',
  'blockquote',
  'bulletList',
  'orderedList',
];

const NO_ARG_COMMANDS = new Set([
  'toggleBold',
  'toggleItalic',
  'toggleUnderline',
  'toggleStrike',
  'toggleBulletList',
  'toggleOrderedList',
  'toggleBlockquote',
  'toggleCode',
  'toggleCodeBlock',
]);

/**
 * Resolve composer formatting toolbar visibility when entering or leaving edit mode.
 * Always shows the formatter when message editing begins, and restores the user's
 * previous toolbar toggle state once editing completes or is cancelled.
 */
export function resolveEditToolbarTransition({
  wasEditing = false,
  isEditing = false,
  currentShowToolbar = false,
  savedBeforeEdit = false,
} = {}) {
  if (!wasEditing && isEditing) {
    return {
      showToolbar: true,
      savedBeforeEdit: Boolean(currentShowToolbar),
      wasEditing: true,
    };
  }
  if (wasEditing && !isEditing) {
    return {
      showToolbar: Boolean(savedBeforeEdit),
      savedBeforeEdit: Boolean(savedBeforeEdit),
      wasEditing: false,
    };
  }
  return {
    showToolbar: Boolean(currentShowToolbar),
    savedBeforeEdit: Boolean(savedBeforeEdit),
    wasEditing: Boolean(isEditing),
  };
}

export function mergeFormatState(prev = {}, nextState = {}) {
  const same = FORMAT_STATE_KEYS.every((k) => prev[k] === nextState[k]);
  return same ? prev : { ...prev, ...nextState };
}

export function dispatchRichTextCommand(editor, command, value = null) {
  if (!editor || !command) return false;
  if (NO_ARG_COMMANDS.has(command) && typeof editor[command] === 'function') {
    editor[command]();
    return true;
  }
  if (command === 'setLink' && typeof editor.setLink === 'function') {
    editor.setLink(value);
    return true;
  }
  return false;
}
