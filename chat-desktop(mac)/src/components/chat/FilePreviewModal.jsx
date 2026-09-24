import { useLiveProfileData } from '../../hooks/useLiveProfileData';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Minus,
  RotateCw,
  Square,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { handleDownload } from '../../utils/handleDownload'
import FilePreviewRenderer, {
  FilePreviewKindIcon,
  getFileDisplayName,
  getFilePreviewInfo,
} from './FilePreviewRenderer'
import './FilePreviewModal.css'

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ToolbarBtn({ icon: Icon, onClick, title, className = '' }) {
  const handleClick = (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick?.(event)
  }

  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={handleClick}
      title={title}
      aria-label={title}
      className={`file-preview-toolbar-btn ${className}`}
      style={{
        color: 'var(--preview-icon-color, #ffffff)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={16} style={{ color: 'inherit' }} />
    </button>
  )
}

export default function FilePreviewModal({ file, files = [], onClose }) {
  file = useLiveProfileData(file);
  files = useLiveProfileData(files);
  const [currentIndex, setCurrentIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [copyableText, setCopyableText] = useState(null)
  const [canCopyText, setCanCopyText] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const containerRef = useRef(null)

  const isDesktop = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.electronAPI !== undefined || navigator.userAgent.toLowerCase().includes('electron');
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.isMaximized) {
      window.electronAPI.isMaximized().then((max) => setIsMaximized(Boolean(max)));
    }
    if (typeof window !== 'undefined' && window.electronAPI?.onMaximizedChange) {
      const unsub = window.electronAPI.onMaximizedChange((max) => {
        setIsMaximized(Boolean(max));
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, []);

  const handleMinimizeWindow = useCallback(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.minimize) {
      window.electronAPI.minimize();
    }
  }, []);

  const handleMaximizeWindow = useCallback(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.maximize) {
      window.electronAPI.maximize();
    }
  }, []);

  const handleCloseWindow = useCallback(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.close) {
      window.electronAPI.close();
    }
  }, []);

  const currentFile = files[currentIndex] || file
  const info = useMemo(() => getFilePreviewInfo(currentFile), [currentFile])
  const fileName = getFileDisplayName(currentFile)

  const resetView = useCallback(() => {
    setZoom(1)
    setRotation(0)
    setCopied(false)
  }, [])

  const prev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : files.length - 1))
    resetView()
  }, [files.length, resetView])

  const next = useCallback(() => {
    setCurrentIndex((i) => (i < files.length - 1 ? i + 1 : 0))
    resetView()
  }, [files.length, resetView])

  useEffect(() => {
    if (file && files.length > 0) {
      const idx = files.findIndex((f) => (f.url || f.fileId || f._id) === (file.url || file.fileId || file._id))
      if (idx >= 0) setCurrentIndex(idx)
    }
  }, [file, files])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (files.length > 1 && e.key === 'ArrowLeft') prev()
      if (files.length > 1 && e.key === 'ArrowRight') next()
      if (info.isImage && (e.key === '+' || e.key === '=')) setZoom((z) => Math.min(z + 0.25, 3))
      if (info.isImage && e.key === '-') setZoom((z) => Math.max(z - 0.25, 0.5))
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [files.length, info.isImage, next, onClose, prev])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const wheelListener = (ev) => {
      if (!info.isImage) return
      ev.preventDefault()
      if (ev.deltaY < 0) setZoom((z) => Math.min(z + 0.15, 3))
      else setZoom((z) => Math.max(z - 0.15, 0.5))
    }
    el.addEventListener('wheel', wheelListener, { passive: false })
    return () => el.removeEventListener('wheel', wheelListener)
  }, [info.isImage])

  const handleTextStateChange = useCallback(({ textContent, canCopyText: nextCanCopy }) => {
    setCopyableText(textContent)
    setCanCopyText(Boolean(nextCanCopy))
    if (!nextCanCopy) setCopied(false)
  }, [])

  const handleCopy = async () => {
    if (!copyableText) return
    try {
      await navigator.clipboard.writeText(copyableText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (!currentFile) return null

  const content = (
    <div className="file-preview-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`file-preview-topbar ${isDesktop ? 'is-desktop' : ''}`}
        style={{
          paddingRight: isDesktop ? (window.electronAPI?.hasNativeWindowControls ? '152px' : '20px') : '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1, paddingRight: 12 }}>
          <div className="file-preview-icon-bg" style={{ flexShrink: 0 }}>
            <FilePreviewKindIcon file={currentFile} size={16} style={{ color: 'var(--preview-icon-color)' }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="file-preview-topbar-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileName}
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              {currentFile.fileSize && (
                <span className="file-preview-topbar-meta">{formatFileSize(currentFile.fileSize)}</span>
              )}
              {currentFile.uploadedBy?.name && (
                <span className="file-preview-topbar-meta">Uploaded by {currentFile.uploadedBy.name}</span>
              )}
              {currentFile.uploadedAt && (
                <span className="file-preview-topbar-meta">{new Date(currentFile.uploadedAt).toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>

        <div className="file-preview-header-right">
          <div className="file-preview-toolbar">
            {info.isImage && (
              <>
                <ToolbarBtn title="Zoom out" icon={ZoomOut} onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))} />
                <span style={{ color: 'var(--preview-icon-color)', fontSize: 12, minWidth: 40, textAlign: 'center' }}>
                  {Math.round(zoom * 100)}%
                </span>
                <ToolbarBtn title="Zoom in" icon={ZoomIn} onClick={() => setZoom((z) => Math.min(z + 0.25, 3))} />
                <ToolbarBtn title="Rotate" icon={RotateCw} onClick={() => setRotation((r) => r + 90)} />
                <div className="file-preview-divider" />
              </>
            )}
            {canCopyText && copyableText && (
              <>
                <ToolbarBtn title="Copy text" icon={copied ? Check : Copy} onClick={handleCopy} />
                <div className="file-preview-divider" />
              </>
            )}
            <ToolbarBtn title="Download" icon={Download} onClick={() => handleDownload(currentFile)} />
            <ToolbarBtn title="Close Preview" icon={X} onClick={onClose} />
          </div>

          {/* isDesktop && !window.electronAPI?.hasNativeWindowControls && (
            <>
              <div className="file-preview-divider" />
              <div className="file-preview-window-controls">
                <ToolbarBtn title="Minimize" icon={Minus} onClick={handleMinimizeWindow} />
                <ToolbarBtn
                  title={isMaximized ? "Restore" : "Maximize"}
                  icon={isMaximized ? Copy : Square}
                  onClick={handleMaximizeWindow}
                />
                <ToolbarBtn
                  title="Close Window"
                  icon={X}
                  onClick={handleCloseWindow}
                  className="file-preview-win-close"
                />
              </div>
            </>
          )*/}
        </div>
      </div>

      {files.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="file-preview-nav-btn"
            style={{ left: 16 }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={next}
            className="file-preview-nav-btn"
            style={{ right: 16 }}
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      <div
        ref={containerRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: 'calc(100vh - 64px)',
          marginTop: 64,
          padding: '24px 48px',
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <FilePreviewRenderer
          file={currentFile}
          variant="modal"
          zoom={zoom}
          rotation={rotation}
          autoPlay
          onDownload={handleDownload}
          onTextStateChange={handleTextStateChange}
        />
      </div>

      {files.length > 1 && (
        <div className="file-preview-counter">
          {currentIndex + 1} / {files.length}
        </div>
      )}
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }

  return content
}
