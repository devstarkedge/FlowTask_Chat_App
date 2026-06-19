import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  File,
  FileCode,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  RotateCw,
  Table2,
} from 'lucide-react'
import { messageAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { handleDownload as defaultHandleDownload } from '../../utils/handleDownload'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/flac', 'audio/aac']
const TEXT_CODE_TYPES = [
  'text/plain', 'text/csv', 'text/markdown', 'text/html', 'text/css',
  'text/javascript', 'application/javascript', 'text/typescript',
  'text/x-python', 'text/x-java-source', 'text/x-c', 'text/x-scss',
  'text/x-sql', 'text/yaml', 'application/x-yaml', 'text/x-env',
  'application/json', 'application/xml',
]
const TEXT_EXTS = [
  'txt', 'md', 'json', 'xml', 'js', 'jsx', 'ts', 'tsx', 'py', 'java',
  'c', 'cpp', 'css', 'scss', 'html', 'sql', 'yaml', 'yml', 'env', 'csv', 'log',
]

const LANGUAGE_LABELS = {
  js: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  json: 'JSON',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sql: 'SQL',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  txt: 'Plain Text',
  csv: 'CSV',
  env: 'Environment',
  log: 'Log',
}

export function getFileExtension(name = '') {
  const ext = (name.split('.').pop() || '').toLowerCase()
  return ext !== name.toLowerCase() ? ext : ''
}

export function getFileDisplayName(file) {
  return file?.originalName || file?.fileName || file?.name || 'File'
}

export function getLanguageLabelFromExt(ext) {
  return LANGUAGE_LABELS[ext] || ext.toUpperCase()
}

export function getFilePreviewInfo(file) {
  if (!file) {
    return {
      kind: 'none',
      ext: '',
      mime: '',
      isImage: false,
      isSvg: false,
      isVideo: false,
      isAudio: false,
      isPdf: false,
      isText: false,
      isCsv: false,
      isJson: false,
      isXlsx: false,
      isDocx: false,
      isSupported: false,
      canCopyText: false,
    }
  }

  const mime = (file.mimeType || file.type || '').toLowerCase()
  const ext = getFileExtension(getFileDisplayName(file))
  const isSvg = mime === 'image/svg+xml' || ext === 'svg'
  const isImage = IMAGE_TYPES.some((type) => mime === type || mime.startsWith(type.split('/')[0])) ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)
  const isVideo = VIDEO_TYPES.some((type) => mime === type || mime.startsWith(type.split('/')[0])) ||
    ['mp4', 'webm', 'mov', 'avi'].includes(ext)
  const isAudio = AUDIO_TYPES.some((type) => mime === type || mime.startsWith(type.split('/')[0])) ||
    ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)
  const isPdf = mime === 'application/pdf' || ext === 'pdf'
  const isCsv = mime === 'text/csv' || ext === 'csv'
  const isJson = mime === 'application/json' || ext === 'json'
  const isText = !isSvg && (
    TEXT_CODE_TYPES.some((type) => mime === type || mime.startsWith('text/')) ||
    TEXT_EXTS.includes(ext)
  )
  const isXlsx = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ].includes(mime) || ['xls', 'xlsx'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet')
  const isDocx = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ].includes(mime) || ['doc', 'docx'].includes(ext) || mime.includes('word') || mime.includes('msword')

  let kind = 'file'
  if (isImage) kind = 'image'
  else if (isVideo) kind = 'video'
  else if (isAudio) kind = 'audio'
  else if (isPdf) kind = 'pdf'
  else if (isXlsx) kind = 'spreadsheet'
  else if (isDocx) kind = 'word'
  else if (isCsv) kind = 'csv'
  else if (isText) kind = 'code'

  const isSupported = isImage || isVideo || isAudio || isPdf || isText || isCsv || isXlsx || isDocx

  return {
    kind,
    ext,
    mime,
    isImage,
    isSvg,
    isVideo,
    isAudio,
    isPdf,
    isText,
    isCsv,
    isJson,
    isXlsx,
    isDocx,
    isSupported,
    canCopyText: isText || isCsv,
  }
}

