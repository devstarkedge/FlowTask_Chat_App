import { getFileKind, normalizeMediaUrl } from './mediaUtils';

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
const mimeByExtension = Object.fromEntries(Object.entries(extensions).map(([mime, extension]) => [extension, mime]));

export function getDownloadableMedia(attachment, message) {
  if (!attachment || message?.isDeleted || message?.pending || message?.type === 'system' || message?.contentType === 'system') return null;
  const rawUrl = attachment.url || attachment.secureUrl;
  if (typeof rawUrl !== 'string' || !/^(https?:\/\/|\/|uploads\/|messages\/files\/)/i.test(rawUrl)) return null;
  const url = normalizeMediaUrl(rawUrl);
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  let name = attachment.originalName || attachment.originalFileName || attachment.fileName || attachment.name || '';
  let mime = attachment.mimeType || attachment.type || '';
  const kind = getFileKind(mime, name, url);
  if (!['image', 'video'].includes(kind)) return null;
  const pathExtension = parsed.pathname.split('.').pop().toLowerCase();
  if (!mime.includes('/')) mime = mimeByExtension[pathExtension] || '';
  if (!name) name = `media.${extensions[mime] || (mimeByExtension[pathExtension] ? pathExtension : kind === 'video' ? 'mp4' : 'jpg')}`;
  else if (!/\.[a-z0-9]{2,5}$/i.test(name)) name += `.${extensions[mime] || (mimeByExtension[pathExtension] ? pathExtension : kind === 'video' ? 'mp4' : 'jpg')}`;
  return { url, name, mime };
}
