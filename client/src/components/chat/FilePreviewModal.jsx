import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, FileText, Film, Music, File, Copy, Check } from 'lucide-react'
import { useDownloadStore } from "../../stores/downloadStore";
import { handleDownload } from "../../utils/handleDownload";
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { messageAPI } from '../../services/api';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/flac', 'audio/aac']
const PDF_TYPES = ['application/pdf']
const TEXT_CODE_TYPES = [
  'text/plain', 'text/csv', 'text/markdown', 'text/html', 'text/css',
  'text/javascript', 'application/javascript', 'text/typescript',
  'text/x-python', 'text/x-java-source', 'text/x-c', 'text/x-scss',
  'text/x-sql', 'text/yaml', 'application/x-yaml', 'text/x-env',
  'application/json', 'application/xml',
]
const TEXT_EXTS = ['txt', 'md', 'json', 'xml', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'css', 'scss', 'html', 'sql', 'yaml', 'env', 'csv']

function getExtension(name = '') {
  const ext = (name.split('.').pop() || '').toLowerCase()
  return ext !== name.toLowerCase() ? ext : ''
}

function getLanguageLabelFromExt(ext) {
  const map = {
    js: 'JavaScript', ts: 'TypeScript', py: 'Python', java: 'Java',
    c: 'C', cpp: 'C++', json: 'JSON', xml: 'XML', html: 'HTML',
    css: 'CSS', scss: 'SCSS', sql: 'SQL', yaml: 'YAML', md: 'Markdown',
    txt: 'Plain Text', csv: 'CSV', env: 'Environment',
  }
  return map[ext] || ext.toUpperCase()
}