export function getPreviewAccent(file) {
  const { kind } = getFilePreviewInfo(file)
  if (kind === 'image') return '#3b82f6'
  if (kind === 'video') return '#8b5cf6'
  if (kind === 'audio') return '#10b981'
  if (kind === 'pdf') return 'var(--accent-red, #ef4444)'
  if (kind === 'word') return 'var(--accent-primary, #3b82f6)'
  if (kind === 'spreadsheet' || kind === 'csv') return 'var(--accent-green, #10b981)'
  if (kind === 'code') return '#f59e0b'
  return 'var(--text-muted)'
}

export function FilePreviewKindIcon({ file, size = 16, style }) {
  const { kind } = getFilePreviewInfo(file)
  const iconStyle = { color: getPreviewAccent(file), ...style }
  if (kind === 'image') return <ImageIcon size={size} style={iconStyle} />
  if (kind === 'video') return <Film size={size} style={iconStyle} />
  if (kind === 'audio') return <Music size={size} style={iconStyle} />
  if (kind === 'pdf' || kind === 'word') return <FileText size={size} style={iconStyle} />
  if (kind === 'spreadsheet' || kind === 'csv') return <Table2 size={size} style={iconStyle} />
  if (kind === 'code') return <FileCode size={size} style={iconStyle} />
  return <File size={size} style={iconStyle} />
}

function detectMimeType(buf, declaredMime) {
  const uint8Array = new Uint8Array(buf)
  const firstBytes = String.fromCharCode(...uint8Array.slice(0, 16))

  if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4e && uint8Array[3] === 0x47) {
    return { detected: 'image/png', reason: 'PNG magic bytes' }
  }
  if (uint8Array[0] === 0xff && uint8Array[1] === 0xd8 && uint8Array[2] === 0xff) {
    return { detected: 'image/jpeg', reason: 'JPEG magic bytes' }
  }
  if (firstBytes.startsWith('GIF8')) {
    return { detected: 'image/gif', reason: 'GIF magic bytes' }
  }
  if (firstBytes.startsWith('RIFF') && firstBytes.slice(8, 12) === 'WEBP') {
    return { detected: 'image/webp', reason: 'WebP magic bytes' }
  }
  if (firstBytes.startsWith('%PDF')) {
    return { detected: 'application/pdf', reason: 'PDF magic bytes' }
  }
  if (
    firstBytes.startsWith('<svg') ||
    firstBytes.startsWith('<?xml') ||
    firstBytes.startsWith('<!DOCTYPE') ||
    firstBytes.startsWith('<')
  ) {
    return { detected: 'image/svg+xml', reason: 'XML/SVG content' }
  }
  return { detected: declaredMime || 'application/octet-stream', reason: 'Declared MIME fallback' }
}

export async function fetchFileBuffer(file) {
  const rawUrl = file?.secureUrl || file?.url
  if (!rawUrl || rawUrl === '/placeholder-loading') {
    throw new Error('File is still processing. Please try again in a moment.')
  }

  const token = useAuthStore.getState().accessToken
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
  const assetId = file._id?.toString?.() || file.fileId?.toString?.() || file.assetId?.toString?.()
  const isServerUrl = rawUrl.startsWith('/')
  let fetchUrl = rawUrl
  let fetchHeaders = {}

  if (assetId && !isServerUrl) {
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

  const res = await fetch(fetchUrl, { headers: fetchHeaders })
  if (!res.ok) throw new Error(`Could not load file (HTTP ${res.status})`)
  return res.arrayBuffer()
}

function sanitizeDocxHtml(html) {
  if (!html || typeof document === 'undefined') return html || ''
  const allowedTags = new Set([
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'a', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img',
  ])
  const allowedAttrs = new Set(['href', 'target', 'rel', 'class', 'src', 'alt', 'title', 'colspan', 'rowspan'])
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const wrapper = doc.body.firstChild

  const cleanNode = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const tag = child.tagName.toLowerCase()
      if (!allowedTags.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes))
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        if (!allowedAttrs.has(attr.name.toLowerCase()) || /^on/i.test(attr.name)) {
          child.removeAttribute(attr.name)
        }
      }
      if (tag === 'a') {
        const href = child.getAttribute('href') || ''
        if (/^(javascript|data|vbscript):/i.test(href.trim())) child.removeAttribute('href')
        child.setAttribute('target', '_blank')
        child.setAttribute('rel', 'noopener noreferrer')
      }
      if (tag === 'img') {
        const src = child.getAttribute('src') || ''
        if (!/^(data:image\/|https?:|blob:)/i.test(src.trim())) child.removeAttribute('src')
      }
      cleanNode(child)
    }
  }

  if (!wrapper) return ''
  cleanNode(wrapper)
  return wrapper.innerHTML
}

