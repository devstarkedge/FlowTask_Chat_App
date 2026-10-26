// Only persisted asset IDs grant access; document URLs are never permissions.
export function canvasAttachmentIds(content) {
  const ids = new Set();
  const media = new Set(['image', 'videoBlock', 'audioBlock', 'fileAttachment']);
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (media.has(node.type)) {
      const value = node.attrs?.fileId;
      const id = String(value?._id || value || '');
      if (/^[a-f\d]{24}$/i.test(id)) ids.add(id);
    }
    for (const child of Array.isArray(node.content) ? node.content : []) visit(child);
  };
  visit(content);
  return [...ids];
}
