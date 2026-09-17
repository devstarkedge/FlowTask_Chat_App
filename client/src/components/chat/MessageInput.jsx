import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useDraftStore } from '../../stores/draftStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { messageAPI } from '../../services/api'
import { emitTypingStart, emitTypingStop } from '../../services/socket'
import useDraftAutoSave from '../../hooks/useDraftAutoSave'
import useMentions from '../../hooks/useMentions'
import {
  Send, Paperclip, Smile, Bold, Italic, Underline, Strikethrough,
  Code, Braces, List, ListOrdered, Quote, Link, X, FileText,
  Loader2, Plus, AtSign, ChevronDown, Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import EmojiPickerPortal from './EmojiPickerPortal'
import MentionDropdown from './MentionDropdown'
import RichTextEditor from './RichTextEditor'
import ScheduleMessageModal from './ScheduleMessageModal'
import GifPickerModal from './GifPickerModal'

// ─── Toolbar Button ──────────────────────────────────────────────────────────

const ToolbarButton = memo(function ToolbarButton({ icon: Icon, title, onClick, disabled, active, size = 15, popup }) {
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
      aria-haspopup={popup}
      aria-expanded={popup ? !!active : undefined}
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
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploadingFiles, setUploadingFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showGifModal, setShowGifModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [showToolbar, setShowToolbar] = useState(true)
  const [hasContent, setHasContent] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [formatState, setFormatState] = useState({
    bold: false, italic: false, underline: false, strike: false,
    bulletList: false, orderedList: false, blockquote: false, code: false, codeBlock: false,
  })

  const [showScheduleModal, setShowScheduleModal] = useState(false)

  const { sendMessage } = useChatStore()
  const { clearDraft } = useDraftStore()

  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const containerRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const gifAnchorRef = useRef(null)
  const emojiAnchorRef = useRef(null)
  const emojiSelectionRef = useRef(null)

  const {
    mentionType,
    mentionPos,
    activeIndex,
    items: mentionItems,
    detectMention,
    selectMention,
    closeMentions,
    setActiveIndex,
    handleMentionKeyDown,
  } = useMentions({ channelId, editorRef })

  // ─── Draft Auto Save Hook ─────────────────────────────────────────
  const { saveDraftDebounced, restoreDraft, saveDraftLocal } = useDraftAutoSave(channelId, threadId, editorRef)

  // ─── Format State Sync ───────────────────────────────────────────────────

  const syncFormatState = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    setFormatState({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike: ed.isActive('strike'),
      bulletList: ed.isActive('bulletList'),
      orderedList: ed.isActive('orderedList'),
      blockquote: ed.isActive('blockquote'),
      code: ed.isActive('code'),
      codeBlock: ed.isActive('codeBlock'),
    })
  }, [])

  // ─── Draft Restore on channel change ──────────────────────────────────────

 useEffect(() => {
  let cancelled = false
  let rafId = null

  const doRestore = async () => {
    if (!editorRef.current?.getEditor?.()) {
      if (!cancelled) rafId = requestAnimationFrame(doRestore)
      return
    }

    if (cancelled) return

    //  ADD DELAY HERE
    await new Promise((res) => setTimeout(res, 100))

    const hasContent = await restoreDraft()

    if (!cancelled) {
      setHasContent(!!hasContent)
      requestAnimationFrame(() => editorRef.current?.focus())
    }
  }

  doRestore()

  return () => {
    cancelled = true
    if (rafId) cancelAnimationFrame(rafId)
  }
}, [channelId, activeWorkspaceId, restoreDraft])
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
      const { data } = await messageAPI.uploadFiles(channelId, formData, (progressEvent) => {
        const percent = progressEvent.total
          ? Math.round((progressEvent.loaded / progressEvent.total) * 100)
          : 0
        setUploadingFiles((prev) =>
          prev.map((f) =>
            localPreviews.some((lp) => lp.localId === f.localId)
              ? { ...f, progress: percent }
              : f
          )
        )
      })

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

  const handleSubmit = useCallback(async () => {
    const ed = editorRef.current
    if (!ed) return

    const { html, text, mentions } = ed.getContent()
    if (!text.trim() && pendingFiles.length === 0) return
    if (isUploading) return

    const submitChannelId = channelId
    const submitThreadId = threadId
    const submitHtml = html || undefined
    const submitText = text.trim() || ' '
    const submitMentions = mentions || []
    const submitFileReferences = pendingFiles.map((f) => f._id)

    // Optimistic UX: clear composer immediately so next message can be sent right away.
    ed.clear()
    setHasContent(false)
    setPendingFiles([])
    clearDraft(submitChannelId, activeWorkspaceId, submitThreadId)

    emitTypingStop(submitChannelId)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    requestAnimationFrame(() => editorRef.current?.focus())

    try {
      await sendMessage(submitChannelId, submitText, {
        threadId: submitThreadId,
        htmlContent: submitHtml,
        fileReferences: submitFileReferences.length > 0 ? submitFileReferences : undefined,
        mentions: submitMentions.length > 0 ? submitMentions : undefined,
      })
    } catch {
      // Error handled in store
    }
  }, [channelId, threadId, pendingFiles, isUploading, sendMessage, clearDraft, activeWorkspaceId])

  // ─── Paste Handler (images) ───────────────────────────────────────────────

  const handlePaste = useCallback((e) => {
    const clipboardData = e.clipboardData
    if (!clipboardData) return

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
    }
    // Text paste is handled natively by TipTap (plain text)
  }, [pendingFiles.length, uploadingFiles.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Attach paste listener to the editor DOM once it's mounted
  useEffect(() => {
    // Small delay to ensure TipTap editor view is mounted
    const timer = setTimeout(() => {
      try {
        const ed = editorRef.current?.getEditor?.()
        const dom = ed?.view?.dom
        if (dom) {
          dom.addEventListener('paste', handlePaste)
          return // cleanup handled below
        }
      } catch {
        // Editor view not ready yet — safe to ignore
      }
    }, 50)
    return () => {
      clearTimeout(timer)
      try {
        const ed = editorRef.current?.getEditor?.()
        const dom = ed?.view?.dom
        if (dom) dom.removeEventListener('paste', handlePaste)
      } catch { /* noop */ }
    }
  }, [handlePaste, channelId])

  // ─── Editor Input Callback ───────────────────────────────────────────────

  const handleEditorInput = useCallback(({ text, isEmpty }) => {
    setHasContent(!isEmpty || pendingFiles.length > 0)
    handleTyping()
    saveDraftDebounced()
    detectMention()
    syncFormatState()
  }, [pendingFiles.length, handleTyping, saveDraftDebounced, detectMention, syncFormatState])

  // ─── Key Down for mention dropdown interception ───────────────────────────

  const handleKeyDown = useCallback((event) => {
    // Intercept mention selection before Enter reaches the send shortcut.
    if (mentionType) {
      if (handleMentionKeyDown(event)) return true
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMentions()
        return true
      }
    }

    // Escape to close popups
    if (event.key === 'Escape') {
      if (showEmoji) { setShowEmoji(false); return true }
      if (showLinkModal) { setShowLinkModal(false); return true }
      if (showGifModal) { setShowGifModal(false); return true }
    }

    return false
  }, [mentionType, handleMentionKeyDown, closeMentions, showEmoji, showLinkModal, showGifModal])

  // ─── Formatting Actions ───────────────────────────────────────────────────

  const formatBold = useCallback(() => { editorRef.current?.toggleBold(); syncFormatState() }, [syncFormatState])
  const formatItalic = useCallback(() => { editorRef.current?.toggleItalic(); syncFormatState() }, [syncFormatState])
  const formatUnderline = useCallback(() => { editorRef.current?.toggleUnderline(); syncFormatState() }, [syncFormatState])
  const formatStrikethrough = useCallback(() => { editorRef.current?.toggleStrike(); syncFormatState() }, [syncFormatState])
  const formatBulletList = useCallback(() => { editorRef.current?.toggleBulletList(); syncFormatState() }, [syncFormatState])
  const formatNumberedList = useCallback(() => { editorRef.current?.toggleOrderedList(); syncFormatState() }, [syncFormatState])
  const formatQuote = useCallback(() => { editorRef.current?.toggleBlockquote(); syncFormatState() }, [syncFormatState])
  const formatInlineCode = useCallback(() => { editorRef.current?.toggleCode(); syncFormatState() }, [syncFormatState])
  const formatCodeBlock = useCallback(() => { editorRef.current?.toggleCodeBlock(); syncFormatState() }, [syncFormatState])

  const handleLinkInsert = useCallback((url, text) => {
    editorRef.current?.insertLink(url, text)
  }, [])

  // ─── Emoji Insert ─────────────────────────────────────────────────────────

  const insertEmoji = useCallback((emoji) => {
    const editor = editorRef.current?.getEditor()
    if (editor) {
      editor.chain()
        .insertContentAt(emojiSelectionRef.current || editor.state.selection, emoji)
        .focus(undefined, { scrollIntoView: false })
        .run()
    }
    setShowEmoji(false)
  }, [])

  const handleEmojiToggle = useCallback(() => {
    const editor = editorRef.current?.getEditor()
    const selection = editor?.state.selection
    emojiSelectionRef.current = selection ? { from: selection.from, to: selection.to } : null
    if (showEmoji) editor?.commands.focus(undefined, { scrollIntoView: false })
    setShowEmoji((prev) => !prev)
    setShowLinkModal(false)
    setShowGifModal(false)
  }, [showEmoji])

  const handleEmojiClose = useCallback((reason) => {
    setShowEmoji(false)
    if (reason === 'escape') {
      editorRef.current?.getEditor()?.commands.focus(undefined, { scrollIntoView: false })
    }
  }, [])

  useEffect(() => {
    setShowEmoji(false)
    emojiSelectionRef.current = null
    closeMentions()
  }, [channelId, threadId, closeMentions])

  const handleLinkToggle = useCallback(() => {
    setShowLinkModal((prev) => !prev)
    setShowEmoji(false)
    setShowGifModal(false)
  }, [])

  const handleGifToggle = useCallback(() => {
    setShowGifModal((prev) => !prev)
    setShowEmoji(false)
    setShowLinkModal(false)
  }, [])

  const handleGifSelect = useCallback(async (gifData) => {
    setShowGifModal(false)
    try {
      await sendMessage(channelId, '', {
        threadId,
        contentType: 'gif',
        gifMeta: gifData,
      })
    } catch {
      // The store marks the failed message and displays the error.
    }
  }, [channelId, threadId, sendMessage])

  // ─── Auto focus ───────────────────────────────────────────────────────────

  useEffect(() => {
    requestAnimationFrame(() => editorRef.current?.focus())
  }, [channelId])

  // Update hasContent when files change
  useEffect(() => {
    const ed = editorRef.current
    const isEmpty = ed?.isEmpty() ?? true
    setHasContent(!isEmpty || pendingFiles.length > 0 || uploadingFiles.length > 0)
  }, [pendingFiles.length, uploadingFiles.length])

  // ─── Render ───────────────────────────────────────────────────────────────

  const isDisabled = (!hasContent && pendingFiles.length === 0) || isUploading
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
              <ToolbarButton icon={Strikethrough} title="Strikethrough (Ctrl+Shift+X)" onClick={formatStrikethrough} active={formatState.strike} />
            </div>
            <div className="slack-toolbar-divider" />
            <div className="slack-toolbar-group">
              <ToolbarButton icon={Link} title="Insert link" onClick={handleLinkToggle} active={showLinkModal} />
            </div>
            <div className="slack-toolbar-divider" />
            <div className="slack-toolbar-group">
              <ToolbarButton icon={List} title="Bullet list" onClick={formatBulletList} active={formatState.bulletList} />
              <ToolbarButton icon={ListOrdered} title="Numbered list" onClick={formatNumberedList} active={formatState.orderedList} />
            </div>
            <div className="slack-toolbar-divider" />
            <div className="slack-toolbar-group">
              <ToolbarButton icon={Quote} title="Quote" onClick={formatQuote} active={formatState.blockquote} />
              <ToolbarButton icon={Code} title="Inline code" onClick={formatInlineCode} active={formatState.code} />
              <ToolbarButton icon={Braces} title="Code block" onClick={formatCodeBlock} active={formatState.codeBlock} />
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

        {/* TipTap Rich Text Editor */}
        <RichTextEditor
          ref={editorRef}
          placeholder={placeholder || 'Type a message...'}
          onSubmit={handleSubmit}
          onInput={handleEditorInput}
          onFocus={() => { setIsFocused(true); syncFormatState() }}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
        />

        {/* Mention Dropdown */}
        {mentionType && (
          <MentionDropdown
            items={mentionItems}
            activeIndex={activeIndex}
            position={mentionPos}
            onSelect={selectMention}
            onClose={closeMentions}
            setActiveIndex={setActiveIndex}
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
                      <div className="slack-upload-progress">
                        <div
                          className="slack-upload-progress-bar"
                          style={{ width: `${file.progress || 0}%` }}
                        />
                      </div>
                      <span className="slack-upload-progress-text">{file.progress || 0}%</span>
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
              onClick={() => { setShowEmoji(false); fileInputRef.current?.click() }}
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
            <div className="relative" ref={emojiAnchorRef}>
              <ToolbarButton
                icon={Smile}
                title="Emoji"
                onClick={handleEmojiToggle}
                active={showEmoji}
                popup="dialog"
                size={18}
              />
              <EmojiPickerPortal
                anchorRef={emojiAnchorRef}
                isOpen={showEmoji}
                onSelect={insertEmoji}
                onClose={handleEmojiClose}
                position="top-start"
              />
            </div>

            <div className="relative" ref={gifAnchorRef}>
              <ToolbarButton
                icon={({ size }) => (
                  <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.6, fontWeight: 800 }}>
                    GIF
                  </div>
                )}
                title="GIF"
                onClick={handleGifToggle}
                active={showGifModal}
                size={18}
              />
              <GifPickerModal
                isOpen={showGifModal}
                onClose={() => setShowGifModal(false)}
                onSelectGif={handleGifSelect}
                anchorRef={gifAnchorRef}
              />
            </div>

            <ToolbarButton
              icon={AtSign}
              title="Mention someone"
              onClick={() => {
                setShowEmoji(false)
                editorRef.current?.insertText('@')
                detectMention()
              }}
              size={18}
            />
          </div>

          {/* Right side — schedule + send */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowEmoji(false); setShowScheduleModal(true) }}
              disabled={isDisabled}
              className="slack-schedule-btn"
              title="Schedule message"
              aria-label="Schedule message"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'transparent',
                color: (hasContent || pendingFiles.length > 0) ? 'var(--text-secondary)' : 'var(--text-muted)',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                transition: 'var(--transition-fast)',
                opacity: isDisabled ? 0.4 : 1,
              }}
              onMouseEnter={(e) => { if (!isDisabled) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <Clock size={15} />
            </button>
            <button
              onClick={handleSubmit}
              disabled={isDisabled}
              className="slack-send-btn"
              data-has-content={hasContent || pendingFiles.length > 0 || undefined}
              aria-label="Send message"
            >
              {isUploading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Schedule Message Modal */}
      {showScheduleModal && (
        <ScheduleMessageModal
          channelId={channelId}
          content={editorRef.current?.getContent()?.text || ''}
          htmlContent={editorRef.current?.getContent()?.html || ''}
          attachments={pendingFiles}
          mentions={editorRef.current?.getContent()?.mentions || []}
          threadId={threadId}
          onClose={() => setShowScheduleModal(false)}
          onScheduled={() => {
            editorRef.current?.clear()
            setHasContent(false)
            setPendingFiles([])
            clearDraft(channelId, activeWorkspaceId, threadId)
          }}
        />
      )}

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
