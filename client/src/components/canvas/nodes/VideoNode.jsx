import { Node, mergeAttributes } from '@tiptap/core';

export default Node.create({
  name: 'videoBlock',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: '' },
      controls: { default: true },
      width: { default: '100%' },
      loading: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="video-block"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, controls, width, loading } = node.attrs;
    if (loading) {
      return [
        'div',
        { class: 'video-loading-placeholder' },
        ['span', { class: 'video-loader-spinner' }],
        ['span', { class: 'video-loader-text' }, 'Uploading video clip...'],
      ];
    }
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'video-block',
        class: 'video-block-container',
      }),
      [
        'video',
        {
          src,
          controls: controls ? 'true' : null,
          style: `width: ${width}; max-width: 100%; border-radius: 8px;`,
        },
      ],
    ];
  },
});
