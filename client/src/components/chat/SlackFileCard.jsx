import React from 'react'
import { Download, FileText, Image as ImageIcon, Film, Music, FileArchive, FileCode, File } from 'lucide-react'

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileKind(mime = '', name = '') {
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('video/')) return 'video'
  if (mime?.startsWith('audio/')) return 'audio'
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (/^(zip|rar|7z|tar|gz)$/.test(ext)) return 'archive'
  if (/^(js|ts|py|java|c|cpp|json|xml|html|css)$/.test(ext)) return 'code'
  if (/^(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md)$/.test(ext)) return 'doc'
  return 'file'
}

function KindIcon({ kind, size = 18 }) {
  if (kind === 'image') return <ImageIcon size={size} style={{ color: 'var(--accent-primary)' }} />
  if (kind === 'video') return <Film size={size} style={{ color: 'var(--accent-purple)' }} />
  if (kind === 'audio') return <Music size={size} style={{ color: 'var(--accent-green)' }} />
  if (kind === 'archive') return <FileArchive size={size} style={{ color: '#ea580c' }} />
  if (kind === 'code') return <FileCode size={size} style={{ color: '#059669' }} />
  if (kind === 'doc') return <FileText size={size} style={{ color: 'var(--accent-primary)' }} />
  return <File size={size} style={{ color: 'var(--text-muted)' }} />
}

export default function SlackFileCard({ file, onOpen, onDownload, compact = false, isSingle = false }) {
  if (!file) return null

  const name = file.originalName || file.fileName || file.name || 'File'
  const size = file.fileSize || file.size || file.fileSizeBytes
  const mime = file.mimeType || file.type || ''
  const thumb = file.thumbnailUrl || file.secureUrl || file.url || file.preview || null
  const kind = getFileKind(mime, name)

  if (kind === 'image' && thumb) {
    return (
      <div 
        className="slack-image-attachment group"
        onClick={() => onOpen?.(file)}
        style={{ 
           position: 'relative',
           cursor: 'pointer', 
           borderRadius: 'var(--radius-lg)', 
           overflow: 'hidden', 
           border: '1px solid var(--border-secondary)',
           maxWidth: isSingle ? '360px' : '240px',
           minWidth: '100px',
           minHeight: '80px',
           display: 'inline-block',
           backgroundColor: 'var(--bg-secondary)',
           lineHeight: 0
        }}
      >
        <img 
          src={thumb} 
          alt={name} 
          style={{ maxWidth: '100%', height: 'auto', maxHeight: '350px', objectFit: 'contain', display: 'block' }} 
          loading="lazy" 
        />
        {/* Hover overlay with download button */}
        <div className="slack-image-attachment-overlay">
          <button
            className="slack-file-download"
            onClick={(e) => { e.stopPropagation(); onDownload?.(file) }}
            aria-label="Download"
            title="Download"
          >
            <Download size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="slack-file-preview"
      onClick={() => onOpen?.(file)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(file) }}
      style={{ cursor: 'pointer' }}
    >
      <div className="slack-file-preview-icon">
        <KindIcon kind={kind} />
      </div>

      <div className="slack-file-preview-info">
        <p className="slack-file-preview-name" title={name}>{name}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          {size && <span className="slack-file-preview-size">{formatFileSize(size)}</span>}
          {file.uploadedBy?.name && (
            <span className="slack-file-preview-meta" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {file.uploadedBy?.name}
            </span>
          )}
          {file.uploadedAt && (
            <span className="slack-file-preview-meta" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {new Date(file.uploadedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <button
        className="slack-file-download"
        onClick={(e) => { e.stopPropagation(); onDownload?.(file) }}
        aria-label="Download"
        data-tooltip="Download"
        tabIndex={0}
      >
        <Download size={14} />
        <span className="slack-download-tooltip">Download</span>
      </button>
    </div>
  )
}
