import { normalizeMediaUrl } from '../../../utils/mediaUtils';

import { getFilePreviewInfo } from '../../../utils/filePreviewInfo';

import ENV from '../../../config/environment';



export const KIND_COLORS = {

  image: '#1264a3',

  video: '#7c3aed',

  audio: '#10b981',

  archive: '#f97316',

  code: '#f59e0b',

  text: '#6b7280',

  csv: '#10b981',

  spreadsheet: '#10b981',

  pdf: '#ef4444',

  word: '#1264a3',

  presentation: '#eab308',

  file: '#6b7280',

};



export const MEDIA_PREVIEW_KINDS = new Set(['image', 'video', 'audio']);

export const DOCUMENT_PREVIEW_KINDS = new Set(['pdf', 'word', 'spreadsheet', 'csv', 'code']);

export const UNSUPPORTED_PREVIEW_KINDS = new Set(['archive', 'presentation', 'file', 'none']);



export function formatFileSize(bytes) {

  if (!bytes) return '';

  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

}



export function formatDuration(millis) {

  if (!millis) return '0:00';

  const totalSec = Math.floor(millis / 1000);

  const min = Math.floor(totalSec / 60);

  const sec = totalSec % 60;

  return `${min}:${sec.toString().padStart(2, '0')}`;

}



export function getAuthHeaders() {

  const headers = {};

  try {

    const { useAuthStore } = require('../../../stores/authStore');

    const { useWorkspaceStore } = require('../../../stores/workspaceStore');

    const token = useAuthStore.getState().accessToken;

    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;

    if (token) headers.Authorization = `Bearer ${token}`;

    if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

  } catch {

    // Stores may be unavailable during early boot

  }

  return headers;

}



function firstUrl(...candidates) {

  for (const value of candidates) {

    if (typeof value === 'string' && value.trim()) return value;

  }

  return '';

}



/**

 * Normalize a chat/files attachment into a consistent preview payload.

 * Uses the same preview rules as the Web App (`getFilePreviewInfo`).

 */

export function resolvePreviewFile(file) {

  if (!file) return null;



  const name = file.originalName || file.originalFileName || file.fileName || file.name || 'File';

  const mime = file.mimeType || file.type || file.contentType || '';



  let fileUrl = normalizeMediaUrl(

    firstUrl(

      file.url,

      file.secureUrl,

      file.secure_url,

      file.path,

      file.uri,

      file.location,

      file.fileUrl,

      file.downloadUrl,

    ),

  );



  const rawThumb = firstUrl(

    file.thumbnailUrl,

    file.thumbUrl,

    file.previewUrl,

    mime.startsWith('image/') ? fileUrl : '',

  );

  let thumbUrl = normalizeMediaUrl(rawThumb);



  const previewInfo = getFilePreviewInfo({

    ...file,

    mimeType: mime,

    originalFileName: name,

    name,

    url: fileUrl,

  });

  const kind = previewInfo.kind;



  if (kind === 'image') {

    const rewriteHeic = (uri) => {

      if (!uri || !uri.includes('res.cloudinary.com')) return uri;

      return uri.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');

    };

    fileUrl = rewriteHeic(fileUrl);

    thumbUrl = rewriteHeic(thumbUrl || fileUrl);

  }



  const apiBase = (ENV.API_BASE_URL || '').replace(/\/api\/chat\/?$/i, '');

  const isMongoId = /^[0-9a-fA-F]{24}$/.test(file._id);

  const proxyUrl = isMongoId ? `${apiBase}/api/chat/messages/files/${file._id}/proxy` : fileUrl;

  const previewUrl = MEDIA_PREVIEW_KINDS.has(kind) ? fileUrl : proxyUrl;



  const headers = getAuthHeaders();



  return {

    name,

    mime,

    size: file.fileSize || file.size || file.fileSizeBytes || 0,

    kind,

    previewInfo,

    isSupported: previewInfo.isSupported,

    fileUrl: previewUrl,

    remoteUrl: fileUrl,

    thumbUrl: thumbUrl || fileUrl,

    headers,

    cacheFile: {

      ...file,

      url: previewUrl,

      originalFileName: name,

      fileName: name,

      mimeType: mime,

    },

  };

}


