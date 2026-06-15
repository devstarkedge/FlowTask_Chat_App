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
            style: `width: ${attributes.width}; max-width: 100%; height: auto; display: block; border-radius: 8px;`,
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
            style: 'opacity: 0.4; filter: blur(2px); min-height: 120px; background: var(--bg-secondary);',
          };
        },
      },
    };
  },
});