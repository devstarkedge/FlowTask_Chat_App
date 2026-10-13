import { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import SelectionToolbar from '../toolbars/SelectionToolbar';
import { textSelectionPosition, dismissTextSelectionOnMedia } from '../editor/textSelection';

export const titleExtensions = () => [
  Node.create({ name: 'doc', topNode: true, content: 'paragraph' }),
  StarterKit.configure({ document: false, heading: false, blockquote: false, bulletList: false, orderedList: false, listItem: false, codeBlock: false, horizontalRule: false, hardBreak: false, link: false, underline: false }),
  Underline, Link.configure({ openOnClick: false }), TextAlign.configure({ types: ['paragraph'] }),
  Placeholder.configure({ placeholder: 'Your canvas title' }),
];

export default function CanvasTitleEditor({ canvasId, title, titleDocument, onChange, onBlur, editable = true }) {
  const [toolbar, setToolbar] = useState({ visible: false });
  const refresh = editor => {
    const position = textSelectionPosition(editor);
    setToolbar(position ? { ...position, visible: true } : { visible: false });
  };
  const editor = useEditor({
    extensions: titleExtensions(), editable,
    content: titleDocument || { type: 'doc', content: [{ type: 'paragraph', content: title ? [{ type: 'text', text: title }] : [] }] },
    editorProps: { attributes: { class: 'canvas-title-input', 'aria-label': 'Canvas title' },
      handleKeyDown: (_view, event) => event.key === 'Enter',
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        if (!text?.includes('\n')) return false;
        event.preventDefault(); editor.commands.insertContent(text.replace(/\s*\n\s*/g, ' ')); return true;
      } },
    onUpdate: ({ editor }) => onChange(editor.getText(), editor.getJSON()),
    onTransaction: ({ editor }) => refresh(editor),
    onFocus: ({ editor }) => refresh(editor),
    onBlur: () => { setToolbar({ visible: false }); onBlur(); },
  }, [canvasId]);
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = titleDocument || { type: 'doc', content: [{ type: 'paragraph', content: title ? [{ type: 'text', text: title }] : [] }] };
    if (JSON.stringify(next) !== JSON.stringify(editor.getJSON())) editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, title, titleDocument]);
  useEffect(() => {
    if (!editor) return;
    const update = () => refresh(editor);
    const onPointer = event => { dismissTextSelectionOnMedia(editor, event.target); refresh(editor); };
    document.addEventListener('scroll', update, true); window.addEventListener('resize', update);
    document.addEventListener('pointerdown', onPointer, true);
    return () => { document.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); document.removeEventListener('pointerdown', onPointer, true); };
  }, [editor]);
  return <><EditorContent className="canvas-title-editor" editor={editor} /><SelectionToolbar editor={editor} toolbar={toolbar} titleOnly /></>;
}
