/**
 * FileNode — Enhanced canvas file attachment node with addNodeView,
 * rich metadata, proper download via mediaService, and preview modal.
 *
 * Attributes stored:
 *  - url, fileId, fileName, mimeType, fileSize, thumbnailUrl
 *  - loading
 *
 * Uses addNodeView (not renderHTML) for interactive elements like
 * click-to-preview and download buttons.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { detectMediaKind, getFileIconEmoji, formatFileSize, downloadFile, triggerDownload, resolveDownloadUrl, buildFileInfo, isPlaceholderUrl } from '../../../services/mediaService';
import toast from 'react-hot-toast';

const PREVIEW_EVENT = 'canvas:open-preview';

export default Node.create({
  name: 'fileAttachment',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      url: { default: '' },
      fileId: { default: null },
      fileName: { default: 'Attachment' },
      name: { default: 'Attachment' },
      mimeType: { default: '' },
      fileSize: { default: 0 },
      size: { default: 0 },
      thumbnailUrl: { default: null },
      loading: { default: false },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="file-attachment"]' },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { url, fileName, name, fileSize, size, loading, mimeType } = node.attrs;
    const displayName = fileName || name || 'Attachment';
    const displaySize = formatFileSize(fileSize || size);
    const icon = getFileIconEmoji(displayName);

    const container = document.createElement('div');
    container.setAttribute('data-type', 'file-attachment');
    container.className = `file-attachment-block ${loading ? 'is-loading' : ''}`;

    if (loading) {
      const loaderSpan = document.createElement('span');
      loaderSpan.className = 'file-loader';
      loaderSpan.textContent = 'Uploading...';
      container.appendChild(loaderSpan);
      return container;
    }

    // File icon
    const iconSpan = document.createElement('span');
    iconSpan.className = 'file-icon';
    iconSpan.textContent = icon;

    // File info container
    const infoDiv = document.createElement('div');
    infoDiv.className = 'file-info';

    // File name (no href to prevent navigation)
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.textContent = displayName;
    nameSpan.style.cursor = 'pointer';

    // File size
    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'file-size';
    sizeSpan.textContent = displaySize;

    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'file-download-btn';
    downloadBtn.textContent = '⬇ Download';
    downloadBtn.style.cssText = [
      'margin-left: auto',
      'padding: 6px 12px',
      'border-radius: 8px',
      'border: 1px solid var(--border-primary)',
      'background: var(--bg-primary)',
      'color: var(--text-link)',
      'cursor: pointer',
      'font-size: 12px',
      'font-weight: 600',
      'transition: background 150ms ease, box-shadow 150ms ease',
      'white-space: nowrap',
      'flex-shrink: 0',
    ].join(';');
    downloadBtn.addEventListener('mouseenter', () => { downloadBtn.style.background = 'var(--bg-hover)'; });
    downloadBtn.addEventListener('mouseleave', () => { downloadBtn.style.background = 'var(--bg-primary)'; });

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(sizeSpan);

    container.appendChild(iconSpan);
    container.appendChild(infoDiv);
    container.appendChild(downloadBtn);

    return container;
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const { url, fileName, name, fileSize, size, loading, mimeType, fileId, thumbnailUrl } = node.attrs;
      const displayName = fileName || name || 'Attachment';
      const displaySize = formatFileSize(fileSize || size);
      const icon = getFileIconEmoji(displayName);

      const container = document.createElement('div');
      container.setAttribute('data-type', 'file-attachment');
      container.className = `file-attachment-block ${loading ? 'is-loading' : ''}`;
      container.style.cssText = [
        'display: inline-flex',
        'align-items: center',
        'gap: 12px',
        'padding: 12px 16px',
        'background: var(--bg-secondary)',
        'border: 1px solid var(--border-primary)',
        'border-radius: 10px',
        'margin: 8px 0',
        'cursor: pointer',
        'transition: background 150ms ease, box-shadow 150ms ease',
        'max-width: 100%',
        'box-shadow: 0 1px 3px rgba(0,0,0,0.04)',
      ].join(';');

      if (loading) {
        const loaderSpan = document.createElement('span');
        loaderSpan.className = 'file-loader';
        loaderSpan.textContent = 'Uploading...';
        container.appendChild(loaderSpan);
        return { dom: container };
      }

      // ── File icon ──────────────────────────────────────────────────────
      const iconSpan = document.createElement('span');
      iconSpan.className = 'file-icon';
      iconSpan.textContent = icon;
      iconSpan.style.cssText = 'font-size: 18px; flex-shrink: 0;';

      // ── File info ──────────────────────────────────────────────────────
      const infoDiv = document.createElement('div');
      infoDiv.style.cssText = 'display: flex; flex-direction: column; min-width: 0; gap: 2px;';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'file-name';
      nameSpan.textContent = displayName;
      nameSpan.style.cssText = [
        'font-size: 14px',
        'font-weight: 600',
        'color: var(--text-link)',
        'overflow: hidden',
        'text-overflow: ellipsis',
        'white-space: nowrap',
      ].join(';');

      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'file-size';
      sizeSpan.textContent = displaySize;
      sizeSpan.style.cssText = 'font-size: 11px; color: var(--text-muted);';

      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(sizeSpan);

      // ── Download button ────────────────────────────────────────────────
      const downloadBtn = document.createElement('button');
      downloadBtn.textContent = '⬇ Download';
      downloadBtn.style.cssText = [
        'margin-left: auto',
        'padding: 6px 12px',
        'border-radius: 8px',
        'border: 1px solid var(--border-primary)',
        'background: var(--bg-primary)',
        'color: var(--text-link)',
        'cursor: pointer',
        'font-size: 12px',
        'font-weight: 600',
        'transition: background 150ms ease',
        'white-space: nowrap',
        'flex-shrink: 0',
      ].join(';');

      downloadBtn.addEventListener('mouseenter', () => { downloadBtn.style.background = 'var(--bg-hover)'; });
      downloadBtn.addEventListener('mouseleave', () => { downloadBtn.style.background = 'var(--bg-primary)'; });

      downloadBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
          // CRITICAL: Use buildFileInfo to ensure all metadata is present
          const fileObj = buildFileInfo({
            url,
            src: url,
            secureUrl: url,
            fileId,
            _id: fileId,
            assetId: fileId,
            fileName: displayName,
            name: displayName,
            originalName: displayName,
            mimeType: mimeType || 'application/octet-stream',
            type: mimeType || 'application/octet-stream',
            fileSize: fileSize || size || 0,
            size: fileSize || size || 0,
            thumbnailUrl: thumbnailUrl || url,
          });

          if (!fileObj || isPlaceholderUrl(fileObj.url)) {
            toast.error('File is still processing. Please try again in a moment.');
            return;
          }

          const blob = await downloadFile(fileObj);
          triggerDownload(blob, displayName);
          toast.success('Download complete');
        } catch (err) {
          toast.error('Download failed: ' + (err.message || 'Unknown error'));
        }
      });

      // ── Click to preview ───────────────────────────────────────────────
      container.addEventListener('click', (e) => {
        // Don't open preview if clicking the download button
        if (e.target === downloadBtn || downloadBtn.contains(e.target)) return;
        e.stopPropagation();
        e.preventDefault(); // CRITICAL: prevents navigation

        if (!url || loading) return;

        // CRITICAL: Build complete file metadata using centralized builder
        // This ensures all required fields are present for the preview modal
        const fileData = buildFileInfo({
          url,
          src: url,
          secureUrl: url,
          fileId,
          _id: fileId,
          assetId: fileId,
          fileName: displayName,
          name: displayName,
          originalName: displayName,
          mimeType: mimeType || 'application/octet-stream',
          type: mimeType || 'application/octet-stream',
          fileSize: fileSize || size || 0,
          size: fileSize || size || 0,
          thumbnailUrl: thumbnailUrl || url,
        });

        // Don't open preview for placeholder URLs
        if (!fileData || isPlaceholderUrl(fileData.url)) {
          console.warn('[FileNode] Cannot preview file with placeholder URL');
          return;
        }

        const event = new CustomEvent(PREVIEW_EVENT, {
          bubbles: true,
          cancelable: true,
          detail: { file: fileData },
        });
        container.dispatchEvent(event);
      });

      // ── Hover effect ───────────────────────────────────────────────────
      container.addEventListener('mouseenter', () => {
        container.style.background = 'var(--bg-hover)';
        container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
      });
      container.addEventListener('mouseleave', () => {
        container.style.background = 'var(--bg-secondary)';
        container.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
      });

      container.appendChild(iconSpan);
      container.appendChild(infoDiv);
      container.appendChild(downloadBtn);

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'fileAttachment') return false;
          // Update display when node attrs change (e.g., after upload completes)
          const newName = updatedNode.attrs.fileName || updatedNode.attrs.name || 'Attachment';
          const newSize = formatFileSize(updatedNode.attrs.fileSize || updatedNode.attrs.size);
          nameSpan.textContent = newName;
          sizeSpan.textContent = newSize;
          iconSpan.textContent = getFileIconEmoji(newName);

          if (updatedNode.attrs.loading) {
            container.className = 'file-attachment-block is-loading';
            container.innerHTML = '';
            const loaderSpan = document.createElement('span');
            loaderSpan.className = 'file-loader';
            loaderSpan.textContent = 'Uploading...';
            container.appendChild(loaderSpan);
          } else {
            container.className = 'file-attachment-block';
          }
          return true;
        },
      };
    };
  },
});