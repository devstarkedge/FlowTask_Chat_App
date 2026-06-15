import { Node, mergeAttributes } from '@tiptap/core';

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
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'file-attachment',
        class: `file-attachment-block ${loading ? 'is-loading' : ''}`,
      }),
      ['span', { class: 'file-icon' }, '📎'],
      [
        'div',
        { class: 'file-info' },
        [
          'a',
          {
            href: url || '#',
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'file-name',
            onclick: !url ? 'event.preventDefault()' : null,
          },
          name,
        ],
        size ? ['span', { class: 'file-size' }, size] : '',
      ],
      loading ? ['span', { class: 'file-loader' }, 'Uploading...'] : '',
    ];
  },
});
