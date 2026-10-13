import { ValidationError } from '../../middleware/errorHandler.js';

export function normalizeCanvasTitle(doc) {
  const fail = () => { throw new ValidationError('Title must contain a single paragraph of formatted text'); };
  if (doc?.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length !== 1) fail();
  const paragraph = doc.content[0];
  if (paragraph?.type !== 'paragraph' || (paragraph.content !== undefined && !Array.isArray(paragraph.content))) fail();
  const content = (paragraph.content || []).map(node => {
    if (node.type !== 'text' || typeof node.text !== 'string' || !node.text || (node.marks !== undefined && !Array.isArray(node.marks))) fail();
    const marks = (node.marks || []).map(mark => {
      if (!['bold', 'italic', 'underline', 'strike', 'code', 'link'].includes(mark.type)) fail();
      if (mark.type !== 'link') return { type: mark.type };
      const href = mark.attrs?.href;
      if (typeof href !== 'string' || !/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href)) fail();
      return { type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer' } };
    });
    return { type: 'text', text: node.text, ...(marks.length ? { marks } : {}) };
  });
  const textAlign = paragraph.attrs?.textAlign;
  if (textAlign && !['left', 'center', 'right', 'justify'].includes(textAlign)) fail();
  return { title: content.map(node => node.text).join('').trim() || 'Untitled canvas',
    titleDocument: { type: 'doc', content: [{ type: 'paragraph', ...(textAlign ? { attrs: { textAlign } } : {}), ...(content.length ? { content } : {}) }] } };
}
