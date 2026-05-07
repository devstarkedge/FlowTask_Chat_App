
import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useChannelStore } from '../../stores/channelStore'
import { useDraftStore } from '../../stores/draftStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { messageAPI } from '../../services/api'
import { emitTypingStart, emitTypingStop } from '../../services/socket'
import useDraftAutoSave from '../../hooks/useDraftAutoSave'
import {
  Send, Paperclip, Smile, Bold, Italic, Underline, Strikethrough,
  Code, Braces, List, ListOrdered, Quote, Link, X, FileText,
  Loader2, Plus, AtSign, ChevronDown, Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import EmojiPicker from './EmojiPicker'
import MentionDropdown from './MentionDropdown'
import RichTextEditor from './RichTextEditor'
import ScheduleMessageModal from './ScheduleMessageModal'

// ─── Toolbar Button ──────────────────────────────────────────────────────────

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
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
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
    bold: false, italic: false, underline: false, strike: false,
    bulletList: false, orderedList: false, blockquote: false, code: false, codeBlock: false,
  })

  // Mention state
  const [mentionType, setMentionType] = useState(null) // 'user' | 'channel' | null
  const [mentionQuery, setMentionQuery] = useState('')

  const [showScheduleModal, setShowScheduleModal] = useState(false)

  const { sendMessage } = useChatStore()
  const { clearDraft } = useDraftStore()

  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const containerRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  // Ref mirror of pendingFiles so useDraftAutoSave always reads the latest value
  // without needing pendingFiles in its dependency array
  const pendingFilesRef = useRef(pendingFiles)
  useEffect(() => { pendingFilesRef.current = pendingFiles }, [pendingFiles])

  // ─── Draft Auto Save Hook ─────────────────────────────────────────
  const { saveDraftDebounced, restoreDraft, saveDraftLocal } = useDraftAutoSave(channelId, threadId, editorRef, pendingFilesRef)

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

    // Restore any saved attachment drafts from localStorage
    if (!cancelled) {
      try {
        const { getDraft } = useDraftStore.getState()
        const savedDraft = getDraft(channelId, activeWorkspaceId, threadId || null)
        if (savedDraft?.attachments?.length > 0) {
          // Map stored attachment metadata back to the pendingFiles shape.
          // Files are already uploaded (have a url), so we restore them as
          // completed upload references.
          const restoredFiles = savedDraft.attachments
            .filter((a) => a.fileId && a.url)
            .map((a) => ({
              _id: a.fileId,
              fileName: a.fileName || '',
              mimeType: a.mimeType || '',
              fileSize: a.fileSize || 0,
              url: a.url,
              thumbnailUrl: a.thumbnailUrl || null,
              // Mark as restored so UI knows the file is already uploaded
              restored: true,
            }))
          if (restoredFiles.length > 0) {
            setPendingFiles(restoredFiles)
          }
        }
      } catch { /* store not hydrated yet — skip */ }
    }

    if (!cancelled) {
      setHasContent(!!hasContent || pendingFilesRef.current.length > 0)
      requestAnimationFrame(() => editorRef.current?.focus())
    }
  }

  doRestore()

  return () => {
    cancelled = true
    if (rafId) cancelAnimationFrame(rafId)
  }
}, [channelId, activeWorkspaceId, restoreDraft, threadId])
  // ─── Typing ──────────────────────────────────────────────────────────────

  const handleTyping = useCallback(() => {
    emitTypingStart(channelId)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStop(channelId)
    }, 3000)
  }, [channelId])

  // ─── Mention Detection ────────────────────────────────────────────────────

  const detectMention = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return

    const textBefore = ed.getTextBeforeCursor()
    if (!textBefore) {
      setMentionType(null)
      return
    }

    // Look backwards for @ or # trigger
    const match = textBefore.match(/([@#])([^\s@#]*)$/)
    if (match) {
      const triggerChar = match[1]
      const query = match[2]
      setMentionType(triggerChar === '@' ? 'user' : 'channel')
      setMentionQuery(query)
    } else {
      setMentionType(null)
    }
  }, [])

  // ─── Mention Selection ────────────────────────────────────────────────────

  const handleMentionSelect = useCallback((item) => {
    const ed = editorRef.current
    if (!ed) return

    const tiptap = ed.getEditor()
    if (!tiptap) return

    // Delete the trigger character + query text
    const textBefore = ed.getTextBeforeCursor()
    const match = textBefore.match(/([@#])([^\s@#]*)$/)
    if (match) {
      const deleteCount = match[0].length
      const { from } = tiptap.state.selection
      tiptap
        .chain()
        .focus()
        .deleteRange({ from: from - deleteCount, to: from })
        .run()
    }

    // Insert mention node
    ed.insertMention(item.id, item.name, mentionType === 'user' ? 'user' : 'channel')
    setMentionType(null)
    setMentionQuery('')
  }, [mentionType])

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
    // If mention dropdown is open, let it handle navigation keys
    if (mentionType) {
      if (['ArrowUp', 'ArrowDown', 'Tab', 'Enter'].includes(event.key)) {
        // MentionDropdown captures these via document listener
        return false // let it propagate
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionType(null)
        return true
      }
    }

    // Escape to close popups
    if (event.key === 'Escape') {
      if (showEmoji) { setShowEmoji(false); return true }
      if (showLinkModal) { setShowLinkModal(false); return true }
    }

    return false
  }, [mentionType, showEmoji, showLinkModal])

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
    editorRef.current?.insertEmoji(emoji)
    setShowEmoji(false)
  }, [])

  const handleEmojiToggle = useCallback(() => {
    setShowEmoji((prev) => !prev)
    setShowLinkModal(false)
  }, [])

  const handleLinkToggle = useCallback(() => {
    setShowLinkModal((prev) => !prev)
    setShowEmoji(false)
  }, [])

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
          <div className="slack-input-previews">
            {allPreviewFiles.map((file) => {
              const isImg = file.mimeType?.startsWith('image/')
              const thumbSrc = file.preview || file.thumbnailUrl || file.secureUrl || file.url
              const name = file.name || file.originalName || 'File'
              const key = file.localId || file._id || file.idx

              return (
                <div key={key} className="slack-input-preview">
                  {isImg && thumbSrc ? (
                    <div className="slack-input-preview-thumb">
                      <img src={thumbSrc} alt={name} loading="lazy" />
                    </div>
                  ) : (
                    <div className="slack-input-preview-icon">
                      <FileText size={24} />
                    </div>
                  )}
                  {file.uploading && (
                    <div className="slack-input-preview-loading">
                      <div className="slack-upload-progress">
                        <div
                          className="slack-upload-progress-bar"
                          style={{ width: `${file.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {!file.uploading && (
                    <button
                      onClick={() => file.isPending ? removePendingFile(file.idx) : removeUploadingFile(file.localId)}
                      className="slack-input-preview-remove"
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
                editorRef.current?.insertText('@')
                detectMention()
              }}
              size={18}
            />
          </div>

          {/* Right side — schedule + send */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowScheduleModal(true)}
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
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/x-msvideo,video/webm,video/mpeg,audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/aac,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,text/markdown,text/html,text/css,text/javascript,text/typescript,text/x-python,text/x-java-source,text/x-c,text/x-scss,text/x-sql,text/yaml,text/x-env,application/json,application/xml,application/zip,application/x-rar-compressed,application/x-7z-compressed,application/gzip,application/x-tar"
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
