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
        renderHTML: attributes => {
          if (!attributes.loading) return {};
          return {
            class: 'image-loading-placeholder',
          };
        },
      },
    };
  },
});
