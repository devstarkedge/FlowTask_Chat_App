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
  html {
    height: 100% !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
  }
  body {
    min-height: 100% !important;
    margin: 0 !important;
    padding: 2px 4px !important;
    padding-bottom: 6px !important;
    box-sizing: border-box !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
  }
  #editor {
    min-height: 0 !important;
    height: auto !important;
  }
  .ProseMirror {
    min-height: 22px !important;
    font-size: 16px !important;
    line-height: 1.4 !important;
    padding: 6px 4px !important;
    padding-bottom: 6px !important;
    box-sizing: border-box !important;
    word-break: break-word !important;
    overflow-wrap: break-word !important;
    outline: none !important;
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
  /* Slim, elegant scrollbar for internal scrolling */
  ::-webkit-scrollbar {
    width: 4px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(140, 140, 140, 0.35);
    border-radius: 4px;
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
  // Helper to ensure the active cursor / typing position stays visible inside the scrollable editor
  const scrollHelper = `<script>
    (function() {
      function scrollActiveCursorIntoView() {
        if (!window.CHAT_COMPOSER || window.IS_INITIALIZING_CONTENT) return;
        try {
          var sel = window.getSelection();
          if (!sel || !sel.rangeCount) return;
          var range = sel.getRangeAt(0);
          var rect = range.getBoundingClientRect();
          if (rect && (rect.height > 0 || rect.width > 0)) {
            var vh = window.innerHeight || document.documentElement.clientHeight;
            if (rect.bottom > vh - 6) {
              window.scrollBy({ top: rect.bottom - vh + 12, behavior: 'smooth' });
            } else if (rect.top < 6) {
              window.scrollBy({ top: rect.top - 8, behavior: 'smooth' });
            }
          }
        } catch(e) {}
      }

      function onUserInteract() {
        window.IS_INITIALIZING_CONTENT = false;
      }

      document.addEventListener('selectionchange', function() {
        requestAnimationFrame(scrollActiveCursorIntoView);
      });
      document.addEventListener('keyup', function() {
        onUserInteract();
        requestAnimationFrame(scrollActiveCursorIntoView);
      });
      document.addEventListener('input', function() {
        onUserInteract();
        requestAnimationFrame(scrollActiveCursorIntoView);
      });
      document.addEventListener('touchstart', onUserInteract, { passive: true });
      document.addEventListener('pointerdown', onUserInteract, { passive: true });
      document.addEventListener('mousedown', onUserInteract, { passive: true });
    })();
  </script>`;

  // The bundled editor also contains literal </body> strings inside JavaScript.
  // Insert only at the document's closing body, never inside the bundle.
  html = html.replace(/<\/body>(\s*<\/html>\s*)$/i, (_, tail) => `${pasteBridge}${scrollHelper}</body>${tail}`);

  return html;
}

export default buildChatEditorHtml;
