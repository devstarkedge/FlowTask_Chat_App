import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useChannelStore } from '../../stores/channelStore'
import { useDraftStore } from '../../stores/draftStore'
import { messageAPI } from '../../services/api'
import { emitTypingStart, emitTypingStop } from '../../services/socket'
import {
  Send, Paperclip, Smile, Bold, Italic, Underline, Strikethrough,
  Code, Braces, List, ListOrdered, Quote, Link, X, FileText, Image,
  Loader2, Plus, AtSign, Hash, ChevronDown
} from 'lucide-react'
import toast from 'react-hot-toast'
import EmojiPicker from './EmojiPicker'
import MentionDropdown from './MentionDropdown'

// ─── Rich Text Editor Helpers ────────────────────────────────────────────────

function execCmd(command, value = null) {
  document.execCommand(command, false, value)
}

function saveSelection() {
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    return sel.getRangeAt(0).cloneRange()
  }
  return null
}

function restoreSelection(range) {
  if (!range) return
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

function insertHtmlAtCaret(html) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const temp = document.createElement('div')
  temp.innerHTML = html
  const frag = document.createDocumentFragment()
  let lastNode
  while (temp.firstChild) {
    lastNode = frag.appendChild(temp.firstChild)
  }
  range.insertNode(frag)
  if (lastNode) {
    const newRange = document.createRange()
    newRange.setStartAfter(lastNode)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
  }
}

function getEditorContent(editorEl) {
  if (!editorEl) return { html: '', text: '' }
  const html = editorEl.innerHTML || ''
  const text = editorEl.textContent || ''
  // Check if the content is just whitespace or empty tags
  const cleaned = text.trim()
  if (!cleaned && !html.includes('<img')) {
    return { html: '', text: '' }
  }
  return { html, text: cleaned }
}

function isEditorEmpty(editorEl) {
  if (!editorEl) return true
  const text = (editorEl.textContent || '').trim()
  return !text && !editorEl.querySelector('img')
}

const ToolbarButton = memo(function ToolbarButton({ icon: Icon, title, onClick, disabled, active, size = 15 }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault() // Prevent blur on editor
      }}
      onClick={(e) => {
        e.preventDefault()
        if (!disabled) onClick?.(e)
      }}
      title={title}
      disabled={disabled}
      className={`slack-toolbar-btn ${active ? 'active' : ''}`}
      data-active={active || undefined}
      aria-label={title}
      aria-pressed={active}
    >
      <Icon size={size} />
    </button>
  )
})

// ─── Link Insert Modal ───────────────────────────────────────────────────────