export default function FilePreviewModal({ file, files = [], onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [textContent, setTextContent] = useState(null)
  const [textLoading, setTextLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [csvShowAll, setCsvShowAll] = useState(false)
  const containerRef = useRef(null)
  const addDownload = useDownloadStore((s) => s.addDownload);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const pdfUrlRef = useRef(null)

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
  const fileName = currentFile.originalName || currentFile.fileName || ''
  const ext = getExtension(fileName)
  const isImage = IMAGE_TYPES.some((t) => mime.startsWith(t.split('/')[0]) || mime === t) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)
  const isVideo = VIDEO_TYPES.some((t) => mime.startsWith(t.split('/')[0]) || mime === t) || ['mp4', 'webm', 'mov', 'avi'].includes(ext)
  const isAudio = AUDIO_TYPES.some((t) => mime.startsWith(t.split('/')[0]) || mime === t) || ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)
  const isPdf = PDF_TYPES.some((t) => mime === t) || ext === 'pdf'
  const isText = TEXT_CODE_TYPES.some((t) => mime === t || mime.startsWith('text/')) || TEXT_EXTS.includes(ext)
  const isCsv = mime === 'text/csv' || ext === 'csv'

  // Fetch PDF as blob to avoid 401 from Chrome's PDF viewer extension making
  // unauthenticated requests when it intercepts the iframe src URL.
  // For Cloudinary assets, we route through our server proxy so that CDN
  // account-level access restrictions are also bypassed transparently.
  useEffect(() => {
    setPdfBlobUrl(null)
    setPdfError(null)
    // Revoke previous blob URL
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = null
    }
    if (!isPdf) return
    const rawUrl = currentFile.secureUrl || currentFile.url
    if (!rawUrl || rawUrl === '/placeholder-loading') {
      setPdfError('File is still processing — please try again in a moment.')
      return
    }
    let cancelled = false
    setPdfLoading(true)
    ;(async () => {
      try {
        const token = useAuthStore.getState().accessToken
        const isServerUrl = rawUrl.startsWith('/')

        // Prefer server proxy when we have an asset _id, so Cloudinary CDN
        // restrictions are bypassed by the server fetching on our behalf.
        const assetId = currentFile._id?.toString?.() || currentFile.fileId?.toString?.()
        let fetchUrl = rawUrl
        let fetchHeaders = {}

        const workspaceId = useWorkspaceStore.getState().activeWorkspaceId

        if (assetId && !isServerUrl) {
          // Route through our authenticated server proxy
          fetchUrl = messageAPI.getFileProxyUrl(assetId)
          fetchHeaders = {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
          }
        } else if (isServerUrl && token) {
          fetchHeaders = {
            Authorization: `Bearer ${token}`,
            ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
          }
        }

        let res = await fetch(fetchUrl, { headers: fetchHeaders })
        if (!res.ok) throw new Error(`Could not load PDF (HTTP ${res.status})`)
        const blob = await res.blob()
        if (cancelled) return
        const objectUrl = URL.createObjectURL(blob)
        pdfUrlRef.current = objectUrl
        setPdfBlobUrl(objectUrl)
      } catch (err) {
        if (!cancelled) setPdfError(err.message || 'Failed to load PDF')
      } finally {
        if (!cancelled) setPdfLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current)
        pdfUrlRef.current = null
      }
    }
  }, [currentFile, isPdf]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch text content for code/text preview
  useEffect(() => {
    setTextContent(null)
    setCopied(false)
    setCsvShowAll(false)
    if (!isText && !isCsv) return
    const url = currentFile.secureUrl || currentFile.url
    if (!url) return
    let cancelled = false
    setTextLoading(true)
    fetch(url)
      .then((r) => r.text())
      .then((text) => { if (!cancelled) setTextContent(text) })
      .catch(() => { if (!cancelled) setTextContent(null) })
      .finally(() => { if (!cancelled) setTextLoading(false) })
    return () => { cancelled = true }
  }, [currentFile, isText, isCsv])

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

  // Mouse wheel zoom for images
  const handleWheel = useCallback((e) => {
    if (!isImage) return
    e.preventDefault()
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(z + 0.15, 3))
    } else {
      setZoom((z) => Math.max(z - 0.15, 0.5))
    }
  }, [isImage])

  // Attach a non-passive native wheel listener to the preview container so
  // we can call preventDefault() and implement smooth zooming for images.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const wheelListener = (ev) => {
      if (!isImage) return
      ev.preventDefault()
      if (ev.deltaY < 0) setZoom((z) => Math.min(z + 0.15, 3))
      else setZoom((z) => Math.max(z - 0.15, 0.5))
    }
    el.addEventListener('wheel', wheelListener, { passive: false })
    return () => el.removeEventListener('wheel', wheelListener, { passive: false })
  }, [isImage])

  const handleCopy = async () => {
    if (!textContent) return
    try {
      await navigator.clipboard.writeText(textContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* noop */ }
  }

  const downloadUrl = currentFile.secureUrl || currentFile.url || '#'

  // Parse CSV for table view
  const csvRows = isCsv && textContent ? textContent.split('\n').filter(Boolean).map((line) => {
    const result = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
      current += ch
    }
    result.push(current.trim())
    return result
  }) : null

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 11000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)',
    WebkitBackdropFilter: 'blur(6px)',
    backdropFilter: 'blur(6px)',
  }

  const content = (
    <div style={overlayStyle} className="file-preview-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
                {currentFile.fileSize && (
                  <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>
                    {formatFileSize(currentFile.fileSize)}
                  </span>
                )}
                {currentFile.uploadedBy?.name && (
                  <span style={{ color: 'rgba(255,255,255,0.68)', fontSize: 12 }}>
                    Uploaded by {currentFile.uploadedBy.name}
                  </span>
                )}
                {currentFile.uploadedAt && (
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                    {new Date(currentFile.uploadedAt).toLocaleString()}
                  </span>
                )}
              </div>
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
          {(isText || isCsv) && textContent && (
            <>
              <ToolbarBtn icon={copied ? Check : Copy} onClick={handleCopy} />
              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
            </>
          )}
          <ToolbarBtn icon={Download} onClick={() => handleDownload(currentFile)} />
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
        {isPdf && (
          pdfLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36,
                border: '3px solid rgba(255,255,255,0.15)',
                borderTopColor: 'rgba(255,255,255,0.8)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Loading PDF…</p>
            </div>
          ) : pdfError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 40, background: 'rgba(0,0,0,0.35)', borderRadius: 16 }}>
              <FileText size={48} style={{ color: '#ef4444' }} />
              <p style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>Failed to load PDF</p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', maxWidth: 360 }}>{pdfError}</p>
              <button
                type="button"
                onClick={() => handleDownload(currentFile)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.15)', border: 'none',
                  color: 'white', padding: '8px 20px', borderRadius: 8,
                  cursor: 'pointer', fontSize: 14, marginTop: 4,
                }}
              >
                <Download size={14} /> Download Instead
              </button>
            </div>
          ) : pdfBlobUrl ? (
            <iframe
              src={pdfBlobUrl}
              title={currentFile.originalName || 'PDF Preview'}
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
            />
          ) : null
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

        {/* CSV Table Preview */}
        {isCsv && !isAudio && !isVideo && !isImage && !isPdf && (
          <div style={{
            width: '100%', maxWidth: 900, maxHeight: '100%', overflow: 'auto',
            background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 16,
          }}>
            {textLoading && (
              <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: 40 }}>Loading…</p>
            )}
            {csvRows && csvRows.length > 0 && (
              <>
                <table style={{
                  width: '100%', borderCollapse: 'collapse', fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}>
                  <thead>
                    <tr>
                      {csvRows[0].map((h, i) => (
                        <th key={i} style={{
                          padding: '8px 12px', textAlign: 'left', fontWeight: 700,
                          color: 'rgba(255,255,255,0.9)', borderBottom: '2px solid rgba(255,255,255,0.15)',
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(csvShowAll ? csvRows.slice(1) : csvRows.slice(1, 51)).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{
                            padding: '6px 12px', color: 'rgba(255,255,255,0.75)',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            whiteSpace: 'nowrap', maxWidth: 300, overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!csvShowAll && csvRows.length > 51 && (
                  <div style={{ textAlign: 'center', padding: 12 }}>
                    <button
                      onClick={() => setCsvShowAll(true)}
                      style={{
                        background: 'rgba(255,255,255,0.1)', border: 'none',
                        color: 'rgba(255,255,255,0.7)', padding: '6px 16px',
                        borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      Show all {csvRows.length - 1} rows
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Text / Code Preview */}
        {isText && !isCsv && !isAudio && !isVideo && !isImage && !isPdf && (
          <div style={{
            width: '100%', maxWidth: 800, maxHeight: '100%', overflow: 'auto',
            background: 'rgba(0,0,0,0.4)', borderRadius: 12,
          }}>
            {textLoading && (
              <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: 40 }}>Loading…</p>
            )}
            {textContent !== null && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                    color: '#059669', background: 'rgba(5,150,105,0.15)',
                    padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
                  }}>
                    {getLanguageLabelFromExt(ext)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                    {textContent.split('\n').length} lines
                  </span>
                </div>
                <pre style={{
                  margin: 0, padding: '16px',
                  color: 'rgba(255,255,255,0.85)', fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                  lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  overflow: 'auto', maxHeight: 'calc(100vh - 200px)',
                }}>
                  <code>{textContent}</code>
                </pre>
              </>
            )}
          </div>
        )}

        {!isImage && !isVideo && !isAudio && !isPdf && !isText && !isCsv && (
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleDownload(currentFile)}
                className="btn-primary"
                style={{ marginTop: 8 }}
              >
                <Download size={14} /> Download
              </button>
              <button
                type="button"
                onClick={() => window.open(downloadUrl, '_blank')}
                className="btn-primary"
                style={{ marginTop: 8 }}
              >
                Open externally
              </button>
            </div>
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

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }

  return content
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
