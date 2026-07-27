/**
 * getNotificationPreview — shared utility for generating human-readable
 * notification preview text from a message.
 *
 * Used by:
 *  - notificationEngine.js  (real-time push / socket notifications)
 *  - message.service.js     (legacy mention / DM notification helpers)
 *
 * Priority rules:
 *  Case 1: message has text content  → return truncated text
 *  Case 2: no text, has attachments  → return attachment label
 *  Case 3: multiple attachments      → return grouped summary
 *  Case 4: text + attachments        → text wins
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileTypeLabel(mimeType, ext) {
  if (mimeType.startsWith('image/')) return '📷 Image';
  if (mimeType.startsWith('video/')) return '🎥 Video';
  if (mimeType.startsWith('audio/')) return '🎵 Audio';
  if (mimeType === 'application/pdf' || ext === 'pdf') return '📄 PDF File';
  if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext) || mimeType.includes('word') || mimeType.includes('document')) return '📝 Document';
  if (['xls', 'xlsx'].includes(ext) || mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊 Spreadsheet';
  if (ext === 'csv' || mimeType.includes('csv')) return '📊 Spreadsheet';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) return '🗜️ Archive';
  return '📎 File';
}

function sameCategoryLabel(category, count) {
  const emojiMap = {
    image: '📷', video: '🎥', audio: '🎵', pdf: '📄',
    spreadsheet: '📊', document: '📝', archive: '🗜️', other: '📎',
  };
  const nameMap = {
    image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF',
    spreadsheet: 'Spreadsheet', document: 'Document', archive: 'Archive', other: 'File',
  };
  const emoji = emojiMap[category] || '📎';
  const name = nameMap[category] || 'File';
  return `${emoji} ${count} ${name}s`;
}

function categorySingular(category) {
  const map = {
    image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF',
    spreadsheet: 'Spreadsheet', document: 'Document', archive: 'Archive', other: 'File',
  };
  return map[category] || 'File';
}

/**
 * Generate attachment-only preview from a message.
 * Supports both embedded `message.attachments` (legacy) and the modern
 * `message.fileReferences` approach (populated FileReference → FileAsset).
 *
 * @param {object} message - Message document (may be lean or Mongoose doc)
 * @returns {string|null} Human-readable attachment preview, or null if none
 */
export function getAttachmentPreview(message) {
  // ── Native Media Overrides (Audio/Video messages) ─────────
  if (message?.audioMeta?.audioUrl) return '🎵 Audio';
  if (message?.videoMeta?.videoUrl) return '🎥 Video';
  if (message?.gifMeta?.url) return 'GIF';

  const items = [];

  // 1) Embedded attachments (legacy / direct upload metadata)
  if (message?.attachments?.length > 0) {
    for (const a of message.attachments) {
      items.push({
        mimeType: a.mimeType || '',
        originalName: a.originalName || a.fileName || '',
      });
    }
  }

  // 2) Populated fileReferences (modern approach — client sends file IDs,
  //    server creates FileReference records, repository populates fileId)
  if (items.length === 0 && message?.fileReferences?.length > 0) {
    for (const ref of message.fileReferences) {
      const asset = ref.fileId; // Populated FileAsset document
      if (asset && typeof asset === 'object' && asset._id) {
        items.push({
          mimeType: asset.mimeType || '',
          originalName: asset.originalName || asset.fileName || '',
        });
      }
    }
  }

  if (items.length === 0) return null;

  // ── Single file — include the filename when available ──────────────
  if (items.length === 1) {
    const { mimeType, originalName } = items[0];
    const ext = originalName.split('.').pop()?.toLowerCase() || '';
    const label = fileTypeLabel(mimeType, ext);
    return originalName ? `${label}: ${originalName}` : label;
  }

  // ── Multiple files — group by category for a meaningful summary ────
  const groups = { image: 0, video: 0, audio: 0, pdf: 0, spreadsheet: 0, document: 0, archive: 0, other: 0 };

  for (const item of items) {
    const ext = item.originalName.split('.').pop()?.toLowerCase() || '';
    const mime = item.mimeType;
    if (mime.startsWith('image/')) groups.image++;
    else if (mime.startsWith('video/')) groups.video++;
    else if (mime.startsWith('audio/')) groups.audio++;
    else if (mime === 'application/pdf' || ext === 'pdf') groups.pdf++;
    else if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('csv')) groups.spreadsheet++;
    else if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext) || mime.includes('word') || mime.includes('document')) groups.document++;
    else if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mime.includes('zip') || mime.includes('compressed') || mime.includes('archive')) groups.archive++;
    else groups.other++;
  }

  const nonZero = Object.entries(groups).filter(([, v]) => v > 0);

  // All files share the same category
  if (nonZero.length === 1) {
    const [category, count] = nonZero[0];
    return sameCategoryLabel(category, count);
  }

  // Mixed types — human-readable breakdown (e.g. "2 Images + 1 PDF")
  const parts = nonZero.map(([category, count]) => {
    const singular = categorySingular(category);
    return count === 1 ? singular : `${count} ${singular}s`;
  });
  if (parts.length <= 3) {
    return parts.join(' + ');
  }
  return `📎 ${items.length} Files`;
}

/**
 * Generate notification preview text for a message.
 * Text always wins over attachment labels.
 *
 * @param {object} message - Message document
 * @param {Function} [truncateFn] - Optional truncation function (default: identity)
 * @param {Function} [stripHtmlFn] - Optional HTML stripping function (default: identity)
 * @returns {string} Preview text (never empty when message has content or files)
 */
export function getNotificationPreview(message, truncateFn, stripHtmlFn) {
  const strip = stripHtmlFn || ((s) => s);
  const trunc = truncateFn || ((s) => s);

  const textPreview = trunc(strip((message?.content || '').trim()));
  const attachmentPreview = getAttachmentPreview(message);

  return textPreview || attachmentPreview || '';
}

export default getNotificationPreview;
