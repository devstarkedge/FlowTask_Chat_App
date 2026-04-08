import { useEffect, useCallback, forwardRef, useImperativeHandle, memo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import UnderlineExt from '@tiptap/extension-underline'
import LinkExt from '@tiptap/extension-link'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)

// ─── Mention Node (lightweight custom node instead of full @tiptap/extension-mention) ─
import { Node, mergeAttributes } from '@tiptap/core'

const MentionNode = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: null },
      mentionType: { default: 'user' }, // 'user' | 'channel'
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-mention-id]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const prefix = node.attrs.mentionType === 'channel' ? '#' : '@'
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'mention-tag',
        'data-mention-id': node.attrs.id,
        'data-mention-type': node.attrs.mentionType,
        contenteditable: 'false',
      }),
      `${prefix}${node.attrs.label}`,
    ]
  },
})

// ─── RichTextEditor ──────────────────────────────────────────────────────────

const RichTextEditor = forwardRef(function RichTextEditor(
  {
    placeholder = 'Type a message...',
    onSubmit,
    onInput,
    onFocus,
    onBlur,
    onKeyDown,
    className = '',
    editable = true,
  },
  ref
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // We use CodeBlockLowlight instead
        dropcursor: { color: 'var(--accent-primary)', width: 2 },
        // Disable built-in versions so our standalone ones don't conflict
        link: false,
        underline: false,
      }),
      UnderlineExt,
      LinkExt.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      Placeholder.configure({ placeholder }),
      CodeBlockLowlight.configure({ lowlight }),
      MentionNode,
    ],
    editable,
    editorProps: {
      attributes: {
        class: `slack-rich-editor ${className}`.trim(),
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': placeholder,
      },
      handleKeyDown: (_view, event) => {
        // Let external handler decide (e.g. mention dropdown keys)
        if (onKeyDown) {
          const handled = onKeyDown(event)
          if (handled) return true
        }

        // Enter to send (without shift)
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onSubmit?.()
          return true
        }

        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      onInput?.({
        html: ed.getHTML(),
        text: ed.getText(),
        isEmpty: ed.isEmpty,
      })
    },
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
  })

  // Expose imperative API
  useImperativeHandle(
    ref,
    () => ({
      /** Get current HTML & text content */
      getContent() {
        if (!editor) return { html: '', text: '', mentions: [] }
        
        const mentions = []
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'mention') {
            mentions.push({
              userId: node.attrs.id,
              username: node.attrs.label,
              type: node.attrs.mentionType || 'user'
            })
          }
        })
        
        // Deduplicate mentions to prevent multiple notifications for same user
        const uniqueMentions = Array.from(new Map(mentions.map(m => [m.userId, m])).values())

        return { 
          html: editor.getHTML(), 
          text: editor.getText(),
          mentions: uniqueMentions
        }
      },
      /** Check if editor has no real content */
      isEmpty() {
        return editor?.isEmpty ?? true
      },
      /** Set HTML content (for draft restore / editing) */
      setContent(html) {
        editor?.commands.setContent(html || '', { emitUpdate: false })
      },
      /** Clear the editor — emitUpdate=false to prevent triggering onUpdate/draft-save pipeline */
      clear() {
        editor?.commands.clearContent(false)
      },
      /** Focus the editor */
      focus(position = 'end') {
        editor?.commands.focus(position)
      },
      /** Insert text at current cursor */
      insertText(text) {
        editor?.commands.insertContent(text)
      },
      /** Insert an emoji at current cursor */
      insertEmoji(emoji) {
        editor?.commands.insertContent(emoji)
      },
      /** Insert a mention node */
      insertMention(id, label, mentionType = 'user') {
        editor
          ?.chain()
          .focus()
          .insertContent([
            {
              type: 'mention',
              attrs: { id, label, mentionType },
            },
            { type: 'text', text: ' ' },
          ])
          .run()
      },
      /** Insert a link */
      insertLink(url, text) {
        if (!editor) return
        if (text) {
          editor
            .chain()
            .focus()
            .insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`)
            .run()
        } else {
          editor.chain().focus().setLink({ href: url }).run()
        }
      },

      // ─── Formatting commands ─────────────────────────────────────
      toggleBold() { editor?.chain().focus().toggleBold().run() },
      toggleItalic() { editor?.chain().focus().toggleItalic().run() },
      toggleUnderline() { editor?.chain().focus().toggleUnderline().run() },
      toggleStrike() { editor?.chain().focus().toggleStrike().run() },
      toggleBulletList() { editor?.chain().focus().toggleBulletList().run() },
      toggleOrderedList() { editor?.chain().focus().toggleOrderedList().run() },
      toggleBlockquote() { editor?.chain().focus().toggleBlockquote().run() },
      toggleCode() { editor?.chain().focus().toggleCode().run() },
      toggleCodeBlock() { editor?.chain().focus().toggleCodeBlock().run() },

      /** Check if a mark / node is active */
      isActive(name, attrs) {
        return editor?.isActive(name, attrs) ?? false
      },

      /** Get the raw TipTap editor instance */
      getEditor() { return editor },

      /** Get the text before cursor (for mention detection) */
      getTextBeforeCursor() {
        if (!editor) return ''
        const { from } = editor.state.selection
        const textBefore = editor.state.doc.textBetween(
          Math.max(0, from - 50),
          from,
          '\n'
        )
        return textBefore
      },
    }),
    [editor]
  )

  // Cleanup
  useEffect(() => {
    return () => editor?.destroy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null

  return <EditorContent editor={editor} />
})

export default memo(RichTextEditor)
