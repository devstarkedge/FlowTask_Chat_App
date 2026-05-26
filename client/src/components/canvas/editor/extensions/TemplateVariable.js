import { Node } from '@tiptap/core'

// Inline atom node representing a template variable placeholder.
// Usage in HTML: <span data-variable="name" class="template-variable">{{name}}</span>
export default Node.create({
  name: 'templateVariable',
  inline: true,
  group: 'inline',
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      name: { default: '' },
      value: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-variable]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const name = HTMLAttributes.name || ''
    const value = HTMLAttributes.value || ''
    const display = value || `{{${name}}}`
    return ['span', { 'data-variable': name, class: 'template-variable' }, display]
  },

  addCommands() {
    return {
      insertTemplateVariable: (attrs) => ({ commands }) => {
        return commands.insertContent({ type: this.name, attrs })
      },
    }
  },
})
