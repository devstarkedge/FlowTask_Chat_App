import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, Image as ImageIcon, Trash2, Video, File as FileIcon, Search, Share2, Calendar, UserRound } from 'lucide-react'
import { fileAPI } from '../../services/api'
import toast from 'react-hot-toast'

function formatSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let value = bytes
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function initials(name = '') {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || 'U'
}

function getFileKind(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}

function KindIcon({ kind }) {
  if (kind === 'image') return <ImageIcon size={18} style={{ color: 'var(--accent-primary)' }} />
  if (kind === 'video') return <Video size={18} style={{ color: 'var(--accent-purple)' }} />
  return <FileText size={18} style={{ color: 'var(--text-muted)' }} />
}

function ActionButton({ title, tone = 'neutral', onClick, children }) {
  const commonStyle = {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'transform 120ms ease, background 120ms ease, color 120ms ease',
  }

  const toneStyle = tone === 'danger'
    ? { color: '#FCA5A5', background: 'rgba(239, 68, 68, 0.14)' }
    : { color: '#E5E7EB', background: 'rgba(255, 255, 255, 0.08)' }

  const hoverEnter = (event) => {
    event.currentTarget.style.transform = 'translateY(-1px)'
    event.currentTarget.style.background = tone === 'danger'
      ? 'rgba(239, 68, 68, 0.22)'
      : 'rgba(255, 255, 255, 0.18)'
  }

  const hoverLeave = (event) => {
    event.currentTarget.style.transform = 'translateY(0)'
    event.currentTarget.style.background = toneStyle.background
  }

  return (
    <button
      onClick={onClick}
      title={title}
      style={{ ...commonStyle, ...toneStyle }}
      onMouseEnter={hoverEnter}
      onMouseLeave={hoverLeave}
    >
      {children}
    </button>
  )
}