function getSourceUrl(file) {
  return file?.secureUrl || file?.url || ''
}

function formatPreviewError(error) {
  if (!error) return 'Failed to load preview'
  if (error.includes('HTTP 502')) return 'The server encountered an error while fetching the file. Try downloading or retrying.'
  if (error.includes('HTTP 401') || error.includes('HTTP 403')) return 'Access denied. Please check your permissions.'
  if (error.includes('HTTP 404')) return 'File not found. It may have been deleted.'
  return error
}

function parseCsv(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      const next = line[i + 1]
      if (ch === '"' && next === '"') {
        current += '"'
        i += 1
        continue
      }
      if (ch === '"') {
        inQuotes = !inQuotes
        continue
      }
      if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
        continue
      }
      current += ch
    }
    result.push(current.trim())
    return result
  })
}

function LoadingState({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%', height: '100%', color: 'var(--text-secondary)' }}>
      <div style={{
        width: 36,
        height: 36,
        border: '3px solid var(--preview-spinner-border, rgba(255,255,255,0.15))',
        borderTopColor: 'var(--preview-spinner-top, rgba(255,255,255,0.8))',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ margin: 0, fontSize: 14 }}>{label}</p>
    </div>
  )
}

function ErrorState({ title, message, file, onDownload, onRetry, retryLabel = 'Retry' }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      width: '100%',
      height: '100%',
      padding: 24,
      textAlign: 'center',
      color: 'var(--text-secondary)',
    }}>
      <FileText size={40} style={{ color: 'var(--accent-red)', opacity: 0.85 }} />
      <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 700, fontSize: 14 }}>{title}</p>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13, maxWidth: 420 }}>{formatPreviewError(message)}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {onRetry && (
          <button type="button" onClick={onRetry} className="cl-file-btn cl-file-btn--ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RotateCw size={14} />
            <span>{retryLabel}</span>
          </button>
        )}
        <button type="button" onClick={() => onDownload(file)} className="cl-file-btn cl-file-btn--ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} />
          <span>Download Instead</span>
        </button>
      </div>
    </div>
  )
}

function UnsupportedState({ file, onDownload }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      width: '100%',
      height: '100%',
      padding: 24,
      textAlign: 'center',
      color: 'var(--text-secondary)',
    }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-secondary, var(--bg-hover))',
        border: '1px solid var(--border-secondary)',
      }}>
        <File size={28} style={{ color: 'var(--text-muted)', opacity: 0.65 }} />
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>Preview not available</p>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Download this file to open it locally.</p>
      <button type="button" onClick={() => onDownload(file)} className="cl-file-btn cl-file-btn--ghost" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Download size={14} />
        <span>Download</span>
      </button>
    </div>
  )
}

function CodePreview({ text, ext, isJson, variant }) {
  const displayText = useMemo(() => {
    if (!isJson) return text
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }, [isJson, text])

  const panel = variant === 'panel'
  const containerClass = panel ? 'cl-file-code-preview' : 'file-preview-code-container'
  const headerClass = panel ? 'cl-file-code-preview__header' : 'file-preview-code-header'
  const badgeClass = panel ? 'cl-file-code-preview__badge' : 'file-preview-code-badge'
  const linesClass = panel ? 'cl-file-code-preview__lines' : 'file-preview-code-lines'
  const bodyClass = panel ? 'cl-file-code-preview__body' : 'file-preview-code-content'

  return (
    <div className={containerClass} style={!panel ? { width: '100%', maxWidth: 900, height: '100%', maxHeight: '100%' } : undefined}>
      <div className={headerClass}>
        <span className={badgeClass}>{getLanguageLabelFromExt(ext)}</span>
        <span className={linesClass}>{displayText.split('\n').length} lines</span>
      </div>
      <pre className={bodyClass}>
        <code>{displayText}</code>
      </pre>
    </div>
  )
}

