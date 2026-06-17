import Image from '@tiptap/extension-image';

// Minimum and maximum resize bounds (pixels)
const MIN_WIDTH = 100;
const MIN_HEIGHT = 60;

export default Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: element => element.getAttribute('width') || element.style.width || '100%',
        renderHTML: attributes => {
          if (!attributes.width) return {};
          const w = attributes.width;
          // If it's a number, treat as px; otherwise use as-is (e.g. "80%", "400px")
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
      alt: {
        default: null,
        parseHTML: element => element.getAttribute('alt'),
        renderHTML: attributes => {
          if (!attributes.alt) return {};
          return { alt: attributes.alt };
        },
      },
      title: {
        default: null,
        parseHTML: element => element.getAttribute('title'),
        renderHTML: attributes => {
          if (!attributes.title) return {};
          return { title: attributes.title };
        },
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const container = document.createElement('div');
      container.className = 'canvas-image-node-container';
      container.style.cssText = 'position: relative; margin: 12px 0; display: inline-block; max-width: 100%;';

      const img = document.createElement('img');
      img.src = node.attrs.src || '';
      img.alt = node.attrs.alt || '';
      // Apply stored dimensions
      const storedWidth = node.attrs.width;
      const storedHeight = node.attrs.height;
      let imgStyle = 'max-width: 100%; height: auto; border-radius: 8px; display: block; cursor: pointer; border: 1px solid var(--border-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.04);';
      if (storedWidth && storedWidth !== '100%') {
        imgStyle += ` width: ${typeof storedWidth === 'number' ? storedWidth + 'px' : storedWidth};`;
      }
      if (storedHeight && storedHeight !== 'auto') {
        imgStyle += ` height: ${typeof storedHeight === 'number' ? storedHeight + 'px' : storedHeight};`;
      }
      img.style.cssText = imgStyle;

      if (node.attrs.loading) {
        img.style.opacity = '0.4';
        img.style.filter = 'blur(2px)';
        img.style.minHeight = '120px';
        img.style.background = 'var(--bg-secondary)';
      }

      // Click to preview — open image in overlay (only when not resizing)
      let isResizing = false;
      img.addEventListener('click', (e) => {
        if (isResizing) return;
        e.stopPropagation();
        if (!node.attrs.src || node.attrs.loading) return;

        const overlay = document.createElement('div');
        overlay.className = 'canvas-image-preview-overlay';
        overlay.style.cssText = 'position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; cursor: pointer; animation: fadeIn 200ms ease;';

        const previewImg = document.createElement('img');
        previewImg.src = node.attrs.src;
        previewImg.style.cssText = 'max-width: 90vw; max-height: 90vh; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); object-fit: contain;';

        overlay.appendChild(previewImg);
        overlay.addEventListener('click', () => overlay.remove());
        document.addEventListener('keydown', function escClose(e) {
          if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escClose); }
        });
        document.body.appendChild(overlay);
      });

      // ── Resize handle (bottom-right corner) ─────────────────────────────
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

      // Show/hide handle on hover
      container.addEventListener('mouseenter', () => { resizeHandle.style.opacity = '1'; });
      container.addEventListener('mouseleave', () => {
        if (!isResizing) resizeHandle.style.opacity = '0';
      });

      // ── Drag-to-resize logic ────────────────────────────────────────────
      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        resizeHandle.style.opacity = '1';

        // Capture natural dimensions at drag start
        const rect = img.getBoundingClientRect();
        const naturalWidth = rect.width;
        const naturalHeight = rect.height;
        const aspectRatio = naturalWidth / naturalHeight;
        const startX = e.clientX;
        const startWidth = naturalWidth;

        // Compute the max width from the container's parent (the editor)
        const editorEl = editor.view?.dom;
        const maxAllowedWidth = editorEl
          ? editorEl.getBoundingClientRect().width - 40  // 40px gutter
          : window.innerWidth - 40;

        const onMouseMove = (moveEvent) => {
          moveEvent.preventDefault();
          const deltaX = moveEvent.clientX - startX;
          let newWidth = Math.round(startWidth + deltaX);

          // Enforce min/max bounds
          newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, maxAllowedWidth));

          // Aspect ratio lock: compute height from width
          const newHeight = Math.round(newWidth / aspectRatio);

          // Enforce minimum height
          const clampedHeight = Math.max(MIN_HEIGHT, newHeight);
          const clampedWidth = clampedHeight !== newHeight
            ? Math.round(newHeight * aspectRatio)
            : newWidth;

          // Live preview (update DOM immediately for smooth UX)
          img.style.width = `${clampedWidth}px`;
          img.style.height = `${clampedHeight}px`;
          img.style.maxWidth = `${clampedWidth}px`;

          // Show dimension tooltip
          showDimensionTooltip(container, clampedWidth, clampedHeight);
        };

        const onMouseUp = (upEvent) => {
          upEvent.preventDefault();
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          removeDimensionTooltip(container);
          resizeHandle.style.opacity = '0';

          // Compute final dimensions
          const finalRect = img.getBoundingClientRect();
          const finalWidth = Math.round(finalRect.width);
          const finalHeight = Math.round(finalRect.height);

          // Reset isResizing after a short delay to prevent click-through
          setTimeout(() => { isResizing = false; }, 100);

          // Persist to ProseMirror node attrs via a transaction
          if (typeof getPos === 'function') {
            const pos = getPos();
            if (typeof pos === 'number') {
              try {
                editor.view.dispatch(
                  editor.state.tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    width: `${finalWidth}px`,
                    height: `${finalHeight}px`,
                  }),
                );
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('[ImageNode] Failed to persist resize:', err);
              }
            }
          }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      // Prevent editor from handling mousedown on the resize handle
      resizeHandle.addEventListener('mousedown', (e) => e.stopPropagation(), true);

      container.appendChild(img);
      container.appendChild(resizeHandle);

      // ── Dimension tooltip helper ────────────────────────────────────────
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
          img.src = updatedNode.attrs.src || '';
          if (updatedNode.attrs.loading) {
            img.style.opacity = '0.4';
            img.style.filter = 'blur(2px)';
            img.style.minHeight = '120px';
          } else {
            img.style.opacity = '1';
            img.style.filter = 'none';
            img.style.minHeight = '';
          }
          // Apply stored dimensions on update (e.g., after collab sync)
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
      };
    };
  },
});
