const FILE_MARKER = /\[flowtask-file:([a-zA-Z0-9]+)\]/g;

export const stripFileMarkers = value => String(value || '').replace(FILE_MARKER, '');
export const hasFileMarkers = value => /\[flowtask-file:[a-zA-Z0-9]+\]/.test(value || '');

const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2]?.replace(/&amp;/g, '&') || '';
};

// Convert pasted editor media into the same queue used by picked attachments.
export async function consumeComposerAttachments({ html = '', text = '' }, resolveMarker) {
  const files = [], consumed = new Set();
  for (const match of String(text).matchAll(FILE_MARKER)) {
    if (consumed.has(match[0])) continue;
    const file = await resolveMarker(match[0]);
    if (!file) throw new Error('This copied file is expired or unavailable in this account/workspace. Copy it again from Files.');
    const id = file._id || file.id || file.fileId?._id || file.fileId;
    if (!id) throw new Error('The copied file has no file reference. Copy it again from Files.');
    files.push({ ...file, _id: id, id, name: file.originalName || file.fileName || file.name,
      url: file.url || file.secureUrl, _tempUri: file.url || file.secureUrl || String(id), status: 'completed' });
    consumed.add(match[0]);
  }
  for (const marker of consumed) {
    html = html.split(marker).join('');
    text = text.split(marker).join('');
  }
  html = html.replace(/<img\b[^>]*>|<video\b[^>]*>[\s\S]*?<\/video>/gi, tag => {
    const uri = attribute(tag, 'src') || attribute(tag.match(/<source\b[^>]*>/i)?.[0] || '', 'src');
    if (!/^(data:(image|video)\/|https?:\/\/|file:\/\/|content:\/\/)/i.test(uri)) return tag;
    const video = /^<video\b/i.test(tag);
    const mimeType = uri.match(/^data:([^;,]+)/)?.[1] || (video ? 'video/mp4' : 'image/png');
    const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || (video ? 'mp4' : 'png');
    files.push({ uri, _tempUri: uri, name: attribute(tag, 'alt') || `pasted-${files.length}.${extension}`, mimeType, status: 'pending' });
    return '';
  });
  return { html, text, files };
}

export function appendComposerAttachments(existing, added) {
  const result = [...existing];
  for (const file of added) {
    const key = file._id || file.id || file._tempUri || file.uri;
    if (!result.some(entry => (entry._id || entry.id || entry._tempUri || entry.uri) === key)) result.push(file);
  }
  return result;
}