function LinkModal({ onInsert, onClose }) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (url && url !== 'https://') {
      onInsert(url, text || url)
    }
    onClose()
  }

  return (
    <div
      className="animate-fade-in-scale"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        zIndex: 70,
        width: 300,
        padding: 12,
        background: 'var(--bg-modal)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        marginBottom: 4,
      }}
    >
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
            URL
          </label>
          <input
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input-field"
            style={{ fontSize: 13, padding: '6px 10px' }}
            placeholder="https://example.com"
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
            Text (optional)
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input-field"
            style={{ fontSize: 13, padding: '6px 10px' }}
            placeholder="Link text"
          />
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: '5px 12px', fontSize: 12 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            style={{ padding: '5px 12px', fontSize: 12 }}
          >
            Insert
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MessageInput({ channelId, threadId, placeholder }) {
  const [isSending, setIsSending] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploadingFiles, setUploadingFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [showToolbar, setShowToolbar] = useState(true)
  const [hasContent, setHasContent] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [formatState, setFormatState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    insertUnorderedList: false,
    insertOrderedList: false,
    blockquote: false,
  })

  // Mention state
  const [mentionType, setMentionType] = useState(null) // 'user' | 'channel' | null
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionTriggerPos, setMentionTriggerPos] = useState(null)

  const { sendMessage } = useChatStore()
  const { setDraft, getDraft, clearDraft } = useDraftStore()

  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const containerRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const savedRangeRef = useRef(null)
  const draftTimerRef = useRef(null)
  const lastChannelRef = useRef(channelId)

  // ─── Draft Persistence ───────────────────────────────────────────────────

  // Save draft on channel switch (leaving current channel)
  useEffect(() => {
    if (lastChannelRef.current && lastChannelRef.current !== channelId) {
      // Save draft for the channel we're leaving
      const editor = editorRef.current
      if (editor) {
        const { html, text } = getEditorContent(editor)
        if (text) {
          setDraft(lastChannelRef.current, html, text)
        } else {
          clearDraft(lastChannelRef.current)
        }
      }
    }
    lastChannelRef.current = channelId
  }, [channelId, setDraft, clearDraft])

  // Restore draft when channel changes
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const draft = getDraft(channelId)
    if (draft?.html) {
      editor.innerHTML = draft.html
      setHasContent(true)
    } else {
      editor.innerHTML = ''
      setHasContent(false)
    }
    // Focus editor
    requestAnimationFrame(() => editor.focus())
  }, [channelId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced draft save on content change
  const saveDraftDebounced = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      const editor = editorRef.current
      if (!editor) return
      const { html, text } = getEditorContent(editor)
      if (text) {
        setDraft(channelId, html, text)
      }
    }, 800)
  }, [channelId, setDraft])

  // ─── Typing ──────────────────────────────────────────────────────────────

  const handleTyping = useCallback(() => {
    emitTypingStart(channelId)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStop(channelId)
    }, 3000)
  }, [channelId])

  // ─── File Processing ─────────────────────────────────────────────────────

  const processFiles = async (files) => {
    if (files.length === 0) return
    if (pendingFiles.length + uploadingFiles.length + files.length > 10) {
      toast.error('Maximum 10 files per message')
      return
    }

    const localPreviews = files.map((f, idx) => ({
      localId: `uploading-${Date.now()}-${idx}`,
      file: f,
      preview: f.type?.startsWith('image/') ? URL.createObjectURL(f) : null,
      name: f.name,
      size: f.size,
      mimeType: f.type,
      uploading: true,
    }))

    setUploadingFiles((prev) => [...prev, ...localPreviews])
    setIsUploading(true)

    try {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      const { data } = await messageAPI.uploadFiles(channelId, formData)

      localPreviews.forEach(({ preview }) => { if (preview) URL.revokeObjectURL(preview) })

      setUploadingFiles((prev) =>
        prev.filter((f) => !localPreviews.some((lp) => lp.localId === f.localId))
      )
      setPendingFiles((prev) => [...prev, ...data.data.files])
    } catch (error) {
      localPreviews.forEach(({ preview }) => { if (preview) URL.revokeObjectURL(preview) })
      setUploadingFiles((prev) =>
        prev.filter((f) => !localPreviews.some((lp) => lp.localId === f.localId))
      )
      toast.error(error.response?.data?.error?.message || 'Upload failed')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    processFiles(files)
  }

  const removePendingFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const removeUploadingFile = (localId) => {
    setUploadingFiles((prev) => {
      const removed = prev.find((f) => f.localId === localId)
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((f) => f.localId !== localId)
    })
  }

  // ─── Drag & Drop ─────────────────────────────────────────────────────────

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    processFiles(files)
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const editor = editorRef.current
    if (!editor) return

    const { html, text } = getEditorContent(editor)
    if (!text && pendingFiles.length === 0) return
    if (isSending || isUploading) return

    setIsSending(true)
    try {
      const fileReferences = pendingFiles.map((f) => f._id)
      await sendMessage(channelId, text || ' ', {
        threadId,
        htmlContent: html || undefined,
        fileReferences: fileReferences.length > 0 ? fileReferences : undefined,
      })

      // Clear editor
      editor.innerHTML = ''
      setHasContent(false)
      setPendingFiles([])
      clearDraft(channelId)
      if (typeof checkFormatting === 'function') checkFormatting()

      emitTypingStop(channelId)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    } catch {
      // Error handled in store
    } finally {
      setIsSending(false)
      requestAnimationFrame(() => editorRef.current?.focus())
    }
  }

  // ─── Paste Handler (images + plain text formatting) ───────────────────────

  const handlePaste = (e) => {
    const clipboardData = e.clipboardData
    if (!clipboardData) return

    // Check for pasted files (images)
    const files = []
    for (const item of clipboardData.items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      processFiles(files)
      return
    }

    // For text paste, paste as plain text to avoid external formatting
    const text = clipboardData.getData('text/plain')
    if (text) {
      e.preventDefault()
      execCmd('insertText', text)
    }
  }

  // ─── Mention Detection ────────────────────────────────────────────────────

  const detectMention = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return

    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) {
      setMentionType(null)
      return
    }

    const text = textNode.textContent
    const cursorPos = range.startOffset

    // Look backwards from cursor for @ or #
    let triggerIndex = -1
    let triggerChar = null
    for (let i = cursorPos - 1; i >= 0; i--) {
      const ch = text[i]
      if (ch === '@' || ch === '#') {
        // Check that it's either at the start or preceded by a space
        if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\n' || text[i - 1] === '\u00a0') {
          triggerIndex = i
          triggerChar = ch
        }
        break
      }
      if (ch === ' ' || ch === '\n') break
    }

    if (triggerIndex >= 0 && triggerChar) {
      const query = text.substring(triggerIndex + 1, cursorPos)
      setMentionType(triggerChar === '@' ? 'user' : 'channel')
      setMentionQuery(query)
      setMentionTriggerPos(triggerIndex)
    } else {
      setMentionType(null)
    }
  }, [])

  // ─── Mention Selection ────────────────────────────────────────────────────

  const handleMentionSelect = useCallback((item) => {
    const editor = editorRef.current
    if (!editor) return

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return

    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) return

    const text = textNode.textContent
    const cursorPos = range.startOffset

    // Find the trigger character position
    let triggerIndex = -1
    const triggerChar = mentionType === 'user' ? '@' : '#'
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === triggerChar) {
        triggerIndex = i
        break
      }
    }
    if (triggerIndex < 0) return

    // Replace the trigger + query with a mention span
    const before = text.substring(0, triggerIndex)
    const after = text.substring(cursorPos)

    // Create the mention element
    const mentionLabel = mentionType === 'user' ? `@${item.name}` : `#${item.name}`

    // Replace text content
    textNode.textContent = before
    const mentionSpan = document.createElement('span')
    mentionSpan.className = 'mention-tag'
    mentionSpan.contentEditable = 'false'
    mentionSpan.dataset.mentionId = item.id
    mentionSpan.dataset.mentionType = mentionType
    mentionSpan.textContent = mentionLabel

    const afterNode = document.createTextNode('\u00a0' + after)

    const parent = textNode.parentNode
    parent.insertBefore(mentionSpan, textNode.nextSibling)
    parent.insertBefore(afterNode, mentionSpan.nextSibling)

    // Place cursor after the mention
    const newRange = document.createRange()
    newRange.setStart(afterNode, 1)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)

    setMentionType(null)
    setMentionQuery('')
    updateHasContent()
  }, [mentionType])

  // ─── Input Event Handler ──────────────────────────────────────────────────

  const updateHasContent = useCallback(() => {
    const editor = editorRef.current
    const empty = isEditorEmpty(editor)
    setHasContent(!empty || pendingFiles.length > 0)
  }, [pendingFiles.length])

  const checkFormatting = useCallback(() => {
    if (!editorRef.current) return
    try {
      let isQuote = false
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).startContainer
        while (node && node !== editorRef.current) {
          if (node.nodeName === 'BLOCKQUOTE') {
            isQuote = true
            break
          }
          node = node.parentNode
        }
      }

      setFormatState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        blockquote: isQuote,
      })
    } catch {
      // Ignore if disconnected or unsupported
    }
  }, [])

  const handleInput = useCallback(() => {
    updateHasContent()
    handleTyping()
    saveDraftDebounced()
    detectMention()
    checkFormatting()
  }, [updateHasContent, handleTyping, saveDraftDebounced, detectMention, checkFormatting])

  // ─── Key Down Handler ─────────────────────────────────────────────────────

  const handleKeyDown = (e) => {
    // If mention dropdown is open, let it handle keys
    if (mentionType) {
      if (['ArrowUp', 'ArrowDown', 'Tab'].includes(e.key)) return
      if (e.key === 'Enter') return
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionType(null)
        checkFormatting()
        return
      }
    }

    // Enter to send (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
      return
    }

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        formatStrikethrough()
        return
      }
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault()
          formatBold()
          return
        case 'i':
          e.preventDefault()
          formatItalic()
          return
        case 'u':
          e.preventDefault()
          formatUnderline()
          return
        default:
          break
      }
    }

    // Escape to close popups
    if (e.key === 'Escape') {
      if (showEmoji) setShowEmoji(false)
      if (showLinkModal) setShowLinkModal(false)
    }
  }

  // ─── Formatting Actions ───────────────────────────────────────────────────

  const formatCommand = useCallback((command) => {
    editorRef.current?.focus()
    execCmd(command)
    checkFormatting()
    handleInput()
  }, [checkFormatting, handleInput])

  const formatBold = useCallback(() => formatCommand('bold'), [formatCommand])
  const formatItalic = useCallback(() => formatCommand('italic'), [formatCommand])
  const formatUnderline = useCallback(() => formatCommand('underline'), [formatCommand])
  const formatStrikethrough = useCallback(() => formatCommand('strikeThrough'), [formatCommand])
  const formatBulletList = useCallback(() => formatCommand('insertUnorderedList'), [formatCommand])
  const formatNumberedList = useCallback(() => formatCommand('insertOrderedList'), [formatCommand])

  const formatInlineCode = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    // Quick command shortcut if empty selection
    editor.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const selected = range.toString()
    if (selected) {
      const code = document.createElement('code')
      code.textContent = selected
      range.deleteContents()
      range.insertNode(code)
      // Move cursor after code
      const newRange = document.createRange()
      newRange.setStartAfter(code)
      newRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(newRange)
    } else {
      const code = document.createElement('code')
      code.innerHTML = '&ZeroWidthSpace;'
      range.insertNode(code)
      const newRange = document.createRange()
      newRange.selectNodeContents(code)
      sel.removeAllRanges()
      sel.addRange(newRange)
    }
    handleInput()
  }, [handleInput])

  const formatCodeBlock = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    
    // Prevent nesting PRE tags
    let node = range.startContainer
    while (node && node !== editor) {
      if (node.nodeName === 'PRE') return
      node = node.parentNode
    }

    const selected = range.toString()
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = selected || '\n'
    pre.appendChild(code)
    range.deleteContents()
    range.insertNode(pre)
    // Insert a br after to allow typing after the block
    const br = document.createElement('br')
    pre.parentNode.insertBefore(br, pre.nextSibling)
    const newRange = document.createRange()
    newRange.selectNodeContents(code)
    if (selected) {
      newRange.collapse(false)
    }
    sel.removeAllRanges()
    sel.addRange(newRange)
    handleInput()
  }, [handleInput])

  const formatQuote = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    let isQuote = false
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      let node = sel.getRangeAt(0).startContainer
      while (node && node !== editor) {
        if (node.nodeName === 'BLOCKQUOTE') {
          isQuote = true
          break
        }
        node = node.parentNode
      }
    }

    if (isQuote) {
      execCmd('formatBlock', 'DIV')
    } else {
      execCmd('formatBlock', 'BLOCKQUOTE')
    }
    
    checkFormatting()
    handleInput()
  }, [checkFormatting, handleInput])

  const handleLinkInsert = useCallback((url, text) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    restoreSelection(savedRangeRef.current)
    const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer">${text || url}</a>`
    insertHtmlAtCaret(linkHtml)
    handleInput()
  }, [handleInput])

  // ─── Emoji Insert ─────────────────────────────────────────────────────────

  const insertEmoji = useCallback((emoji) => {
    const editor = editorRef.current
    if (editor) {
      editor.focus()
      restoreSelection(savedRangeRef.current)
      insertHtmlAtCaret(emoji)
      handleInput()
    }
    setShowEmoji(false)
  }, [handleInput])

  // Save selection before opening emoji/link modal
  const handleEmojiToggle = useCallback(() => {
    savedRangeRef.current = saveSelection()
    setShowEmoji((prev) => !prev)
    setShowLinkModal(false)
  }, [])

  const handleLinkToggle = useCallback(() => {
    savedRangeRef.current = saveSelection()
    setShowLinkModal((prev) => !prev)
    setShowEmoji(false)
  }, [])

  // ─── Auto focus ───────────────────────────────────────────────────────────

  useEffect(() => {
    requestAnimationFrame(() => editorRef.current?.focus())
  }, [channelId])

  // Update hasContent when files change
  useEffect(() => {
    updateHasContent()
  }, [pendingFiles.length, uploadingFiles.length, updateHasContent])

  // ─── Render ───────────────────────────────────────────────────────────────

  const isDisabled = (!hasContent && pendingFiles.length === 0) || isSending || isUploading
  const allPreviewFiles = [
    ...uploadingFiles,
    ...pendingFiles.map((f, i) => ({ ...f, isPending: true, idx: i })),
  ]

  return (
    <div
      className="slack-composer-wrapper"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        ref={containerRef}
        className={`slack-composer ${isFocused ? 'focused' : ''} ${isDragOver ? 'drag-over' : ''}`}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="slack-composer-drag-overlay">
            <Paperclip size={24} />
            <span>Drop files to upload</span>
          </div>
        )}

        {/* Formatting Toolbar */}
        {showToolbar && (
          <div className="slack-formatting-toolbar">
            <div className="slack-toolbar-group">
              <ToolbarButton icon={Bold} title="Bold (Ctrl+B)" onClick={formatBold} active={formatState.bold} />
              <ToolbarButton icon={Italic} title="Italic (Ctrl+I)" onClick={formatItalic} active={formatState.italic} />
              <ToolbarButton icon={Underline} title="Underline (Ctrl+U)" onClick={formatUnderline} active={formatState.underline} />
              <ToolbarButton icon={Strikethrough} title="Strikethrough (Ctrl+Shift+X)" onClick={formatStrikethrough} active={formatState.strikeThrough} />
            </div>
            <div className="slack-toolbar-divider" />
            <div className="slack-toolbar-group">
              <ToolbarButton icon={Link} title="Insert link" onClick={handleLinkToggle} active={showLinkModal} />
            </div>
            <div className="slack-toolbar-divider" />
            <div className="slack-toolbar-group">
              <ToolbarButton icon={List} title="Bullet list" onClick={formatBulletList} active={formatState.insertUnorderedList} />
              <ToolbarButton icon={ListOrdered} title="Numbered list" onClick={formatNumberedList} active={formatState.insertOrderedList} />
            </div>
            <div className="slack-toolbar-divider" />
            <div className="slack-toolbar-group">
              <ToolbarButton icon={Quote} title="Quote" onClick={formatQuote} active={formatState.blockquote} />
              <ToolbarButton icon={Code} title="Inline code" onClick={formatInlineCode} />
              <ToolbarButton icon={Braces} title="Code block" onClick={formatCodeBlock} />
            </div>
          </div>
        )}

        {/* Link Modal */}
        {showLinkModal && (
          <div style={{ position: 'relative' }}>
            <LinkModal
              onInsert={handleLinkInsert}
              onClose={() => setShowLinkModal(false)}
            />
          </div>
        )}

        {/* Rich Text Editor (contentEditable) */}
        <div
          ref={editorRef}
          className="slack-rich-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder || 'Type a message...'}
          data-placeholder={placeholder || 'Type a message...'}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={checkFormatting}
          onMouseUp={checkFormatting}
          onFocus={() => { setIsFocused(true); checkFormatting(); }}
          onBlur={() => setIsFocused(false)}
          onPaste={handlePaste}
        />

        {/* Mention Dropdown */}
        {mentionType && (
          <MentionDropdown
            type={mentionType}
            query={mentionQuery}
            channelId={channelId}
            position={{ bottom: '100%', left: 0 }}
            onSelect={handleMentionSelect}
            onClose={() => setMentionType(null)}
          />
        )}

        {/* Attachment Previews */}
        {allPreviewFiles.length > 0 && (
          <div className="slack-attachment-previews">
            {allPreviewFiles.map((file) => {
              const isImg = file.mimeType?.startsWith('image/')
              const thumbSrc = file.preview || file.thumbnailUrl || file.secureUrl || file.url
              const name = file.name || file.originalName || 'File'
              const size = file.size || file.fileSize
              const key = file.localId || file._id || file.idx

              return (
                <div key={key} className="slack-file-preview">
                  {isImg && thumbSrc ? (
                    <div className="slack-file-preview-thumb">
                      <img src={thumbSrc} alt={name} loading="lazy" />
                    </div>
                  ) : (
                    <div className="slack-file-preview-icon">
                      <FileText size={18} />
                    </div>
                  )}
                  <div className="slack-file-preview-info">
                    <p className="slack-file-preview-name">{name}</p>
                    {size && <p className="slack-file-preview-size">{formatFileSize(size)}</p>}
                  </div>
                  {file.uploading && (
                    <div className="slack-file-preview-loading">
                      <div className="slack-spinner" />
                    </div>
                  )}
                  {!file.uploading && (
                    <button
                      onClick={() => file.isPending ? removePendingFile(file.idx) : removeUploadingFile(file.localId)}
                      className="slack-file-preview-remove"
                      aria-label="Remove file"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Bottom Action Bar */}
        <div className="slack-action-bar">
          {/* Left side — tools */}
          <div className="slack-action-bar-left">
            <ToolbarButton
              icon={Plus}
              title="Attach file"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              size={18}
            />
            <div className="slack-toolbar-divider" />
            <ToolbarButton
              icon={showToolbar ? ChevronDown : Bold}
              title={showToolbar ? 'Hide formatting' : 'Show formatting'}
              onClick={() => setShowToolbar(!showToolbar)}
              active={showToolbar}
              size={16}
            />
            <div className="relative">
              <ToolbarButton
                icon={Smile}
                title="Emoji"
                onClick={handleEmojiToggle}
                active={showEmoji}
                size={18}
              />
              {showEmoji && (
                <EmojiPicker
                  onSelect={insertEmoji}
                  onClose={() => setShowEmoji(false)}
                  position="top"
                />
              )}
            </div>
            <ToolbarButton
              icon={AtSign}
              title="Mention someone"
              onClick={() => {
                const editor = editorRef.current
                if (editor) {
                  editor.focus()
                  insertHtmlAtCaret('@')
                  handleInput()
                }
              }}
              size={18}
            />
          </div>

          {/* Right side — send */}
          <button
            onClick={handleSubmit}
            disabled={isDisabled}
            className="slack-send-btn"
            data-has-content={hasContent || pendingFiles.length > 0 || undefined}
            aria-label="Send message"
          >
            {isSending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.zip,.rar,.gz,.json,.xml"
      />

      <p className="slack-composer-hint">
        <strong>Enter</strong> to send · <strong>Shift+Enter</strong> for new line · <strong>Ctrl+B</strong> bold · <strong>Ctrl+I</strong> italic
      </p>
    </div>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
