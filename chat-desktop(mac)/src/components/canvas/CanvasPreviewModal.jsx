/**
 * CanvasPreviewModal — Enterprise media preview modal for the Canvas editor.
 *
 * Opens previews for images, PDFs, videos, audio, and other files directly
 * inside the canvas without navigating away from the workspace.
 * Uses FilePreviewRenderer from the chat module for consistent previews.
 *
 * Features:
 *  - Image lightbox with zoom/rotate
 *  - PDF viewer via iframe
 *  - Video/audio players
 *  - Text/code viewer
 *  - Download action via centralized media service
 *  - Keyboard navigation (Escape to close)
 *  - Lazy-loaded via React.lazy for optimal bundle size
 */

import React, { useEffect, useCallback, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Download, X, ZoomIn, ZoomOut } from 'lucide-react';
import { downloadFile, triggerDownload, detectMediaKind, resolvePreviewUrl, resolveDownloadUrl, buildFileInfo, buildImageUrl, isPlaceholderUrl } from '../../services/mediaService';
import toast from 'react-hot-toast';

// Lazy-load the heavy FilePreviewRenderer
const FilePreviewRenderer = lazy(() => import('../chat/FilePreviewRenderer'));

// ─── Loading Fallback ──────────────────────────────────────────────────────

function PreviewLoader() {
  return (
    <div className="canvas-image-preview-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36,
          border: '3px solid rgba(255,255,255,0.15)',
          borderTopColor: 'rgba(255,255,255,0.8)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: 0 }}>Loading preview...</p>
      </div>
    </div>
  );
}

// ─── Toolbar Button ────────────────────────────────────────────────────────

function ToolbarBtn({ icon: Icon, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.1)', border: 'none',
        borderRadius: 8, cursor: 'pointer', padding: 8,
        color: 'rgba(255,255,255,0.8)',
        transition: 'background 150ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
    >
      <Icon size={18} />
    </button>
  );
}

// ─── Lightweight Image Preview (no lazy loading needed for images) ─────────

function ImagePreview({ src, alt, fileName, onDownload }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const imgRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') return; // handled by parent
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.25, 3));
      if (e.key === '-') setZoom((z) => Math.max(z - 0.25, 0.5));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (e.deltaY < 0) setZoom((z) => Math.min(z + 0.15, 3));
    else setZoom((z) => Math.max(z - 0.15, 0.5));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((r) => r + 90);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px',
        background: 'rgba(0,0,0,0.5)',
        borderRadius: 12,
        flexShrink: 0,
      }}>
        <ToolbarBtn icon={ZoomOut} onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))} title="Zoom out" />
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, minWidth: 40, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <ToolbarBtn icon={ZoomIn} onClick={() => setZoom((z) => Math.min(z + 0.25, 3))} title="Zoom in" />
        <button
          type="button"
          onClick={handleRotate}
          title="Rotate"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.1)', border: 'none',
            borderRadius: 8, cursor: 'pointer', padding: 8,
            color: 'rgba(255,255,255,0.8)', fontSize: 16,
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
        >
          ↻
        </button>
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
        <ToolbarBtn icon={Download} onClick={onDownload} title="Download" />
      </div>

      {/* Image */}
      <div
        ref={imgRef}
        onWheel={handleWheel}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', width: '100%',
        }}
      >
        <img
          src={src}
          alt={alt || fileName || 'Preview'}
          draggable={false}
          style={{
            maxWidth: '90%', maxHeight: '85vh',
            objectFit: 'contain',
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transition: 'transform 0.2s ease',
            borderRadius: 8,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        />
      </div>
    </div>
  );
}

// ─── Main Preview Modal ────────────────────────────────────────────────────

export default function CanvasPreviewModal({ file, onClose }) {
  // Prevent Escape propagation from nested components
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleDownload = useCallback(async () => {
    try {
      // CRITICAL: Normalize file data to ensure all required fields are present
      const normalizedFile = buildFileInfo(file);
      if (!normalizedFile || isPlaceholderUrl(normalizedFile.url)) {
        toast.error('File is still processing. Please try again in a moment.');
        return;
      }

      const blob = await downloadFile(normalizedFile);
      const name = normalizedFile.fileName || normalizedFile.originalName || normalizedFile.name || 'download';
      triggerDownload(blob, name);
      toast.success('Download complete');
    } catch (err) {
      toast.error('Download failed: ' + (err.message || 'Unknown error'));
    }
  }, [file]);

  if (!file) return null;

  // CRITICAL: Normalize file data and resolve auth-aware URLs
  const normalizedFile = buildFileInfo(file);
  const src = normalizedFile ? resolvePreviewUrl(normalizedFile) : resolvePreviewUrl(file);
  const kind = detectMediaKind(normalizedFile?.mimeType || file.mimeType || file.type, normalizedFile?.fileName || file.fileName || file.name);
  const fileName = normalizedFile?.fileName || file.fileName || file.originalName || file.name || 'File';

  // For images, use proxy URL for authenticated access
  const imageSrc = kind === 'image' ? (normalizedFile ? buildImageUrl(normalizedFile) : src) : src;

  // For images, use lightweight inline preview
  if (kind === 'image') {
    return createPortal(
      <div
        className="canvas-image-preview-overlay"
        onClick={handleOverlayClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'default',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'fixed', top: 16, right: 16, zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(0,0,0,0.5)', border: 'none',
            cursor: 'pointer', color: 'white',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.7)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
        >
          <X size={20} />
        </button>

        <ImagePreview
          src={imageSrc}
          alt={file.alt || normalizedFile?.alt || fileName}
          fileName={fileName}
          onDownload={handleDownload}
        />
      </div>,
      document.body
    );
  }

  // For all other files, use the full FilePreviewRenderer (lazy loaded)
  return createPortal(
    <div
      className="canvas-image-preview-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'default',
      }}
    >
      {/* Top bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {fileName}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ToolbarBtn icon={Download} onClick={handleDownload} title="Download" />
          <ToolbarBtn icon={X} onClick={onClose} title="Close" />
        </div>
      </div>

      {/* Preview content */}
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '72px 32px 32px',
      }}>
        <Suspense fallback={<PreviewLoader />}>
          <FilePreviewRenderer
            file={{
              ...normalizedFile,
              ...file,
              url: src,
              secureUrl: src,
            }}
            variant="modal"
            onDownload={() => handleDownload()}
          />
        </Suspense>
      </div>
    </div>,
    document.body
  );
}

// ─── Hook for using preview modal in canvas nodes ─────────────────────────

/**
 * Hook that manages preview modal state for canvas media nodes.
 *
 * @param {object} file - File metadata from the node attrs
 * @returns {{ openPreview: Function, PreviewModal: React.Component|null }}
 */
export function useCanvasPreview() {
  const [previewFile, setPreviewFile] = useState(null);

  const openPreview = useCallback((file) => {
    setPreviewFile(file);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewFile(null);
  }, []);

  const PreviewModal = previewFile ? (
    <CanvasPreviewModal file={previewFile} onClose={closePreview} />
  ) : null;

  return { openPreview, closePreview, PreviewModal };
}