import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  Search,
  Video,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { fileAPI } from '../../../services/api'
import SidebarContainer from '../sidebar/SidebarContainer'
import SidebarItem from '../sidebar/SidebarItem'
import WorkspaceSwitcher from '../../workspace/WorkspaceSwitcher'

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

function getFileKind(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}

function formatUploadedAt(value) {
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

function KindIcon({ kind }) {
  if (kind === 'image') return <ImageIcon size={15} style={{ color: 'var(--accent-primary)' }} />
  if (kind === 'video') return <Video size={15} style={{ color: 'var(--accent-purple)' }} />
  return <FileText size={15} style={{ color: 'var(--text-muted)' }} />
}

function moveListFocus(event, direction) {
  const current = event.currentTarget
  const sibling = direction === 'next' ? current.nextElementSibling : current.previousElementSibling
  if (sibling?.tagName === 'BUTTON') {
    sibling.focus()
  }
}

function FileRowSkeleton() {
  return (
    <div className="sidebar-item" style={{ cursor: 'default', pointerEvents: 'none' }}>
      <span className="sidebar-item-icon">
        <div className="w-7 h-7 rounded-lg skeleton" />
      </span>
      <span className="sidebar-item-content">
        <div className="h-3.5 rounded skeleton" style={{ width: '80%', marginBottom: 5 }} />
        <div className="h-3 rounded skeleton" style={{ width: '50%', marginBottom: 4 }} />
        <div className="h-2.5 rounded skeleton" style={{ width: '65%' }} />
      </span>
    </div>
  )
}

export default function FilesContextSidebar({
  selectedFileId,
  onSelectFile,
  onFilesChanged,
}) {
  const [files, setFiles] = useState([])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState(null)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 260)
    return () => clearTimeout(t)
  }, [query])

  const loadFiles = useCallback(async ({ reset = false, cursor = null } = {}) => {
    setIsLoading(true)

    try {
      const { data } = await fileAPI.listWorkspace({
        limit: 40,
        cursor: cursor || undefined,
        q: debouncedQuery || undefined,
        kind: kind === 'all' ? undefined : kind,
      })

      const incoming = data.data.items || []
      const incomingHasMore = !!data.data.hasMore
      const incomingNextCursor = data.data.pagination?.nextCursor || null

      setFiles((prev) => {
        if (reset) return incoming
        const seen = new Set(prev.map((f) => f.referenceId))
        const unique = incoming.filter((f) => !seen.has(f.referenceId))
        return [...prev, ...unique]
      })

      setHasMore(incomingHasMore)
      setNextCursor(incomingNextCursor)
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to load files')
    } finally {
      setIsLoading(false)
    }
  }, [debouncedQuery, kind])

  useEffect(() => {
    setNextCursor(null)
    loadFiles({ reset: true, cursor: null })
  }, [debouncedQuery, kind, loadFiles])

  useEffect(() => {
    onFilesChanged?.(files)
  }, [files, onFilesChanged])

  const selectedFile = useMemo(
    () => files.find((f) => f.referenceId === selectedFileId) || null,
    [files, selectedFileId],
  )

  useEffect(() => {
    if (selectedFile) return
    if (files.length === 0) return

    const fallback = files[0]
    onSelectFile?.(fallback)
  }, [selectedFile, files, onSelectFile])

  const header = (
    <div>
      <div className="w-full flex items-center justify-between" style={{ minHeight: 32 }}>
        <WorkspaceSwitcher />
      </div>

      <div className="mt-2">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={18} style={{ color: 'var(--accent-primary)' }} />
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>
            Files
          </h1>
          <span
            className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
          >
            {files.length}
          </span>
        </div>

        {/* Search Bar */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ border: '1px solid var(--border-secondary)', background: 'var(--bg-primary)' }}
        >
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by filename"
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        {/* Kind Filters */}
        <div className="flex items-center gap-2 mt-3">
          {['all', 'image', 'video', 'file'].map((value) => (
            <button
              key={value}
              onClick={() => setKind(value)}
              className="text-xs px-2.5 py-1.5 rounded-md font-medium cursor-pointer"
              style={{
                border: 'none',
                background: kind === value ? 'var(--accent-primary)' : 'var(--bg-hover)',
                color: kind === value ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {value === 'all' ? 'All' : value === 'file' ? 'Docs' : `${value[0].toUpperCase()}${value.slice(1)}s`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <SidebarContainer header={header} aria-label="Files sidebar">
      <div className="h-full overflow-y-auto" role="listbox" aria-label="Files list">
        {/* Loading skeletons */}
        {isLoading && files.length === 0 && (
          <div className="px-2 pt-2">
            {Array.from({ length: 8 }).map((_, idx) => (
              <FileRowSkeleton key={idx} />
            ))}
            <div className="py-3 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && files.length === 0 && (
          <div className="py-16 px-6 text-center">
            <File size={34} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.45 }} />
            <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-white)' }}>
              No files yet
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Shared files from channels and DMs will show up here.
            </p>
          </div>
        )}

        {/* File items */}
        <div className="px-2 pt-1">
          {files.map((file) => {
            const isSelected = file.referenceId === selectedFileId
            const kindValue = getFileKind(file.mimeType)
            const channelLabel = file.channel?.type === 'dm'
              ? 'Direct message'
              : `#${file.channel?.name || 'channel'}`
            const metaText = `${formatSize(file.fileSize)} • ${file.uploadedBy?.name || 'Unknown'} • ${formatUploadedAt(file.uploadedAt)}`

            return (
              <SidebarItem
                key={file.referenceId}
                icon={
                  <div
                    className="flex items-center justify-center rounded-lg"
                    style={{ width: 28, height: 28, background: 'var(--bg-primary)' }}
                  >
                    <KindIcon kind={kindValue} />
                  </div>
                }
                label={file.fileName}
                sublabel={
                  <>
                    <span style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>
                      {channelLabel}
                    </span>
                    <br />
                    <span style={{ fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)' }}>
                      {metaText}
                    </span>
                  </>
                }
                isActive={isSelected}
                onClick={() => onSelectFile?.(file)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    moveListFocus(e, 'next')
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    moveListFocus(e, 'prev')
                  }
                }}
                ariaSelected={isSelected}
              />
            )
          })}
        </div>

        {/* Load more */}
        {isLoading && (
          <div className="py-4 flex items-center justify-center">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}

        {!isLoading && hasMore && (
          <div className="p-3">
            <button
              onClick={() => loadFiles({ cursor: nextCursor })}
              className="w-full text-sm py-2 rounded-md cursor-pointer"
              style={{ border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
            >
              Load more files
            </button>
          </div>
        )}
      </div>
    </SidebarContainer>
  )
}
