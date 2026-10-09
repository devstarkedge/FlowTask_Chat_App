/**
 * Build a TipTap WebView document for the chat message composer.
 * Reuses the same TipTap bundle / bridge as Canvas (EditorHtml.js) —
 * same architecture as the web RichTextEditor — with compact chat CSS.
 */
import { EDITOR_HTML } from '../../screens/Canvas/EditorHtml';

const CHAT_CSS = `
  /* Match native composer — no inner panel; parent supplies background */
  :root {
    --bg-color: transparent;
  }
  html, body, #editor, .ProseMirror {
    background-color: transparent !important;
    background: transparent !important;
  }
  html, body {
    height: auto !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }
  body {
    padding: 2px 4px !important;
    padding-bottom: 4px !important;
  }
  #editor {
    min-height: 0 !important;
  }
  .ProseMirror {
    min-height: 22px !important;
    font-size: 16px !important;
    line-height: 1.4 !important;
    padding: 6px 4px !important;
    padding-bottom: 4px !important;
  }
  .ProseMirror p {
    margin-top: 0 !important;
    margin-bottom: 2px !important;
  }
  .ProseMirror p:last-child {
    margin-bottom: 0 !important;
  }
  .ProseMirror ul, .ProseMirror ol {
    margin-top: 2px !important;
    margin-bottom: 4px !important;
    padding-left: 20px !important;
  }
  .ProseMirror blockquote {
    margin: 4px 0 !important;
  }
  .mention-tag {
    background: rgba(79, 70, 229, 0.15);
    color: var(--accent-color);
    border-radius: 4px;
    padding: 0 3px;
    font-weight: 600;
  }
`;

/**
 * @param {{ placeholder?: string, dark?: boolean, textColor?: string, placeholderColor?: string }} opts
 * @returns {string} full HTML document for WebView
 */
export function buildChatEditorHtml({
  placeholder = 'Message...',
  dark = false,
  textColor,
  placeholderColor,
  linkColor,
} = {}) {
  let html = EDITOR_HTML;

  const themeCss =
    (textColor || placeholderColor || linkColor)
      ? `
  body, .ProseMirror {
    color: ${textColor || 'inherit'} !important;
  }
  .ProseMirror p.is-editor-empty:first-child::before {
    color: ${placeholderColor || '#9ca3af'} !important;
  }
  ${linkColor ? `.ProseMirror a { color: ${linkColor} !important; text-decoration: underline !important; }` : ''}
`
      : '';

  html = html.replace('</style>', `${CHAT_CSS}${themeCss}</style>`);

  const boot = `<script>
    window.CHAT_COMPOSER = true;
    window.EDITOR_PLACEHOLDER = ${JSON.stringify(placeholder)};
  </script>`;

  html = html.replace(/<body([^>]*)>/i, `<body$1 class="${dark ? 'dark' : ''}">${boot}`);

  // Intercept binary clipboard items before TipTap embeds them in document HTML.
  const pasteBridge = `<script>
    document.addEventListener('paste', function(event) {
      var items = event.clipboardData && event.clipboardData.items;
      if (!items) return;
      var files = Array.from(items).filter(function(item) { return item.kind === 'file'; })
        .map(function(item) { return item.getAsFile(); }).filter(Boolean);
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      Promise.all(files.map(function(file) {
        return new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onload = function() { resolve({ uri: reader.result, name: file.name || 'pasted-file', mimeType: file.type || 'application/octet-stream' }); };
          reader.onerror = function() { reject(new Error('The clipboard file could not be read.')); };
          reader.onabort = function() { reject(new Error('Clipboard reading was cancelled.')); };
          reader.readAsDataURL(file);
        });
      })).then(function(files) { sendToRN('pasteFiles', { files: files }); })
        .catch(function(error) { sendToRN('pasteError', { message: error.message }); });
    }, true);
  </script>`;
  // The bundled editor also contains literal </body> strings inside JavaScript.
  // Insert only at the document's closing body, never inside the bundle.
  html = html.replace(/<\/body>(\s*<\/html>\s*)$/i, (_, tail) => `${pasteBridge}</body>${tail}`);

  return html;
}

export default buildChatEditorHtml;
