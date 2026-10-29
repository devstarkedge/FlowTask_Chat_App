import { useUserProfileStore } from '../../stores/userProfileStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useChannelStore } from '../../stores/channelStore';
import { useEffect, forwardRef, useImperativeHandle, memo } from "react";
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import UnderlineExt from '@tiptap/extension-underline'
import LinkExt from '@tiptap/extension-link'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { splitListItem } from '@tiptap/pm/schema-list'

const lowlight = createLowlight(common)

// ─── Mention Node (lightweight custom node instead of full @tiptap/extension-mention) ─
import { Node, mergeAttributes } from '@tiptap/core'

const resolveFallbackLabel = (id, mentionType) => {
  if (!id) return ''
  if (id === 'channel') return 'channel'
  try {
    if (mentionType === 'channel') {
      const channel = useChannelStore?.getState?.()?.channels?.find?.((c) => String(c._id) === String(id))
      if (channel?.name) return channel.name
    } else {
      const profilesByWs = useUserProfileStore?.getState?.()?.profilesByWorkspace || {}
      for (const wsProfiles of Object.values(profilesByWs)) {
        if (wsProfiles?.[id]?.name) return wsProfiles[id].name
      }
      const wsMembers = useWorkspaceStore?.getState?.()?.members || []
      const foundWsMember = wsMembers.find((m) => String(m._id || m.userId?._id || m.userId) === String(id))
      if (foundWsMember?.name || foundWsMember?.userId?.name) {
        return foundWsMember.name || foundWsMember.userId.name
      }
      const membersByCh = useChannelStore?.getState?.()?.membersByChannel || {}
      for (const mList of Object.values(membersByCh)) {
        if (Array.isArray(mList)) {
          const m = mList.find((x) => String(x._id || x.userId?._id || x.userId) === String(id))
          if (m?.name || m?.userId?.name) return m.name || m.userId.name
        }
      }
    }
  } catch {
    // fallback safe
  }
  return ''
}

const MentionNode = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-mention-id') || element.getAttribute('data-id') || element.getAttribute('data-user-id'),
        renderHTML: (attributes) => ({
          'data-mention-id': attributes.id,
        }),
      },
      label: {
        default: null,
        parseHTML: (element) => {
          const attr = element.getAttribute('data-label') || element.getAttribute('data-mention-label')
          if (attr && attr !== 'null' && attr !== 'undefined') return attr
          const rawText = element.textContent?.trim() || ''
          const cleaned = rawText.replace(/^[@#]/, '').trim()
          if (cleaned && cleaned !== 'null' && cleaned !== 'undefined') return cleaned
          const id = element.getAttribute('data-mention-id') || element.getAttribute('data-id') || element.getAttribute('data-user-id')
          const mentionType = element.getAttribute('data-mention-type') || 'user'
          return resolveFallbackLabel(id, mentionType) || null
        },
        renderHTML: (attributes) => ({
          'data-label': attributes.label,
        }),
      },
      mentionType: {
        default: 'user',
        parseHTML: (element) => element.getAttribute('data-mention-type') || 'user',
        renderHTML: (attributes) => ({
          'data-mention-type': attributes.mentionType,
        }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-mention-id]' },
      { tag: 'span[data-mention-type]' },
      { tag: 'span[data-type="mention"]' },
      { tag: 'span.mention-tag' },
      { tag: 'span.mention' },
    ]
  },

  renderText({ node }) {
    const isBroadcast = node.attrs.id === 'channel' || node.attrs.label === 'channel' || node.attrs.label === 'everyone' || node.attrs.label === 'here';
    const prefix = (node.attrs.mentionType === 'channel' && !isBroadcast) ? '#' : '@'
    let label = node.attrs.label
    if (!label || label === 'null' || label === 'undefined') {
      label = resolveFallbackLabel(node.attrs.id, node.attrs.mentionType) || (isBroadcast ? 'channel' : 'User')
    }
    return `${prefix}${label}`
  },

  renderHTML({ node, HTMLAttributes }) {
    const isBroadcast = node.attrs.id === 'channel' || node.attrs.label === 'channel' || node.attrs.label === 'everyone' || node.attrs.label === 'here';
    const prefix = (node.attrs.mentionType === 'channel' && !isBroadcast) ? '#' : '@'
    let label = node.attrs.label
    if (!label || label === 'null' || label === 'undefined') {
      label = resolveFallbackLabel(node.attrs.id, node.attrs.mentionType) || (isBroadcast ? 'channel' : 'User')
    }
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'mention-tag',
        'data-mention-id': node.attrs.id,
        'data-mention-type': node.attrs.mentionType,
        'data-label': label,
        contenteditable: 'false',
      }),
      `${prefix}${label}`,
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

        // Shift+Enter inside a list: split the list item to continue the list
        // instead of inserting a hard break (<br>)
        if (event.key === 'Enter' && event.shiftKey) {
          const { state, dispatch } = _view
          const { $from } = state.selection

          // Walk up the document tree to check if the cursor is inside a listItem
          let inListItem = false
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'listItem') {
              inListItem = true
              break
            }
          }

          if (inListItem) {
            const listItemType = state.schema.nodes.listItem
            if (listItemType) {
              // splitListItem creates a new list item at the cursor position
              const cmd = splitListItem(listItemType)
              if (cmd(state, dispatch)) {
                event.preventDefault()
                return true
              }
            }
          }
          // If not in a list, fall through to default TipTap behavior (hard break)
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
            const isBroadcast = node.attrs.id === 'channel' || node.attrs.label === 'channel' || node.attrs.label === 'everyone' || node.attrs.label === 'here';
            mentions.push({
              userId: node.attrs.id,
              username: node.attrs.label,
              type: isBroadcast ? 'channel' : (node.attrs.mentionType || 'user')
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
      focus(position = 'end', options = { scrollIntoView: false }) {
        editor?.commands.focus(position, options)
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
      insertMention(id, label, mentionType = 'user', range = null) {
        if (!editor) return
        const isBroadcast = id === 'channel' || label === 'channel' || label === 'everyone' || label === 'here';
        const safeLabel = (label && label !== 'null' && label !== 'undefined')
          ? label
          : (resolveFallbackLabel(id, mentionType) || (isBroadcast ? 'channel' : 'User'))

        const content = [
          {
            type: 'mention',
            attrs: { id, label: safeLabel, mentionType },
          },
          { type: 'text', text: ' ' },
        ]

        if (range && typeof range.from === 'number' && typeof range.to === 'number') {
          editor
            .chain()
            .focus()
            .insertContentAt(range, content)
            .run()
        } else {
          editor
            .chain()
            .focus()
            .insertContent(content)
            .run()
        }

        // Calculate cursor position after mention node (size 1) + space (size 1)
        const targetPos = range && typeof range.from === 'number'
          ? range.from + 2
          : editor.state.selection.to

        const safePos = Math.min(targetPos, editor.state.doc.content.size)

        editor
          .chain()
          .focus()
          .setTextSelection(safePos)
          .run()

        // Sync browser DOM selection to ensure caret is rendered after the space
        try {
          const domView = editor.view?.dom?.ownerDocument?.defaultView || window
          const domSelection = domView?.getSelection?.()
          if (domSelection) {
            const anchor = editor.view.domAtPos(safePos)
            if (anchor && anchor.node) {
              const domRange = domView.document.createRange()
              domRange.setStart(anchor.node, anchor.offset)
              domRange.collapse(true)
              domSelection.removeAllRanges()
              domSelection.addRange(domRange)
            }
          }
        } catch {
          // safe fallback
        }
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
