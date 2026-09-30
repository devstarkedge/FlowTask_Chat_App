/**
 * ImageNode — Enhanced canvas image node with rich metadata, error handling,
 * and preview modal integration using custom events.
 *
 * Attributes stored:
 *  - src, fileId, fileName, mimeType, fileSize, thumbnailUrl
 *  - alt, width, height, loading
 *
 * The preview modal is triggered via a custom DOM event that the parent
 * EnterpriseCanvasEditor listens for, avoiding React rendering inside
 * ProseMirror node views.
 */

import Image from '@tiptap/extension-image';
import { buildImageUrl, isPlaceholderUrl, downloadFile } from '../../../services/mediaService';

const MIN_WIDTH = 100;
const MIN_HEIGHT = 60;

// Custom event name for opening previews from ProseMirror node views
const PREVIEW_EVENT = 'canvas:open-preview';

export default Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      // Rich metadata
      fileId: {
        default: null,
        parseHTML: element => element.getAttribute('data-file-id'),
        renderHTML: attributes => {
          if (!attributes.fileId) return {};
          return { 'data-file-id': attributes.fileId };
        },
      },
      fileName: {
        default: null,
        parseHTML: element => element.getAttribute('data-file-name'),
        renderHTML: attributes => {
          if (!attributes.fileName) return {};
          return { 'data-file-name': attributes.fileName };
        },
      },
      mimeType: {
        default: null,
        parseHTML: element => element.getAttribute('data-mime-type'),
        renderHTML: attributes => {
          if (!attributes.mimeType) return {};
          return { 'data-mime-type': attributes.mimeType };
        },
      },
      fileSize: {
        default: 0,
        parseHTML: element => parseInt(element.getAttribute('data-file-size'), 10) || 0,
        renderHTML: attributes => {
          if (!attributes.fileSize) return {};
          return { 'data-file-size': String(attributes.fileSize) };
        },
      },
      thumbnailUrl: {
        default: null,
        parseHTML: element => element.getAttribute('data-thumbnail-url'),
        renderHTML: attributes => {
          if (!attributes.thumbnailUrl) return {};
          return { 'data-thumbnail-url': attributes.thumbnailUrl };
        },
      },
      // Display attributes
      alt: {
        default: null,
        parseHTML: element => element.getAttribute('alt'),
        renderHTML: attributes => {
          if (!attributes.alt) return {};
          return { alt: attributes.alt };
        },
      },
      width: {
        default: '100%',
        parseHTML: element => element.getAttribute('width') || element.style.width || '100%',
        renderHTML: attributes => {
          if (!attributes.width) return {};
          const w = attributes.width;
          const widthVal = typeof w === 'number' ? `${w}px` : w;
          return {
            width: typeof w === 'number' ? w : undefined,
            style: `width: ${widthVal}; max-width: 100%; height: auto; display: block; border-radius: 8px; margin: 12px 0; cursor: pointer;`,
          };
        },
      },
      height: {
        default: 'auto',
        parseHTML: element => element.getAttribute('height') || element.style.height || 'auto',
        renderHTML: attributes => {
          if (!attributes.height || attributes.height === 'auto') return {};
          const h = attributes.height;
          const heightVal = typeof h === 'number' ? `${h}px` : h;
          return {
            height: typeof h === 'number' ? h : undefined,
            style: `height: ${heightVal};`,
          };
        },
      },
      loading: {
        default: false,
        parseHTML: element => element.getAttribute('data-loading') === 'true',
        renderHTML: attributes => {
          if (!attributes.loading) return {};
          return {
            'data-loading': 'true',
            style: 'opacity: 0.4; filter: blur(2px); min-height: 120px; background: var(--bg-secondary); border-radius: 8px;',
          };
        },
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let currentNode = node;
      const container = document.createElement('div');
      container.className = 'canvas-image-node-container';
      container.style.cssText = 'position: relative; margin: 12px 0; display: inline-block; max-width: 100%;';

      // ── Image element ──────────────────────────────────────────────────
      const img = document.createElement('img');
      img.alt = currentNode.attrs.alt || currentNode.attrs.fileName || '';

      let imgStyle = 'max-width: 100%; height: auto; border-radius: 8px; display: block; cursor: pointer; border: 1px solid var(--border-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.04);';
      const storedWidth = currentNode.attrs.width;
      const storedHeight = currentNode.attrs.height;
      if (storedWidth && storedWidth !== '100%') {
        imgStyle += ` width: ${typeof storedWidth === 'number' ? storedWidth + 'px' : storedWidth};`;
      }
      if (storedHeight && storedHeight !== 'auto') {
        imgStyle += ` height: ${typeof storedHeight === 'number' ? storedHeight + 'px' : storedHeight};`;
      }
      img.style.cssText = imgStyle;

      // ── Loading placeholder ────────────────────────────────────────────
      const loadingPlaceholder = document.createElement('div');
      loadingPlaceholder.style.cssText = [
        'display: none',
        'align-items: center',
        'justify-content: center',
        'gap: 8px',
        'padding: 20px 24px',
        'background: var(--bg-secondary)',
        'border: 1px dashed var(--border-primary)',
        'border-radius: 10px',
        'margin: 12px 0',
        'color: var(--text-muted)',
        'font-size: 13px',
      ].join(';');
      loadingPlaceholder.innerHTML = '<div style="width:20px;height:20px;border:2px solid var(--border-primary);border-top-color:var(--accent-primary);border-radius:50%;animation:spin 0.8s linear infinite;"></div><span>Loading image...</span>';

      // ── Error placeholder ──────────────────────────────────────────────
      const errorPlaceholder = document.createElement('div');
      errorPlaceholder.style.cssText = [
        'display: none',
        'align-items: center',
        'justify-content: center',
        'gap: 8px',
        'padding: 20px 24px',
        'background: var(--bg-secondary)',
        'border: 1px dashed var(--border-primary)',
        'border-radius: 10px',
        'margin: 12px 0',
        'color: var(--text-muted)',
        'font-size: 13px',
        'cursor: pointer',
      ].join(';');
      errorPlaceholder.innerHTML = '<span>🖼️</span><span>Image failed to load — click to retry</span>';

      // ── Load Logic ─────────────────────────────────────────────────────
      let currentBlobUrl = null;
      
      const loadImage = async (src, fileId) => {
        // If it's a local object URL or data URL
        if (src && (src.startsWith('blob:') || src.startsWith('data:'))) {
          img.src = src;
          loadingPlaceholder.style.display = 'none';
          errorPlaceholder.style.display = 'none';
          img.style.display = 'block';
          return;
        }

        const imageFile = {
          secureUrl: src,
          fileId: fileId,
          _id: fileId,
          assetId: fileId,
        };
        const resolvedUrl = buildImageUrl(imageFile);

        if (!resolvedUrl || isPlaceholderUrl(resolvedUrl)) {
          img.style.display = 'none';
          errorPlaceholder.style.display = 'none';
          loadingPlaceholder.style.display = 'flex';
          return;
        }

        // We have a remote URL. Need to fetch securely!
        loadingPlaceholder.style.display = 'flex';
        img.style.display = 'none';
        errorPlaceholder.style.display = 'none';

        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
          currentBlobUrl = null;
        }

        try {
          const blob = await downloadFile(imageFile);
          currentBlobUrl = URL.createObjectURL(blob);
          img.src = currentBlobUrl;
        } catch (e) {
          console.error('[ImageNode] Failed to securely load image:', e);
          loadingPlaceholder.style.display = 'none';
          errorPlaceholder.style.display = 'flex';
        }
      };

      // Trigger initial load
      loadImage(currentNode.attrs.src, currentNode.attrs.fileId);

      errorPlaceholder.addEventListener('click', (e) => {
        e.stopPropagation();
        loadImage(currentNode.attrs.src, currentNode.attrs.fileId);
      });

      img.addEventListener('error', () => {
        if (!currentBlobUrl && img.src && !img.src.startsWith('blob:') && !img.src.startsWith('data:')) {
          img.style.display = 'none';
          loadingPlaceholder.style.display = 'none';
          errorPlaceholder.style.display = 'flex';
        }
      });

      img.addEventListener('load', () => {
        loadingPlaceholder.style.display = 'none';
        errorPlaceholder.style.display = 'none';
        img.style.display = 'block';
      });

      // ── Loading state ──────────────────────────────────────────────────
      if (currentNode.attrs.loading) {
        img.style.opacity = '0.4';
        img.style.filter = 'blur(2px)';
        img.style.minHeight = '120px';
        img.style.background = 'var(--bg-secondary)';
      }

      // ── Click to preview via custom event ──────────────────────────────
      let isResizing = false;

      img.addEventListener('click', (e) => {
        if (isResizing) return;
        e.stopPropagation();
        e.preventDefault(); // CRITICAL: prevents any navigation/redirect

        if (!currentNode.attrs.src || currentNode.attrs.loading) return;

        // Build complete file metadata for preview modal
        const fileData = {
          _id: currentNode.attrs.fileId,
          fileId: currentNode.attrs.fileId,
          assetId: currentNode.attrs.fileId,
          url: currentNode.attrs.src,
          src: currentNode.attrs.src,
          secureUrl: currentNode.attrs.src,
          fileName: currentNode.attrs.fileName || 'Image',
          name: currentNode.attrs.fileName || 'Image',
          originalName: currentNode.attrs.fileName || 'Image',
          mimeType: currentNode.attrs.mimeType || 'image/png',
          type: currentNode.attrs.mimeType || 'image/png',
          fileSize: currentNode.attrs.fileSize || 0,
          size: currentNode.attrs.fileSize || 0,
          thumbnailUrl: currentNode.attrs.thumbnailUrl || currentNode.attrs.src,
          alt: currentNode.attrs.alt || '',
        };

        // Dispatch custom event for parent component to handle
        const event = new CustomEvent(PREVIEW_EVENT, {
          bubbles: true,
          cancelable: true,
          detail: { file: fileData },
        });
        container.dispatchEvent(event);
      });

      // ── Resize handle ──────────────────────────────────────────────────
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'canvas-image-resize-handle';
      resizeHandle.style.cssText = [
        'position: absolute',
        'bottom: 4px',
        'right: 4px',
        'width: 14px',
        'height: 14px',
        'background: var(--accent-primary)',
        'border-radius: 3px',
        'cursor: se-resize',
        'opacity: 0',
        'transition: opacity 150ms',
        'z-index: 10',
        'border: 2px solid white',
        'box-shadow: 0 1px 3px rgba(0,0,0,0.3)',
      ].join(';');

      container.addEventListener('mouseenter', () => { resizeHandle.style.opacity = '1'; });
      container.addEventListener('mouseleave', () => {
        if (!isResizing) resizeHandle.style.opacity = '0';
      });

      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        resizeHandle.style.opacity = '1';

        const rect = img.getBoundingClientRect();
        const naturalWidth = rect.width;
        const naturalHeight = rect.height;
        const aspectRatio = naturalWidth / naturalHeight;
        const startX = e.clientX;
        const startWidth = naturalWidth;
        const editorEl = editor.view?.dom;
        const maxAllowedWidth = editorEl
          ? editorEl.getBoundingClientRect().width - 40
          : window.innerWidth - 40;

        const onMouseMove = (moveEvent) => {
          moveEvent.preventDefault();
          const deltaX = moveEvent.clientX - startX;
          let newWidth = Math.round(startWidth + deltaX);
          newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, maxAllowedWidth));
          const newHeight = Math.round(newWidth / aspectRatio);
          const clampedHeight = Math.max(MIN_HEIGHT, newHeight);
          const clampedWidth = clampedHeight !== newHeight
            ? Math.round(newHeight * aspectRatio)
            : newWidth;
          img.style.width = `${clampedWidth}px`;
          img.style.height = `${clampedHeight}px`;
          img.style.maxWidth = `${clampedWidth}px`;
          showDimensionTooltip(container, clampedWidth, clampedHeight);
        };

        const onMouseUp = (upEvent) => {
          upEvent.preventDefault();
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          removeDimensionTooltip(container);
          resizeHandle.style.opacity = '0';
          const finalRect = img.getBoundingClientRect();
          const finalWidth = Math.round(finalRect.width);
          const finalHeight = Math.round(finalRect.height);
          setTimeout(() => { isResizing = false; }, 100);
          if (typeof getPos === 'function') {
            const pos = getPos();
            if (typeof pos === 'number') {
              try {
                editor.view.dispatch(
                  editor.state.tr.setNodeMarkup(pos, undefined, {
                    ...currentNode.attrs,
                    width: `${finalWidth}px`,
                    height: `${finalHeight}px`,
                  }),
                );
              } catch (err) {
                console.warn('[ImageNode] Failed to persist resize:', err);
              }
            }
          }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      resizeHandle.addEventListener('mousedown', (e) => e.stopPropagation(), true);

      container.appendChild(img);
      container.appendChild(loadingPlaceholder);
      container.appendChild(errorPlaceholder);
      container.appendChild(resizeHandle);

      function showDimensionTooltip(parent, w, h) {
        let tooltip = parent.querySelector('.canvas-image-resize-tooltip');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.className = 'canvas-image-resize-tooltip';
          tooltip.style.cssText = [
            'position: absolute',
            'bottom: -22px',
            'right: 0',
            'background: rgba(0,0,0,0.75)',
            'color: white',
            'font-size: 11px',
            'padding: 2px 6px',
            'border-radius: 4px',
            'pointer-events: none',
            'white-space: nowrap',
            'font-family: var(--font-mono, monospace)',
          ].join(';');
          parent.appendChild(tooltip);
        }
        tooltip.textContent = `${w} × ${h}`;
      }

      function removeDimensionTooltip(parent) {
        const tooltip = parent.querySelector('.canvas-image-resize-tooltip');
        if (tooltip) tooltip.remove();
      }

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'image') return false;

          const oldSrc = currentNode.attrs.src;
          const oldFileId = currentNode.attrs.fileId;
          const newSrc = updatedNode.attrs.src;
          const newFileId = updatedNode.attrs.fileId;

          currentNode = updatedNode;

          if (newSrc !== oldSrc || newFileId !== oldFileId) {
            loadImage(newSrc, newFileId);
          }

          img.alt = updatedNode.attrs.alt || updatedNode.attrs.fileName || '';
          if (updatedNode.attrs.loading) {
            img.style.opacity = '0.4';
            img.style.filter = 'blur(2px)';
            img.style.minHeight = '120px';
            loadingPlaceholder.style.display = 'flex';
          } else {
            img.style.opacity = '1';
            img.style.filter = 'none';
            img.style.minHeight = '';
            // loadImage handles its own loadingPlaceholder toggling, 
            // but we can ensure it's hidden if we have a valid blob or src loaded.
            if (img.src && !isPlaceholderUrl(img.src) && errorPlaceholder.style.display !== 'flex') {
              loadingPlaceholder.style.display = 'none';
            }
          }

          const w = updatedNode.attrs.width;
          const h = updatedNode.attrs.height;
          if (w && w !== '100%') {
            img.style.width = typeof w === 'number' ? `${w}px` : w;
          } else {
            img.style.width = '';
          }
          if (h && h !== 'auto') {
            img.style.height = typeof h === 'number' ? `${h}px` : h;
          } else {
            img.style.height = '';
          }

          return true;
        },
        destroy: () => {
          if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
          }
        },
      };
    };
  },
});