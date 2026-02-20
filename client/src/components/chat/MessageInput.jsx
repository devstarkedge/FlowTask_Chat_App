import { useState, useRef, useCallback } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { messageAPI } from '../../services/api'
import { emitTypingStart, emitTypingStop } from '../../services/socket'
import { Send, Paperclip, Smile, Bold, Italic, Code, X, FileText, Image } from 'lucide-react'
import toast from 'react-hot-toast'

export default function MessageInput({ channelId, threadId, placeholder }) {
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const { sendMessage } = useChatStore()
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  const handleTyping = useCallback(() => {
    emitTypingStart(channelId)

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

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
      await sendMessage(channelId, trimmed || ' ', { threadId, attachments: attachments.length > 0 ? attachments : undefined })
      setContent('')
      setPendingFiles([])
      emitTypingStop(channelId)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    } catch (error) {
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

  return (
    <div className="px-4 pb-4">
      <div className="rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--border-primary)', background: 'var(--bg-input)' }}>

        {/* Pending Files Preview */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
            {pendingFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                {file.mimeType?.startsWith('image/') ? <Image size={12} /> : <FileText size={12} />}
                <span className="max-w-24 truncate">{file.originalName}</span>
                <button onClick={() => removePendingFile(index)} className="p-0.5 rounded cursor-pointer hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }}>
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Formatting Toolbar */}
        <div className="flex items-center gap-0.5 px-3 py-1.5"
          style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          <ToolbarButton icon={Bold} title="Bold" onClick={() => wrapSelection('**')} />
          <ToolbarButton icon={Italic} title="Italic" onClick={() => wrapSelection('_')} />
          <ToolbarButton icon={Code} title="Code" onClick={() => wrapSelection('`')} />
          <div className="flex-1" />
          <ToolbarButton icon={Paperclip} title="Attach file" onClick={() => fileInputRef.current?.click()} disabled={isUploading} />
        </div>

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.zip,.rar,.gz,.json,.xml" />

        {/* Input Area */}
        <div className="flex items-end gap-2 px-3 py-2">
          <textarea
            ref={inputRef}
            value={content}
            onChange={(e) => { setContent(e.target.value); handleTyping() }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || `Message #${channelId?.slice(-6) || 'channel'}...`}
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
            className="p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer disabled:opacity-30"
            style={{
              background: (content.trim() || pendingFiles.length > 0) ? 'var(--accent-green)' : 'transparent',
              color: (content.trim() || pendingFiles.length > 0) ? 'white' : 'var(--text-muted)',
            }}>
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

function ToolbarButton({ icon: Icon, title, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1 rounded hover:opacity-80 cursor-pointer disabled:opacity-30"
      style={{ color: 'var(--text-muted)' }}>
      <Icon size={14} />
    </button>
  )
}
