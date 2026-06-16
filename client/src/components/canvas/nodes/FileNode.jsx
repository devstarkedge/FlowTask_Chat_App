import { Node, mergeAttributes } from '@tiptap/core';

// File type icon mapping
const FILE_ICONS = {
  pdf: '📄',
  doc: '📝',
  docx: '📝',
  xls: '📊',
  xlsx: '📊',
  ppt: '📑',
  pptx: '📑',
  txt: '📃',
  zip: '📦',
  rar: '📦',
  gz: '📦',
  csv: '📊',
  json: '{ }',
  xml: '< />',
  js: '⚡',
  ts: '⚡',
  py: '🐍',
  html: '🌐',
  css: '🎨',
  default: '📎',
};

function getFileIcon(name) {
  if (!name) return FILE_ICONS.default;
  const ext = name.split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (typeof bytes === 'string') return bytes;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default Node.create({
  name: 'fileAttachment',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      url: { default: '' },
      name: { default: 'Attachment' },
      size: { default: '' },
      loading: { default: false },
      fileType: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="file-attachment"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { url, name, size, loading } = node.attrs;
    const icon = getFileIcon(name);
    const displaySize = formatFileSize(size);

    const container = document.createElement('div');
    container.setAttribute('data-type', 'file-attachment');
    container.className = `file-attachment-block ${loading ? 'is-loading' : ''}`;

    // File icon
    const iconSpan = document.createElement('span');
    iconSpan.className = 'file-icon';
    iconSpan.textContent = icon;

    // File info container
    const infoDiv = document.createElement('div');
    infoDiv.className = 'file-info';

    // File name with download link
    const nameLink = document.createElement('a');
    nameLink.className = 'file-name';
    if (url) {
      nameLink.href = url;
      nameLink.target = '_blank';
      nameLink.rel = 'noopener noreferrer';
    }
    nameLink.textContent = name || 'Attachment';

    // File size
    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'file-size';
    sizeSpan.textContent = displaySize;

    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'file-download-btn';
    downloadBtn.textContent = '⬇ Download';
    downloadBtn.style.cssText = 'margin-left: auto; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-primary); background: var(--bg-primary); color: var(--text-link); cursor: pointer; font-size: 12px; font-weight: 500; transition: background 150ms ease;';
    downloadBtn.addEventListener('mouseenter', () => { downloadBtn.style.background = 'var(--bg-hover)'; });
    downloadBtn.addEventListener('mouseleave', () => { downloadBtn.style.background = 'var(--bg-primary)'; });
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (url) {
        window.open(url, '_blank');
      }
    });

    infoDiv.appendChild(nameLink);
    infoDiv.appendChild(sizeSpan);

    if (loading) {
      const loaderSpan = document.createElement('span');
      loaderSpan.className = 'file-loader';
      loaderSpan.textContent = 'Uploading...';
      infoDiv.appendChild(loaderSpan);
    }

    container.appendChild(iconSpan);
    container.appendChild(infoDiv);
    container.appendChild(downloadBtn);

    return container;
  },
});