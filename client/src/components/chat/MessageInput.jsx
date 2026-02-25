import { useState, useRef, useCallback } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { messageAPI } from '../../services/api'
import { emitTypingStart, emitTypingStop } from '../../services/socket'
import { Send, Paperclip, Smile, Bold, Italic, Code, X, FileText, Image } from 'lucide-react'
import toast from 'react-hot-toast'
import EmojiPicker from './EmojiPicker'

export default function MessageInput({ channelId, threadId, placeholder }) {
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const { sendMessage } = useChatStore()
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  const handleTyping = useCallback(() => {
    emitTypingStart(channelId)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStop(channelId)
    }, 3000)
  }, [channelId])

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    if (pendingFiles.length + files.length > 10) {
      toast.error('Maximum 10 files per message')
      return
    }
    setIsUploading(true)
    try {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      const { data } = await messageAPI.uploadFiles(channelId, formData)
      setPendingFiles((prev) => [...prev, ...data.data.files])
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Upload failed')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePendingFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const trimmed = content.trim()
    if (!trimmed && pendingFiles.length === 0) return
    if (isSending) return

    setIsSending(true)
    try {
      const attachments = pendingFiles.map((f) => ({
        fileName: f.fileName,
        originalName: f.originalName,
        mimeType: f.mimeType,
        fileSize: f.fileSize,
        url: f.url,
        thumbnailUrl: f.thumbnailUrl,
        source: f.source || 'chat_upload',
      }))
      await sendMessage(channelId, trimmed || ' ', {
        threadId,
        attachments: attachments.length > 0 ? attachments : undefined,
      })
      setContent('')
      setPendingFiles([])
      emitTypingStop(channelId)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    } catch {
      // Error handled in store
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const wrapSelection = (wrapper) => {
    const textarea = inputRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = content
    const selected = text.substring(start, end)
    if (selected) {
      const newText = text.substring(0, start) + wrapper + selected + wrapper + text.substring(end)
      setContent(newText)
      requestAnimationFrame(() => {
        textarea.selectionStart = start + wrapper.length
        textarea.selectionEnd = end + wrapper.length
        textarea.focus()
      })
    } else {
      const newText = text.substring(0, start) + wrapper + wrapper + text.substring(end)
      setContent(newText)
      requestAnimationFrame(() => {
        textarea.selectionStart = start + wrapper.length
        textarea.selectionEnd = start + wrapper.length
        textarea.focus()
      })
    }
  }

  const insertEmoji = (emoji) => {
    const textarea = inputRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const newText = content.substring(0, start) + emoji + content.substring(textarea.selectionEnd)
      setContent(newText)
      setShowEmoji(false)
      requestAnimationFrame(() => {
        textarea.selectionStart = start + emoji.length
        textarea.selectionEnd = start + emoji.length
        textarea.focus()
      })
    } else {
      setContent((prev) => prev + emoji)
      setShowEmoji(false)
    }
  }

  return (
    <div className="px-4 pb-4">
      <div
        className="rounded-lg overflow-visible"
        style={{
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-input)',
          position: 'relative',
          transition: 'border-color var(--transition-fast)',
        }}
      >
        {/* Pending Files Preview */}
        {pendingFiles.length > 0 && (
          <div
            className="flex flex-wrap gap-2 px-3 py-2"
            style={{ borderBottom: '1px solid var(--border-secondary)' }}
          >
            {pendingFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs animate-fade-in"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
              >
                {file.mimeType?.startsWith('image/') ? (
                  <Image size={12} />
                ) : (
                  <FileText size={12} />
                )}
                <span className="max-w-28 truncate">{file.originalName}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                  {formatFileSize(file.fileSize)}
                </span>
                <button
                  onClick={() => removePendingFile(index)}
                  className="p-0.5 rounded cursor-pointer transition-colors"
                  style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-red)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload progress */}
        {isUploading && (
          <div
            className="px-3 py-2 flex items-center gap-2"
            style={{ borderBottom: '1px solid var(--border-secondary)' }}
          >
            <div
              className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Uploading files...</span>
          </div>
        )}

        {/* Formatting Toolbar */}
        <div
          className="flex items-center gap-0.5 px-3 py-1.5"
          style={{ borderBottom: '1px solid var(--border-secondary)' }}
        >
          <ToolbarButton icon={Bold} title="Bold (Ctrl+B)" onClick={() => wrapSelection('**')} />
          <ToolbarButton icon={Italic} title="Italic (Ctrl+I)" onClick={() => wrapSelection('_')} />
          <ToolbarButton icon={Code} title="Code" onClick={() => wrapSelection('`')} />
          <div className="flex-1" />
          <div className="relative">
            <ToolbarButton
              icon={Smile}
              title="Emoji"
              onClick={() => setShowEmoji(!showEmoji)}
              active={showEmoji}
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
            icon={Paperclip}
            title="Attach file"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          />
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

        {/* Input Area */}
        <div className="flex items-end gap-2 px-3 py-2">
          <textarea
            ref={inputRef}
            value={content}
            onChange={(e) => { setContent(e.target.value); handleTyping() }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || 'Type a message...'}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-sm"
            style={{ color: 'var(--text-primary)', maxHeight: '120px', minHeight: '24px' }}
            onInput={(e) => {
              e.target.style.height = '24px'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={(!content.trim() && pendingFiles.length === 0) || isSending}
            className="p-1.5 rounded-lg transition-all shrink-0 cursor-pointer"
            style={{
              background: (content.trim() || pendingFiles.length > 0)
                ? 'var(--accent-green)' : 'transparent',
              color: (content.trim() || pendingFiles.length > 0)
                ? 'white' : 'var(--text-muted)',
              opacity: (!content.trim() && pendingFiles.length === 0) ? 0.3 : 1,
              border: 'none',
            }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      <p className="text-[11px] mt-1 px-1" style={{ color: 'var(--text-muted)' }}>
        <strong>Enter</strong> to send · <strong>Shift+Enter</strong> for new line · Type <strong>/flowtask help</strong> for commands
      </p>
    </div>
  )
}

function ToolbarButton({ icon: Icon, title, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1.5 rounded-md cursor-pointer transition-colors"
      style={{
        color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
        background: active ? 'var(--bg-hover)' : 'transparent',
        border: 'none',
        opacity: disabled ? 0.3 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={14} />
    </button>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
