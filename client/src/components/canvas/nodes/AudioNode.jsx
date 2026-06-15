import { Node, mergeAttributes } from '@tiptap/core';

export default Node.create({
  name: 'audioBlock',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: '' },
      controls: { default: true },
      loading: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="audio-block"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, controls, loading } = node.attrs;
    if (loading) {
      return [
        'div',
        { class: 'audio-loading-placeholder' },
        ['span', { class: 'audio-loader-spinner' }],
        ['span', { class: 'audio-loader-text' }, 'Uploading audio clip...'],
      ];
    }
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'audio-block',
        class: 'audio-block-container',
      }),
      [
        'audio',
        {
          src,
          controls: controls ? 'true' : null,
          style: 'width: 100%;',
        },
      ],
    ];
  },
});