export default function FilesTab({ channelId, onOpenFilePreview }) {
  const [files, setFiles] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [query, setQuery] = useState('')

  const loadFiles = async () => {
    if (!channelId) return
    setIsLoading(true)
    try {
      const { data } = await fileAPI.listByChannel(channelId, { limit: 100 })
      setFiles(data.data.items || [])
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to load files')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [channelId])

  const filteredFiles = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return files
    return files.filter((f) => {
      const name = (f.fileName || '').toLowerCase()
      const uploader = (f.uploadedBy?.name || '').toLowerCase()
      return name.includes(value) || uploader.includes(value)
    })
  }, [files, query])

  const byType = useMemo(() => {
    const images = filteredFiles.filter((f) => getFileKind(f.mimeType) === 'image').length
    const videos = filteredFiles.filter((f) => getFileKind(f.mimeType) === 'video').length
    const docs = filteredFiles.length - images - videos
    return { images, videos, docs }
  }, [filteredFiles])

  const mediaFiles = useMemo(
    () => filteredFiles.filter((f) => {
      const kind = getFileKind(f.mimeType)
      return kind === 'image' || kind === 'video'
    }),
    [filteredFiles],
  )

  const documentFiles = useMemo(
    () => filteredFiles.filter((f) => getFileKind(f.mimeType) === 'file'),
    [filteredFiles],
  )

  const handleDelete = async (file) => {
    try {
      await fileAPI.deleteFromChannel(channelId, file._id)
      setFiles((prev) => prev.filter((f) => f.referenceId !== file.referenceId))
      toast.success('File deleted')
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete file')
    }
  }

  const handleShare = async (file) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(file.url)
        toast.success('File link copied')
        return
      }
      window.prompt('Copy file link:', file.url)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const forceDownload = (url, fileName) => {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.setAttribute('download', fileName || 'download')
    anchor.rel = 'noopener noreferrer'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  }

  const handleDownload = async (file) => {
    const fileName = file.fileName || file.originalName || 'download'
    try {
      const response = await fetch(file.url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      forceDownload(objectUrl, fileName)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      // Fallback: browser-managed download/navigation for strict CORS sources.
      forceDownload(file.url, fileName)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-6" style={{ background: 'var(--bg-primary)' }}>
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl mt-3"
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-primary)',
          boxShadow: '0 1px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Search size={16} style={{ color: 'var(--text-muted)' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files"
          className="flex-1 bg-transparent border-none outline-none text-sm"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>

      <div className="flex items-center gap-2 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span className="px-2 py-1 rounded-full" style={{ background: 'var(--bg-hover)' }}>{filteredFiles.length} files</span>
        <span className="px-2 py-1 rounded-full" style={{ background: 'var(--bg-hover)' }}>Images {byType.images}</span>
        <span className="px-2 py-1 rounded-full" style={{ background: 'var(--bg-hover)' }}>Videos {byType.videos}</span>
        <span className="px-2 py-1 rounded-full" style={{ background: 'var(--bg-hover)' }}>Docs {byType.docs}</span>
      </div>

      {isLoading ? (
        <div className="text-sm py-8" style={{ color: 'var(--text-muted)' }}>Loading files...</div>
      ) : filteredFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: 'var(--text-muted)' }}>
          <FileIcon size={32} style={{ opacity: 0.5 }} />
          <p className="text-sm">No files shared in this chat yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 pb-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)', letterSpacing: '0.2px' }}>Photos and videos</h3>
              {mediaFiles.length > 0 && (
                <button
                  className="text-xs px-2 py-1 rounded-md"
                  style={{ color: 'var(--accent-primary)', background: 'var(--bg-hover)', border: 'none' }}
                >
                  See all
                </button>
              )}
            </div>

            {mediaFiles.length === 0 ? (
              <div
                className="rounded-lg px-3 py-5 text-sm"
                style={{ border: '1px solid var(--border-secondary)', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
              >
                No photos or videos found.
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {mediaFiles.map((file) => {
                  const kind = getFileKind(file.mimeType)
                  const previewSrc = file.thumbnailUrl || file.url
                  return (
                    <div
                      key={file.referenceId}
                      className="group shrink-0 rounded-2xl overflow-hidden"
                      style={{
                        width: 214,
                        border: '1px solid var(--border-secondary)',
                        background: 'var(--bg-secondary)',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                      }}
                    >
                      <div className="relative">
                        <button
                          onClick={() => onOpenFilePreview?.(file, mediaFiles)}
                          className="w-full text-left cursor-pointer"
                          style={{ background: 'transparent', border: 'none', padding: 0 }}
                          title={file.fileName}
                        >
                          <div
                            style={{
                              height: 138,
                              background: 'var(--bg-input)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                            }}
                          >
                            {kind === 'image' && previewSrc ? (
                              <img
                                src={previewSrc}
                                alt={file.fileName}
                                loading="lazy"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                                <Video size={20} />
                                <span style={{ fontSize: 11 }}>Video</span>
                              </div>
                            )}
                          </div>
                        </button>

                        <div
                          className="absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-2xl px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-all"
                          style={{
                            background: 'rgba(17, 24, 39, 0.86)',
                            border: '1px solid rgba(148, 163, 184, 0.25)',
                            backdropFilter: 'blur(4px)',
                            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
                            transform: 'translateY(0px)',
                          }}
                        >
                          <ActionButton title="Share" onClick={() => handleShare(file)}>
                            <Share2 size={14} />
                          </ActionButton>
                          <ActionButton title="Download" onClick={() => handleDownload(file)}>
                            <Download size={14} />
                          </ActionButton>
                          <ActionButton title="Delete" tone="danger" onClick={() => handleDelete(file)}>
                            <Trash2 size={14} />
                          </ActionButton>
                        </div>
                      </div>

                      <div className="px-3 py-2.5">
                        <p
                          className="truncate"
                          style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}
                          title={file.fileName}
                        >
                          {file.fileName}
                        </p>
                        <div className="flex items-center gap-1 mt-1" style={{ color: 'var(--text-muted)' }}>
                          <Calendar size={12} />
                          <p className="truncate" style={{ fontSize: 11 }}>
                            {formatDate(file.uploadedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 mt-1" style={{ color: 'var(--text-muted)' }}>
                          <UserRound size={12} />
                          <p className="truncate" style={{ fontSize: 11 }}>
                            {file.uploadedBy?.name || 'Unknown'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)', letterSpacing: '0.2px' }}>Documents</h3>
            {documentFiles.length === 0 ? (
              <div
                className="rounded-lg px-3 py-5 text-sm"
                style={{ border: '1px solid var(--border-secondary)', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
              >
                No documents found.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {documentFiles.map((file) => {
                  const kind = getFileKind(file.mimeType)
                  return (
                    <div
                      key={file.referenceId}
                      className="group rounded-xl px-3 py-2.5"
                      style={{
                        border: '1px solid var(--border-secondary)',
                        background: 'var(--bg-secondary)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'var(--bg-hover)' }}
                        >
                          <KindIcon kind={kind} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            className="text-left text-sm font-semibold truncate w-full cursor-pointer"
                            style={{ color: 'var(--text-white)', background: 'transparent', border: 'none', padding: 0 }}
                            onClick={() => onOpenFilePreview?.(file, documentFiles)}
                            title={file.fileName}
                          >
                            {file.fileName}
                          </button>
                          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                            <span>{formatSize(file.fileSize)}</span>
                            <span> • Uploaded by {file.uploadedBy?.name || 'Unknown'}</span>
                            <span> • {formatDate(file.uploadedAt)}</span>
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-1.5 px-2 py-1 rounded-xl opacity-70 group-hover:opacity-100 transition-opacity"
                          style={{
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--border-secondary)',
                          }}
                        >
                          <ActionButton title="Share" onClick={() => handleShare(file)}>
                            <Share2 size={16} />
                          </ActionButton>
                          <ActionButton title="Download" onClick={() => handleDownload(file)}>
                            <Download size={16} />
                          </ActionButton>
                          <ActionButton title="Delete" tone="danger" onClick={() => handleDelete(file)}>
                            <Trash2 size={16} />
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
