import Image from '@tiptap/extension-image';

export default Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        renderHTML: attributes => {
          if (!attributes.width) return {};
          return {
            style: `width: ${attributes.width}; max-width: 100%; height: auto; display: block; border-radius: 8px; margin: 12px 0; cursor: pointer;`,
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
      container.style.cssText = 'position: relative; margin: 12px 0;';

      const img = document.createElement('img');
      img.src = node.attrs.src || '';
      img.alt = node.attrs.alt || '';
      img.style.cssText = 'max-width: 100%; height: auto; border-radius: 8px; display: block; cursor: pointer; border: 1px solid var(--border-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.04);';

      if (node.attrs.loading) {
        img.style.opacity = '0.4';
        img.style.filter = 'blur(2px)';
        img.style.minHeight = '120px';
        img.style.background = 'var(--bg-secondary)';
      }

      // Click to preview - open image in overlay
      img.addEventListener('click', (e) => {
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

      // Add resize handle
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'canvas-image-resize-handle';
      resizeHandle.style.cssText = 'position: absolute; bottom: 4px; right: 4px; width: 12px; height: 12px; background: var(--accent-primary); border-radius: 2px; cursor: se-resize; opacity: 0; transition: opacity 150ms;';
      
      container.addEventListener('mouseenter', () => { resizeHandle.style.opacity = '1'; });
      container.addEventListener('mouseleave', () => { resizeHandle.style.opacity = '0'; });

      container.appendChild(img);
      container.appendChild(resizeHandle);

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
          return true;
        },
      };
    };
  },
});