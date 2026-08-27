/**
 * generate-editor-html.js
 * Reads the pre-built editor-bundle.js and generates a new EditorHtml.js
 * where the TipTap bundle is embedded directly into the HTML string.
 * This eliminates ALL runtime network fetches, making it work on Android WebView.
 *
 * Usage: node scripts/generate-editor-html.js
 */

const fs = require('fs');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', 'assets', 'editor-bundle.js');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'screens', 'Canvas', 'EditorHtml.js');

const bundle = fs.readFileSync(BUNDLE_PATH, 'utf-8');
// Escape backticks and ${} in the bundle so it can safely live inside a JS template literal
const escapedBundle = bundle.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const html = `export const EDITOR_HTML = \`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Canvas Editor</title>
  <style>
    :root {
      --bg-color: #ffffff;
      --text-color: #1f2937;
      --border-color: #e5e7eb;
      --placeholder-color: #9ca3af;
      --accent-color: #4f46e5;
      --callout-bg: #f9fafb;
      --callout-border: #d1d5db;
    }

    body.dark {
      --bg-color: #111827;
      --text-color: #f9fafb;
      --border-color: #374151;
      --placeholder-color: #4b5563;
      --accent-color: #6366f1;
      --callout-bg: #1f2937;
      --callout-border: #4b5563;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      transition: background-color 0.2s, color 0.2s;
      min-height: 100vh;
      -webkit-tap-highlight-color: transparent;
    }

    .ProseMirror {
      outline: none;
      min-height: 200px;
      font-size: 16px;
      line-height: 1.6;
    }

    .ProseMirror p { margin-top: 0; margin-bottom: 8px; }

    .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 {
      font-weight: 700;
      margin-top: 24px;
      margin-bottom: 8px;
      line-height: 1.25;
    }

    .ProseMirror h1 { font-size: 1.5em; }
    .ProseMirror h2 { font-size: 1.3em; }
    .ProseMirror h3 { font-size: 1.1em; }

    .ProseMirror ul, .ProseMirror ol {
      padding-left: 24px;
      margin-top: 4px;
      margin-bottom: 12px;
    }

    /* Task List Flexbox Layout */
    .ProseMirror ul[data-type="taskList"] {
      list-style: none;
      padding-left: 0;
    }

    .ProseMirror ul[data-type="taskList"] li {
      display: flex;
      align-items: flex-start;
      margin-bottom: 8px;
      padding: 0;
    }

    .ProseMirror ul[data-type="taskList"] li > label {
      flex: 0 0 auto;
      margin-right: 12px;
      user-select: none;
      display: flex;
      align-items: center;
      padding-top: 4px;
    }

    .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
      margin: 0;
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: var(--accent-color);
    }

    .ProseMirror ul[data-type="taskList"] li > div {
      flex: 1 1 auto;
      min-width: 0;
      line-height: 1.6;
    }

    .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div {
      text-decoration: line-through;
      color: var(--placeholder-color);
    }

    .ProseMirror blockquote {
      border-left: 4px solid var(--accent-color);
      padding-left: 12px;
      margin: 12px 0;
      color: #6b7280;
      font-style: italic;
    }

    body.dark .ProseMirror blockquote { color: #9ca3af; }

    .ProseMirror table {
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
      margin: 16px 0;
      overflow: hidden;
    }

    .ProseMirror td, .ProseMirror th {
      min-width: 1em;
      border: 1px solid var(--border-color);
      padding: 6px 8px;
      vertical-align: top;
      box-sizing: border-box;
      position: relative;
    }

    .ProseMirror th {
      font-weight: bold;
      text-align: left;
      background-color: var(--callout-bg);
    }

    .callout-block {
      display: flex;
      padding: 12px;
      border: 1px solid var(--callout-border);
      border-left: 4px solid var(--accent-color);
      background-color: var(--callout-bg);
      border-radius: 6px;
      margin: 16px 0;
    }

    .callout-icon { font-size: 20px; margin-right: 12px; user-select: none; }
    .callout-content { flex: 1; }

    .ProseMirror p.is-editor-empty:first-child::before {
      color: var(--placeholder-color);
      content: attr(data-placeholder);
      float: left;
      height: 0;
      pointer-events: none;
    }

    ::selection { background-color: rgba(79, 70, 229, 0.2); }

    .mention-tag {
      background-color: rgba(79, 70, 229, 0.1);
      color: var(--accent-color);
      border-radius: 4px;
      padding: 1px 4px;
      font-weight: 500;
      display: inline-block;
    }

    .file-node, .video-node, .audio-node {
      display: flex;
      align-items: center;
      padding: 12px;
      margin: 8px 0;
      background: var(--callout-bg);
      border: 1px solid var(--callout-border);
      border-radius: 6px;
      font-family: monospace;
      color: var(--text-color);
    }

    img { max-width: 100%; height: auto; border-radius: 8px; }
  </style>
</head>
<body>
  <div id="editor"></div>

  <!-- TipTap bundle pre-built by esbuild — no network fetches, works on Android WebView -->
  <script>
${escapedBundle}
  </script>

  <script>
    var TipTap = window.TipTapBundle;
    var Editor = TipTap.Editor;
    var Node = TipTap.Node;
    var mergeAttributes = TipTap.mergeAttributes;
    var StarterKit = TipTap.StarterKit;
    var Placeholder = TipTap.Placeholder;
    var Underline = TipTap.Underline;
    var Highlight = TipTap.Highlight;
    var Link = TipTap.Link;
    var Table = TipTap.Table;
    var TableRow = TipTap.TableRow;
    var TableCell = TipTap.TableCell;
    var TableHeader = TipTap.TableHeader;
    var TaskList = TipTap.TaskList;
    var TaskItem = TipTap.TaskItem;
    var TipTapImage = TipTap.Image;
    var Mention = TipTap.Mention;

    var editor = null;
    var insertMentionCommand = null;

    function sendToRN(type, payload) {
      var msg = Object.assign({ type: type }, payload || {});
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    }

    window.onerror = function(message, source, lineno, colno, error) {
      sendToRN('error', { message: 'window.onerror: ' + message, stack: error ? error.stack : null });
      return false;
    };

    window.addEventListener('unhandledrejection', function(event) {
      sendToRN('error', { message: 'unhandledrejection: ' + (event.reason ? event.reason.message : 'unknown') });
    });

    // ── Custom Node Definitions ───────────────────────────────────────────
    var CalloutNode = Node.create({
      name: 'callout',
      group: 'block',
      content: 'inline*',
      defining: true,
      addAttributes: function() {
        return { type: { default: 'info' }, emoji: { default: '\\uD83D\\uDCA1' } };
      },
      parseHTML: function() { return [{ tag: 'div[data-type="callout"]' }]; },
      renderHTML: function(ref) {
        var node = ref.node; var HTMLAttributes = ref.HTMLAttributes;
        return [
          'div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'callout-block callout-' + node.attrs.type }),
          ['span', { class: 'callout-icon', contenteditable: 'false' }, node.attrs.emoji],
          ['div', { class: 'callout-content' }, 0],
        ];
      }
    });

    var FileNode = Node.create({
      name: 'file',
      group: 'block',
      atom: true,
      addAttributes: function() {
        return { fileId: { default: null }, fileName: { default: '' }, fileSize: { default: 0 }, url: { default: '' } };
      },
      parseHTML: function() { return [{ tag: 'div[data-type="file"]' }]; },
      renderHTML: function(ref) {
        var node = ref.node;
        return ['div', { 'data-type': 'file', class: 'file-node' }, '\\uD83D\\uDCCE File: ' + (node.attrs.fileName || 'Unknown')];
      }
    });

    var VideoNode = Node.create({
      name: 'video',
      group: 'block',
      atom: true,
      addAttributes: function() { return { fileId: { default: null }, url: { default: '' }, fileName: { default: '' } }; },
      parseHTML: function() { return [{ tag: 'div[data-type="video"]' }]; },
      renderHTML: function(ref) {
        var node = ref.node;
        return ['div', { 'data-type': 'video', class: 'video-node' }, '\\uD83C\\uDFA5 Video: ' + (node.attrs.fileName || 'Unknown')];
      }
    });

    var AudioNode = Node.create({
      name: 'audio',
      group: 'block',
      atom: true,
      addAttributes: function() { return { fileId: { default: null }, url: { default: '' }, fileName: { default: '' } }; },
      parseHTML: function() { return [{ tag: 'div[data-type="audio"]' }]; },
      renderHTML: function(ref) {
        var node = ref.node;
        return ['div', { 'data-type': 'audio', class: 'audio-node' }, '\\uD83C\\uDFB5 Audio: ' + (node.attrs.fileName || 'Unknown')];
      }
    });

    var TemplateVariableNode = Node.create({
      name: 'templateVariable',
      group: 'inline',
      inline: true,
      selectable: false,
      atom: true,
      addAttributes: function() { return { name: { default: '' }, placeholder: { default: '' } }; },
      parseHTML: function() { return [{ tag: 'span[data-type="templateVariable"]' }]; },
      renderHTML: function(ref) {
        var node = ref.node; var HTMLAttributes = ref.HTMLAttributes;
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'templateVariable', style: 'background:rgba(0,0,0,0.1);border-radius:3px;padding:0 4px;' }), '{' + node.attrs.name + '}'];
      }
    });

    try {
      editor = new Editor({
        element: document.querySelector('#editor'),
        extensions: [
          StarterKit.configure({ history: true }),
          Placeholder.configure({ placeholder: 'Type something or "/" for commands...' }),
          Underline,
          Highlight.configure({ multicolor: true }),
          Link.configure({ openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
          Table.configure({ resizable: true }),
          TableRow,
          TableHeader,
          TableCell,
          TaskList,
          TaskItem.configure({ nested: true }),
          TipTapImage.configure({ inline: true, allowBase64: true }),
          CalloutNode,
          FileNode,
          VideoNode,
          AudioNode,
          TemplateVariableNode,
          Mention.configure({
            HTMLAttributes: { class: 'mention-tag' },
            suggestion: {
              char: '@',
              startOfLine: false,
              command: function(ref) {
                var editorRef = ref.editor; var range = ref.range; var props = ref.props;
                editorRef.chain().focus().insertContentAt(range, [{ type: 'mention', attrs: props }]).insertContent(' ').run();
              },
              render: function() {
                return {
                  onStart: function(props) {
                    insertMentionCommand = props.command;
                    sendToRN('mentionQuery', { query: props.query });
                  },
                  onUpdate: function(props) {
                    insertMentionCommand = props.command;
                    sendToRN('mentionQuery', { query: props.query });
                  },
                  onKeyDown: function() { return false; },
                  onExit: function() {
                    insertMentionCommand = null;
                    sendToRN('mentionClose');
                  },
                };
              }
            }
          }),
        ],
        content: '',
        onUpdate: function(ref) {
          var e = ref.editor;
          sendToRN('update', { html: e.getHTML(), json: e.getJSON(), text: e.getText() });
        },
        onSelectionUpdate: function(ref) {
          var e = ref.editor;
          sendToRN('selection', {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            strike: e.isActive('strike'),
            code: e.isActive('code'),
            blockquote: e.isActive('blockquote'),
            bulletList: e.isActive('bulletList'),
            orderedList: e.isActive('orderedList'),
            taskList: e.isActive('taskList'),
            heading: e.isActive('heading') ? e.getAttributes('heading').level : null,
            canUndo: e.can().undo(),
            canRedo: e.can().redo()
          });
        },
        onFocus: function() { sendToRN('focus'); },
        onBlur: function() { sendToRN('blur'); }
      });

      sendToRN('ready', {
        bodyHeight: document.body.clientHeight,
        windowHeight: window.innerHeight,
        userAgent: navigator.userAgent
      });
    } catch(e) {
      sendToRN('error', { message: 'Editor init failed: ' + e.message, stack: e.stack });
    }

    function handleMessage(event) {
      var data;
      try { data = JSON.parse(event.data); } catch(err) { return; }
      if (!editor) return;
      var command = data.command;
      var value = data.value;
      sendToRN('log', { message: 'WebView received command: ' + command });
      switch(command) {
        case 'setContent':
          try {
            editor.commands.setContent(value || '');
            sendToRN('setContentAck', { success: true, docLength: editor.getText().length });
          } catch(err) {
            sendToRN('error', { message: 'setContent failed: ' + err.message, stack: err.stack });
          }
          break;
        case 'setEditable':   editor.setEditable(!!value); break;
        case 'setTheme':
          if (value === 'dark') document.body.classList.add('dark');
          else document.body.classList.remove('dark');
          break;
        case 'toggleBold':          editor.chain().focus().toggleBold().run(); break;
        case 'toggleItalic':        editor.chain().focus().toggleItalic().run(); break;
        case 'toggleUnderline':     editor.chain().focus().toggleUnderline().run(); break;
        case 'toggleStrike':        editor.chain().focus().toggleStrike().run(); break;
        case 'toggleCode':          editor.chain().focus().toggleCode().run(); break;
        case 'toggleBlockquote':    editor.chain().focus().toggleBlockquote().run(); break;
        case 'toggleBulletList':    editor.chain().focus().toggleBulletList().run(); break;
        case 'toggleOrderedList':   editor.chain().focus().toggleOrderedList().run(); break;
        case 'toggleTaskList':      editor.chain().focus().toggleTaskList().run(); break;
        case 'setHeading':
          if (value) editor.chain().focus().toggleHeading({ level: value }).run();
          else editor.chain().focus().setParagraph().run();
          break;
        case 'insertTable':         editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
        case 'insertHorizontalRule': editor.chain().focus().setHorizontalRule().run(); break;
        case 'undo':                editor.chain().focus().undo().run(); break;
        case 'redo':                editor.chain().focus().redo().run(); break;
        case 'insertImage':         editor.chain().focus().setImage({ src: value }).run(); break;
        case 'insertMention':
          if (insertMentionCommand && value) {
            insertMentionCommand(value);
            insertMentionCommand = null;
          }
          break;
      }
    }
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);
  </script>
</body>
</html>
\`;
`;

fs.writeFileSync(OUTPUT_PATH, html, 'utf-8');
const size = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1);
console.log(`✅ EditorHtml.js generated at: ${OUTPUT_PATH} (${size} KB)`);
