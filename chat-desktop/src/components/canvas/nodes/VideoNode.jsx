/**
 * VideoNode — Enhanced canvas video node with addNodeView,
 * rich metadata, and preview modal integration.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { buildFileInfo, isPlaceholderUrl } from '../../../services/mediaService';

const PREVIEW_EVENT = 'canvas:open-preview';

export default Node.create({
  name: 'videoBlock',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (element) => {
          const video = element.querySelector('video');
          return video?.getAttribute('src') || '';
        },
        renderHTML: (attributes) => {
          if (!attributes.src) return {};
          return { src: attributes.src };
        },
      },
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
        default: 'video/mp4',
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
      controls: {
        default: true,
        parseHTML: () => true,
        renderHTML: () => ({}),
      },
      width: {
        default: '100%',
        parseHTML: (element) => {
          const video = element.querySelector('video');
          return video?.style?.width || '100%';
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { style: `width: ${attributes.width};` };
        },
      },
      loading: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-loading') === 'true',
        renderHTML: (attributes) => {
          if (!attributes.loading) return {};
          return { 'data-loading': 'true' };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="video-block"]' },
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const { src, fileName, fileId, mimeType, thumbnailUrl, loading } = node.attrs;
      const width = node.attrs.width || '100%';

      const container = document.createElement('div');
      container.setAttribute('data-type', 'video-block');
      container.className = `video-block-container ${loading ? 'is-loading' : ''}`;
      container.style.cssText = 'position: relative; margin: 12px 0; max-width: 100%;';

      if (loading) {
        const placeholder = document.createElement('div');
        placeholder.className = 'video-loading-placeholder';
        placeholder.style.cssText = [
          'display: flex',
          'flex-direction: column',
          'align-items: center',
          'justify-content: center',
          'gap: 8px',
          'min-height: 80px',
          'background: var(--bg-secondary)',
          'border-radius: 10px',
          'border: 1px solid var(--border-primary)',
          'margin: 12px 0',
        ].join(';');
        placeholder.innerHTML = [
          '<div style="width:20px;height:20px;border:2px solid var(--border-primary);border-top-color:var(--accent-primary);border-radius:50%;animation:spin 0.8s linear infinite;"></div>',
          '<span style="font-size:12px;color:var(--text-muted);">Uploading video clip...</span>',
        ].join('');
        container.appendChild(placeholder);
        return { dom: container };
      }

      // Video element
      const video = document.createElement('video');
      video.src = src;
      video.controls = true;
      video.preload = 'metadata';
      video.style.cssText = `width: ${width}; max-width: 100%; border-radius: 10px; display: block; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border: 1px solid var(--border-primary);`;

      // Double-click to open preview modal
      video.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (!src || isPlaceholderUrl(src)) {
          console.warn('[VideoNode] Cannot preview video with placeholder URL');
          return;
        }

        // CRITICAL: Build complete file metadata using centralized builder
        const fileData = buildFileInfo({
          url: src,
          src: src,
          secureUrl: src,
          fileId,
          _id: fileId,
          assetId: fileId,
          fileName: fileName || 'Video',
          name: fileName || 'Video',
          originalName: fileName || 'Video',
          mimeType: mimeType || 'video/mp4',
          type: mimeType || 'video/mp4',
          fileSize: 0,
          size: 0,
          thumbnailUrl: thumbnailUrl || src,
        });

        const event = new CustomEvent(PREVIEW_EVENT, {
          bubbles: true,
          cancelable: true,
          detail: { file: fileData },
        });
        video.dispatchEvent(event);
      });

      container.appendChild(video);

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'videoBlock') return false;
          const newSrc = updatedNode.attrs.src || '';
          if (newSrc !== video.src) {
            video.src = newSrc;
          }
          return true;
        },
      };
    };
  },
});