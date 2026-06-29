/**
 * AudioNode — Enhanced canvas audio node with addNodeView,
 * rich metadata, and preview modal integration.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { buildFileInfo, isPlaceholderUrl } from '../../../services/mediaService';

const PREVIEW_EVENT = 'canvas:open-preview';

export default Node.create({
  name: 'audioBlock',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (element) => {
          const audio = element.querySelector('audio');
          return audio?.getAttribute('src') || '';
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
        default: 'audio/mpeg',
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
      controls: {
        default: true,
        parseHTML: () => true,
        renderHTML: () => ({}),
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
      { tag: 'div[data-type="audio-block"]' },
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const { src, fileName, fileId, mimeType, loading } = node.attrs;

      const container = document.createElement('div');
      container.setAttribute('data-type', 'audio-block');
      container.className = `audio-block-container ${loading ? 'is-loading' : ''}`;
      container.style.cssText = 'margin: 12px 0; max-width: 100%;';

      if (loading) {
        const placeholder = document.createElement('div');
        placeholder.className = 'audio-loading-placeholder';
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
          '<span style="font-size:12px;color:var(--text-muted);">Uploading audio clip...</span>',
        ].join('');
        container.appendChild(placeholder);
        return { dom: container };
      }

      // Audio element
      const audio = document.createElement('audio');
      audio.src = src;
      audio.controls = true;
      audio.preload = 'metadata';
      audio.style.cssText = 'width: 100%; display: block; border-radius: 8px;';

      // Double-click to open preview modal
      audio.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (!src || isPlaceholderUrl(src)) {
          console.warn('[AudioNode] Cannot preview audio with placeholder URL');
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
          fileName: fileName || 'Audio',
          name: fileName || 'Audio',
          originalName: fileName || 'Audio',
          mimeType: mimeType || 'audio/mpeg',
          type: mimeType || 'audio/mpeg',
          fileSize: 0,
          size: 0,
          thumbnailUrl: null,
        });

        const event = new CustomEvent(PREVIEW_EVENT, {
          bubbles: true,
          cancelable: true,
          detail: { file: fileData },
        });
        audio.dispatchEvent(event);
      });

      container.appendChild(audio);

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'audioBlock') return false;
          const newSrc = updatedNode.attrs.src || '';
          if (newSrc !== audio.src) {
            audio.src = newSrc;
          }
          return true;
        },
      };
    };
  },
});