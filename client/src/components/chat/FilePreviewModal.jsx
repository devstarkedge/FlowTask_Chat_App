import { useState, useEffect, useRef } from 'react'
import { X, Download, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, FileText, Film, Music, File } from 'lucide-react'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4']

export default function FilePreviewModal({ file, files = [], onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const containerRef = useRef(null)

  useEffect(() => {
    if (file && files.length > 0) {
      const idx = files.findIndex((f) => (f.url || f.fileId) === (file.url || file.fileId))
      if (idx >= 0) setCurrentIndex(idx)
    }
  }, [file, files])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.25, 3))
      if (e.key === '-') setZoom((z) => Math.max(z - 0.25, 0.5))
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, files])

  const currentFile = files[currentIndex] || file
  if (!currentFile) return null

  const mime = currentFile.mimeType || ''
  const isImage = IMAGE_TYPES.some((t) => mime.startsWith(t.split('/')[0]) || mime === t)
  const isVideo = VIDEO_TYPES.some((t) => mime.startsWith(t.split('/')[0]) || mime === t)
  const isAudio = AUDIO_TYPES.some((t) => mime.startsWith(t.split('/')[0]) || mime === t)

  const prev = () => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : files.length - 1))
    setZoom(1)
    setRotation(0)
  }

  const next = () => {
    setCurrentIndex((i) => (i < files.length - 1 ? i + 1 : 0))
    setZoom(1)
    setRotation(0)
  }

  const downloadUrl = currentFile.url || '#'

  return (
    <div className="file-preview-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* Top Bar */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileTypeIcon mimeType={mime} />
          <div>
            <p style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>
              {currentFile.originalName || currentFile.fileName || 'File'}
            </p>
            {currentFile.fileSize && (
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                {formatFileSize(currentFile.fileSize)}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isImage && (
            <>
              <ToolbarBtn icon={ZoomOut} onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))} />
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, minWidth: 40, textAlign: 'center' }}>
                {Math.round(zoom * 100)}%
              </span>
              <ToolbarBtn icon={ZoomIn} onClick={() => setZoom((z) => Math.min(z + 0.25, 3))} />
              <ToolbarBtn icon={RotateCw} onClick={() => setRotation((r) => r + 90)} />
              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
            </>
          )}
          <a href={downloadUrl} download target="_blank" rel="noopener noreferrer">
            <ToolbarBtn icon={Download} />
          </a>
          <ToolbarBtn icon={X} onClick={onClose} />
        </div>
      </div>

      {/* Navigation Arrows */}
      {files.length > 1 && (
        <>
          <button
            onClick={prev}
            style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(0,0,0,0.5)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white', zIndex: 10,
              transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.8)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={next}
            style={{
              position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(0,0,0,0.5)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white', zIndex: 10,
              transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.8)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Content */}
      <div
        ref={containerRef}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%', padding: 60,
        }}
      >
        {isImage && (
          <img
            src={currentFile.url}
            alt={currentFile.originalName || 'Preview'}
            style={{
              maxWidth: '100%', maxHeight: '100%',
              objectFit: 'contain',
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s ease',
              borderRadius: 4,
            }}
            draggable={false}
          />
        )}

        {isVideo && (
          <video
            src={currentFile.url}
            controls
            autoPlay
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }}
          />
        )}

        {isAudio && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            padding: 40, background: 'rgba(0,0,0,0.3)', borderRadius: 16,
          }}>
            <Music size={48} style={{ color: 'var(--accent-primary)' }} />
            <p style={{ color: 'white', fontWeight: 600 }}>
              {currentFile.originalName || 'Audio File'}
            </p>
            <audio src={currentFile.url} controls autoPlay style={{ width: 320 }} />
          </div>
        )}

        {!isImage && !isVideo && !isAudio && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            padding: 40, background: 'rgba(0,0,0,0.3)', borderRadius: 16,
          }}>
            <File size={48} style={{ color: 'var(--text-muted)' }} />
            <p style={{ color: 'white', fontWeight: 600 }}>
              {currentFile.originalName || 'File'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              Preview not available for this file type
            </p>
            <a
              href={downloadUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ marginTop: 8 }}
            >
              <Download size={14} /> Download
            </a>
          </div>
        )}
      </div>

      {/* Counter */}
      {files.length > 1 && (
        <div
          style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            padding: '4px 12px', background: 'rgba(0,0,0,0.6)', borderRadius: 'var(--radius-full)',
            color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500,
          }}
        >
          {currentIndex + 1} / {files.length}
        </div>
      )}
    </div>
  )
}

function ToolbarBtn({ icon: Icon, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 32, height: 32, borderRadius: 'var(--radius-md)',
        background: 'rgba(255,255,255,0.1)', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'white',
        transition: 'background var(--transition-fast)',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
    >
      <Icon size={16} />
    </button>
  )
}

function FileTypeIcon({ mimeType }) {
  const isImg = mimeType?.startsWith('image/')
  const isVid = mimeType?.startsWith('video/')
  const isAud = mimeType?.startsWith('audio/')
  const Icon = isImg ? File : isVid ? Film : isAud ? Music : FileText

  return (
    <div style={{
      width: 32, height: 32, borderRadius: 'var(--radius-md)',
      background: 'rgba(255,255,255,0.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={16} style={{ color: 'white' }} />
    </div>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
