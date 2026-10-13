import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import { canvasAPI } from '../../services/api';
import { buildExtensions, sanitizeDocJSON } from './editor/CanvasEditorCore';
import CanvasTitleEditor from './header/CanvasTitleEditor';
import './styles/canvas-editor.css';
import './styles/canvas-media.css';
import './styles/canvas-cover.css';

function resourceUrl(value) {
  if (!value || typeof value !== 'string') return undefined;
  try { return ['http:', 'https:'].includes(new URL(value, window.location.href).protocol) ? value : undefined; }
  catch { return undefined; }
}

// Public views use semantic media elements, without editor resize/upload controls.
function publicMedia(extension) {
  if (!['image', 'videoBlock', 'audioBlock', 'fileAttachment'].includes(extension.name)) return extension;
  return extension.extend({
    addNodeView: null,
    renderHTML({ node }) {
      const attrs = node.attrs;
      if (extension.name === 'image') return ['img', { src: resourceUrl(attrs.src), alt: attrs.alt || attrs.fileName || '', style: 'max-width:100%;height:auto' }];
      if (extension.name === 'fileAttachment') return ['a', { href: resourceUrl(attrs.url), target: '_blank', rel: 'noopener noreferrer' }, attrs.fileName || attrs.name || 'Attachment'];
      const tag = extension.name === 'videoBlock' ? 'video' : 'audio';
      return [tag, { src: resourceUrl(attrs.src), controls: '', preload: 'metadata', ...(tag === 'video' ? { poster: resourceUrl(attrs.thumbnailUrl), playsinline: '' } : {}), style: 'max-width:100%' }];
    },
  });
}

function PublicDocument({ canvas }) {
  const editor = useEditor({ extensions: buildExtensions({ withCollab: false, user: null }).map(publicMedia),
    editable: false, content: sanitizeDocJSON(canvas.content),
    editorProps: { attributes: { class: 'canvas-prosemirror', 'aria-label': 'Public canvas (view only)' } },
  }, [canvas._id]);
  const cover = canvas.cover;
  return <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
    <p>Public canvas · View only</p>
    {cover && <div aria-label="Canvas cover" style={{ height: 240, borderRadius: 12,
      ...(cover.type === 'image' ? { backgroundImage: `url(${cover.value})`, backgroundSize: 'cover', backgroundPosition: `center ${cover.yOffset ?? 50}%` } : { background: cover.value }) }} />}
    <CanvasTitleEditor canvasId={canvas._id} title={canvas.title} titleDocument={canvas.titleDocument} editable={false} onChange={() => {}} onBlur={() => {}} />
    <EditorContent editor={editor} />
  </main>;
}

export default function PublicCanvas() {
  const { token } = useParams();
  const [result, setResult] = useState({ loading: true });
  useEffect(() => {
    let cancelled = false;
    setResult({ loading: true });
    canvasAPI.getPublic(token).then(response => {
      if (!response.data?.success || !response.data.data?.canvas) throw new Error('Unavailable');
      if (!cancelled) setResult({ canvas: response.data.data.canvas });
    }).catch(() => { if (!cancelled) setResult({ error: 'This canvas link is invalid or sharing has been disabled.' }); });
    return () => { cancelled = true; };
  }, [token]);
  if (result.loading) return <p role="status">Loading canvas…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  return <PublicDocument canvas={result.canvas} />;
}