function CsvPreview({ rows, showAll, onShowAll, variant }) {
  const visibleRows = showAll ? rows.slice(1) : rows.slice(1, 51)
  const panel = variant === 'panel'

  return (
    <div style={{
      width: '100%',
      height: '100%',
      maxWidth: panel ? 'none' : 900,
      overflow: 'auto',
      background: panel ? 'var(--bg-primary)' : 'var(--preview-card-bg, var(--bg-secondary))',
      borderRadius: panel ? 0 : 12,
      padding: panel ? 0 : 16,
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      }}>
        <thead>
          <tr>
            {(rows[0] || []).map((header, i) => (
              <th key={i} style={{
                padding: '8px 12px',
                textAlign: 'left',
                fontWeight: 700,
                color: 'var(--text-primary)',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-secondary)',
                position: 'sticky',
                top: 0,
                whiteSpace: 'nowrap',
              }}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, ri) => (
            <tr key={ri}>
              {(rows[0] || row).map((_, ci) => (
                <td key={ci} style={{
                  padding: '7px 12px',
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--border-secondary)',
                  whiteSpace: 'nowrap',
                  maxWidth: 300,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!showAll && rows.length > 51 && (
        <div style={{ textAlign: 'center', padding: 12 }}>
          <button type="button" onClick={onShowAll} className="cl-file-btn cl-file-btn--ghost">
            Show all {rows.length - 1} rows
          </button>
        </div>
      )}
    </div>
  )
}

function XlsxPreview({ sheets, activeSheet, onChangeSheet, showAll, onShowAll }) {
  const sheet = sheets[activeSheet]
  if (!sheet) return null

  const allRows = sheet.data || []
  const headerRow = allRows[0] || []
  const bodyRows = showAll ? allRows.slice(1) : allRows.slice(1, 201)
  const hasMore = allRows.length > 201
  const columnCount = Math.max(headerRow.length, ...bodyRows.map((row) => row.length), 1)
  const columns = Array.from({ length: columnCount })

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {sheets.length > 1 && (
        <div style={{ display: 'flex', overflowX: 'auto', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-secondary)', flexShrink: 0 }}>
          {sheets.map((s, i) => (
            <button
              type="button"
              key={s.name || i}
              onClick={() => onChangeSheet(i)}
              style={{
                padding: '8px 18px',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                background: i === activeSheet ? 'var(--bg-primary)' : 'transparent',
                color: i === activeSheet ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: i === activeSheet ? 700 : 500,
                borderBottom: i === activeSheet ? '2px solid var(--accent-primary)' : '2px solid transparent',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {allRows.length === 0 ? (
          <p style={{ padding: 32, color: 'var(--text-muted)', textAlign: 'center', fontSize: 14 }}>Empty sheet</p>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  <th style={{ width: 40, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-secondary)', borderBottom: '1px solid var(--border-secondary)' }} />
                  {columns.map((_, ci) => (
                    <th key={ci} style={{
                      padding: '7px 10px',
                      textAlign: 'left',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      background: 'var(--bg-secondary)',
                      borderRight: '1px solid var(--border-secondary)',
                      borderBottom: '1px solid var(--border-secondary)',
                      whiteSpace: 'nowrap',
                      minWidth: 90,
                    }}>
                      {String(headerRow[ci] ?? '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                    <td style={{
                      padding: '5px 8px',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      textAlign: 'right',
                      borderRight: '1px solid var(--border-secondary)',
                      borderBottom: '1px solid var(--border-secondary)',
                      background: 'var(--bg-secondary)',
                      userSelect: 'none',
                    }}>
                      {ri + 2}
                    </td>
                    {columns.map((_, ci) => (
                      <td key={ci} title={String(row[ci] ?? '')} style={{
                        padding: '5px 10px',
                        color: 'var(--text-primary)',
                        borderRight: '1px solid var(--border-secondary)',
                        borderBottom: '1px solid var(--border-secondary)',
                        whiteSpace: 'nowrap',
                        maxWidth: 300,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {String(row[ci] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!showAll && hasMore && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <button type="button" onClick={onShowAll} className="cl-file-btn cl-file-btn--ghost">
                  Show all {allRows.length - 1} rows
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function DocxPreview({ html, variant }) {
  const compact = variant === 'details'
  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-secondary)',
      padding: compact ? '12px 0' : '24px 0',
    }}>
      <div style={{
        maxWidth: compact ? 560 : 816,
        margin: compact ? '0 auto 12px' : '0 auto 24px',
        background: 'var(--bg-primary)',
        padding: compact ? '28px 32px' : '72px 80px',
        boxShadow: compact ? 'none' : 'var(--shadow-md)',
        minHeight: compact ? 180 : 400,
      }}>
        <style>{`
          .docx-content h1,.docx-content h2,.docx-content h3,.docx-content h4 { margin: 0.9em 0 0.4em; font-weight: 700; color: var(--text-primary); }
          .docx-content h1 { font-size: 24px; } .docx-content h2 { font-size: 20px; } .docx-content h3 { font-size: 16px; }
          .docx-content p { margin: 0.4em 0; }
          .docx-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
          .docx-content td,.docx-content th { border: 1px solid var(--border-secondary, #dadce0); padding: 6px 10px; }
          .docx-content img { max-width: 100%; height: auto; }
          .docx-content ul,.docx-content ol { padding-left: 24px; margin: 0.4em 0; }
          .docx-content strong { font-weight: 700; } .docx-content em { font-style: italic; }
        `}</style>
        <div
          className="docx-content"
          style={{ lineHeight: 1.7, color: 'var(--text-primary)', fontSize: 14, fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

export default function FilePreviewRenderer({
  file,
  variant = 'modal',
  zoom = 1,
  rotation = 0,
  autoPlay = false,
  onDownload = defaultHandleDownload,
  onTextStateChange,
  style,
}) {
  const info = useMemo(() => getFilePreviewInfo(file), [file])
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [pdfRetryCount, setPdfRetryCount] = useState(0)
  const pdfUrlRef = useRef(null)

  const [imageBlobUrl, setImageBlobUrl] = useState(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState(null)
  const imageUrlRef = useRef(null)

  const [svgContent, setSvgContent] = useState(null)
  const [svgLoading, setSvgLoading] = useState(false)
  const [svgError, setSvgError] = useState(null)

  const [textContent, setTextContent] = useState(null)
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState(null)
  const [csvShowAll, setCsvShowAll] = useState(false)

  const [xlsxData, setXlsxData] = useState(null)
  const [xlsxLoading, setXlsxLoading] = useState(false)
  const [xlsxError, setXlsxError] = useState(null)
  const [xlsxActiveSheet, setXlsxActiveSheet] = useState(0)
  const [xlsxShowAll, setXlsxShowAll] = useState(false)

  const [docxHtml, setDocxHtml] = useState(null)
  const [docxLoading, setDocxLoading] = useState(false)
  const [docxError, setDocxError] = useState(null)

  useEffect(() => {
    onTextStateChange?.({
      textContent,
      textLoading,
      textError,
      canCopyText: info.canCopyText,
    })
  }, [info.canCopyText, onTextStateChange, textContent, textError, textLoading])

  useEffect(() => {
    setPdfBlobUrl(null)
    setPdfError(null)
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = null
    }
    if (!file || !info.isPdf) return undefined
    let cancelled = false
    setPdfLoading(true)
    ;(async () => {
      try {
        const buf = await fetchFileBuffer(file)
        if (cancelled) return
        const blob = new Blob([buf], { type: 'application/pdf' })
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
  }, [file, info.isPdf, pdfRetryCount])

  useEffect(() => {
    setImageBlobUrl(null)
    setImageError(null)
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current)
      imageUrlRef.current = null
    }
    if (!file || !info.isImage || info.isSvg) return undefined
    let cancelled = false
    setImageLoading(true)
    ;(async () => {
      try {
        const buf = await fetchFileBuffer(file)
        if (cancelled) return
        const { detected } = detectMimeType(buf, info.mime || 'image/png')
        const blob = new Blob([buf], { type: detected })
        const objectUrl = URL.createObjectURL(blob)
        imageUrlRef.current = objectUrl
        setImageBlobUrl(objectUrl)
      } catch (err) {
        if (!cancelled) setImageError(err.message || 'Failed to load image')
      } finally {
        if (!cancelled) setImageLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current)
        imageUrlRef.current = null
      }
    }
  }, [file, info.isImage, info.isSvg, info.mime])

  useEffect(() => {
    setSvgContent(null)
    setSvgError(null)
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current)
      imageUrlRef.current = null
    }
    if (!file || !info.isSvg) return undefined
    let cancelled = false
    setSvgLoading(true)
    ;(async () => {
      try {
        const buf = await fetchFileBuffer(file)
        if (cancelled) return
        const { detected } = detectMimeType(buf, info.mime || 'image/svg+xml')
        if (detected !== 'image/svg+xml') {
          const blob = new Blob([buf], { type: detected })
          const objectUrl = URL.createObjectURL(blob)
          imageUrlRef.current = objectUrl
          setImageBlobUrl(objectUrl)
          setSvgContent(null)
          return
        }
        setSvgContent(new TextDecoder().decode(buf))
      } catch (err) {
        if (!cancelled) setSvgError(err.message || 'Failed to load SVG')
      } finally {
        if (!cancelled) setSvgLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current)
        imageUrlRef.current = null
      }
    }
  }, [file, info.isSvg, info.mime])

  useEffect(() => {
    setTextContent(null)
    setTextError(null)
    setCsvShowAll(false)
    if (!file || !info.isText) return undefined
    let cancelled = false
    setTextLoading(true)
    ;(async () => {
      try {
        const buf = await fetchFileBuffer(file)
        if (!cancelled) setTextContent(new TextDecoder().decode(buf))
      } catch (err) {
        if (!cancelled) setTextError(err.message || 'Failed to load file')
      } finally {
        if (!cancelled) setTextLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [file, info.isText])

  useEffect(() => {
    setXlsxData(null)
    setXlsxError(null)
    setXlsxActiveSheet(0)
    setXlsxShowAll(false)
    if (!file || !info.isXlsx) return undefined
    let cancelled = false
    setXlsxLoading(true)
    ;(async () => {
      try {
        const buf = await fetchFileBuffer(file)
        if (cancelled) return
        const XLSX = await import('xlsx')
        const wb = XLSX.read(buf, { type: 'array' })
        const sheets = wb.SheetNames.map((name) => ({
          name,
          data: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }),
        }))
        if (!cancelled) setXlsxData(sheets)
      } catch (err) {
        if (!cancelled) setXlsxError(err.message || 'Failed to load spreadsheet')
      } finally {
        if (!cancelled) setXlsxLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [file, info.isXlsx])

  useEffect(() => {
    setDocxHtml(null)
    setDocxError(null)
    if (!file || !info.isDocx) return undefined
    let cancelled = false
    setDocxLoading(true)
    ;(async () => {
      try {
        const buf = await fetchFileBuffer(file)
        if (cancelled) return
        const mammoth = await import('mammoth')
        const result = await mammoth.convertToHtml({ arrayBuffer: buf })
        if (!cancelled) setDocxHtml(sanitizeDocxHtml(result.value))
      } catch (err) {
        if (!cancelled) setDocxError(err.message || 'Failed to load document')
      } finally {
        if (!cancelled) setDocxLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [file, info.isDocx])

  const fileName = getFileDisplayName(file)
  const transform = `scale(${zoom}) rotate(${rotation}deg)`
  const sourceUrl = getSourceUrl(file)
  const csvRows = info.isCsv && textContent ? parseCsv(textContent) : null

  const baseStyle = {
    width: '100%',
    height: '100%',
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    color: 'var(--text-primary)',
    ...style,
  }

  if (!file) return null

  return (
    <div className={`file-preview-renderer file-preview-renderer--${variant}`} style={baseStyle}>
      {info.isImage && (
        info.isSvg ? (
          svgLoading ? (
            <LoadingState label="Loading SVG..." />
          ) : svgError ? (
            <ErrorState title="Failed to load SVG" message={svgError} file={file} onDownload={onDownload} />
          ) : svgContent ? (
            <div style={{ maxWidth: '100%', maxHeight: '100%', overflow: 'auto', transform, transition: 'transform 0.2s ease' }}>
              <style>{`
                .svg-preview-container svg {
                  max-width: 100%;
                  max-height: 100%;
                  width: auto;
                  height: auto;
                  object-fit: contain;
                }
              `}</style>
              <div className="svg-preview-container" dangerouslySetInnerHTML={{ __html: svgContent }} />
            </div>
          ) : imageBlobUrl ? (
            <img src={imageBlobUrl} alt={fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform, transition: 'transform 0.2s ease', borderRadius: 4 }} draggable={false} />
          ) : null
        ) : imageLoading ? (
          <LoadingState label="Loading image..." />
        ) : imageError ? (
          <ErrorState title="Failed to load image" message={imageError} file={file} onDownload={onDownload} />
        ) : imageBlobUrl ? (
          <img src={imageBlobUrl} alt={fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform, transition: 'transform 0.2s ease', borderRadius: 4 }} draggable={false} />
        ) : null
      )}

      {info.isPdf && (
        pdfLoading ? (
          <LoadingState label="Loading PDF..." />
        ) : pdfError ? (
          <ErrorState
            title="Failed to load PDF"
            message={pdfError}
            file={file}
            onDownload={onDownload}
            onRetry={() => setPdfRetryCount((count) => count + 1)}
          />
        ) : pdfBlobUrl ? (
          <iframe src={pdfBlobUrl} title={fileName} style={{ width: '100%', height: '100%', border: 'none', borderRadius: variant === 'panel' ? 0 : 8 }} />
        ) : null
      )}

      {info.isVideo && !info.isImage && (
        <video src={sourceUrl} controls autoPlay={autoPlay} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
      )}

      {info.isAudio && !info.isImage && !info.isVideo && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 32 }}>
          <Music size={48} style={{ color: 'var(--accent-primary)' }} />
          <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 700 }}>{fileName}</p>
          <audio src={sourceUrl} controls autoPlay={autoPlay} style={{ width: '100%', maxWidth: 360 }} />
        </div>
      )}

      {info.isCsv && !info.isImage && !info.isVideo && !info.isAudio && !info.isPdf && (
        textLoading ? (
          <LoadingState label="Loading file content..." />
        ) : textError ? (
          <ErrorState title="Failed to load file" message={textError} file={file} onDownload={onDownload} />
        ) : csvRows ? (
          <CsvPreview rows={csvRows} showAll={csvShowAll} onShowAll={() => setCsvShowAll(true)} variant={variant} />
        ) : null
      )}

      {info.isText && !info.isCsv && !info.isImage && !info.isVideo && !info.isAudio && !info.isPdf && (
        textLoading ? (
          <LoadingState label="Loading file content..." />
        ) : textError ? (
          <ErrorState title="Failed to load file" message={textError} file={file} onDownload={onDownload} />
        ) : textContent !== null ? (
          <CodePreview text={textContent} ext={info.ext} isJson={info.isJson} variant={variant} />
        ) : null
      )}

      {info.isXlsx && !info.isImage && !info.isVideo && !info.isAudio && !info.isPdf && (
        xlsxLoading ? (
          <LoadingState label="Loading spreadsheet..." />
        ) : xlsxError ? (
          <ErrorState title="Failed to load spreadsheet" message={xlsxError} file={file} onDownload={onDownload} />
        ) : xlsxData ? (
          <XlsxPreview
            sheets={xlsxData}
            activeSheet={xlsxActiveSheet}
            onChangeSheet={setXlsxActiveSheet}
            showAll={xlsxShowAll}
            onShowAll={() => setXlsxShowAll(true)}
          />
        ) : null
      )}

      {info.isDocx && !info.isImage && !info.isVideo && !info.isAudio && !info.isPdf && !info.isXlsx && (
        docxLoading ? (
          <LoadingState label="Loading document..." />
        ) : docxError ? (
          <ErrorState title="Failed to load document" message={docxError} file={file} onDownload={onDownload} />
        ) : docxHtml ? (
          <DocxPreview html={docxHtml} variant={variant} />
        ) : null
      )}

      {!info.isSupported && (
        <UnsupportedState file={file} onDownload={onDownload} />
      )}
    </div>
  )
}
