/**
 * build-editor.js
 * Bundles all TipTap extensions into a single IIFE file (editor-bundle.js)
 * so the Canvas WebView editor works on Android without any external network fetches.
 *
 * Usage: node scripts/build-editor.js
 * Output: assets/editor-bundle.js
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const ENTRY_PATH = path.join(__dirname, 'editor-entry.js');
const OUT_PATH = path.join(__dirname, '..', 'assets', 'editor-bundle.js');

// Create a temporary entry file that imports and re-exports everything
const entryCode = `
import { Editor, Node, mergeAttributes, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';

// Expose everything on window so the inline HTML script can access them
window.TipTapBundle = {
  Editor,
  Node,
  mergeAttributes,
  Extension,
  StarterKit,
  Placeholder,
  Underline,
  Highlight,
  Link,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  TaskList,
  TaskItem,
  Image,
  Mention,
};
`;

fs.writeFileSync(ENTRY_PATH, entryCode, 'utf-8');

console.log('Building TipTap editor bundle...');

esbuild.build({
  entryPoints: [ENTRY_PATH],
  bundle: true,
  format: 'iife',
  globalName: '__TipTapLoader__',
  outfile: OUT_PATH,
  minify: true,
  target: ['es2020'],
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
}).then(() => {
  fs.unlinkSync(ENTRY_PATH); // clean up temp entry
  const size = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
  console.log(`✅ Bundle created at: ${OUT_PATH} (${size} KB)`);
}).catch((err) => {
  fs.unlinkSync(ENTRY_PATH);
  console.error('❌ Build failed:', err);
  process.exit(1);
});
