/**
 * Centralized Media Service for Canvas and Chat file/media operations.
 *
 * Enterprise SaaS pattern: All media-related logic goes through this service
 * to avoid duplication and ensure consistent behavior across the app.
 *
 * Provides:
 *  - File URL resolution (Cloudinary signed URLs, proxy URLs, etc.)
 *  - File type detection and classification
 *  - Download operations with auth headers
 *  - Preview URL generation
 *  - Upload result parsing
 *  - Auth-aware image URL generation for canvas nodes
 *  - Proxy URL building for authenticated file access
 */

import { messageAPI } from './api';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

// ─── Constants ────────────────────────────────────────────────────────────

export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml',
  'image/webp', 'image/bmp', 'image/tiff', 'image/x-icon',
]);

export const VIDEO_MIME_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'video/x-matroska', 'video/mpeg', 'video/ogg',
]);

export const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
  'audio/flac', 'audio/aac', 'audio/x-wav',
]);

export const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff']);
export const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'm4v', 'wmv']);
export const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'wma']);

const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv']);
const CODE_EXTS = new Set(['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'css', 'scss', 'html', 'json', 'xml', 'yaml', 'yml', 'md', 'sql']);

// ─── File Type Detection ─────────────────────────────────────────────────

/**
 * Detect the media kind from MIME type or file extension.
 */
export function detectMediaKind(mimeType = '', fileName = '') {
  const mime = (mimeType || '').toLowerCase();
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';

  if (IMAGE_MIME_TYPES.has(mime) || IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_MIME_TYPES.has(mime) || VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_MIME_TYPES.has(mime) || AUDIO_EXTS.has(ext)) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (DOC_EXTS.has(ext)) return 'document';
  if (CODE_EXTS.has(ext)) return 'code';

  // Fallback: check MIME prefix
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('text/')) return 'code';

  return 'other';
}

/**
 * Get the icon emoji for a file based on extension.
 */
export function getFileIconEmoji(fileName = '') {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  const icons = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    ppt: '📑', pptx: '📑', txt: '📃', csv: '📊', json: '{ }',
    xml: '< />', js: '⚡', ts: '⚡', py: '🐍', html: '🌐',
    css: '🎨', zip: '📦', rar: '📦', gz: '📦', '7z': '📦',
  };
  return icons[ext] || '📎';
}

/**
 * Format file size in human-readable format.
 */
export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const num = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
  if (isNaN(num)) return '';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── URL Resolution ──────────────────────────────────────────────────────

/**
 * Check if a URL is a placeholder (still processing).
 */
export function isPlaceholderUrl(url) {
  if (!url) return true;
  return url === '/placeholder-loading' || url === 'placeholder-loading' || url === '';
}

/**
 * Resolve a file URL from various possible upload response formats.
 * Normalizes across different API responses (Cloudinary, local, etc.)
 */
export function resolveFileUrl(uploadedFile) {
  if (!uploadedFile) return null;
  return (
    uploadedFile.url ||
    uploadedFile.secure_url ||
    uploadedFile.secureUrl ||
    uploadedFile.path ||
    uploadedFile.fileUrl ||
    uploadedFile.location ||
    uploadedFile.downloadUrl ||
    uploadedFile.publicUrl ||
    uploadedFile.downloadURL ||
    (typeof uploadedFile === 'string' && uploadedFile.startsWith('http') ? uploadedFile : null)
  );
}

/**
 * Build an auth-aware image URL that works with Cloudinary proxy.
 * For images that need authentication, generates the proxy URL.
 */
export function buildImageUrl(file) {
  if (!file) return '';

  const rawUrl = file.secureUrl || file.url || file.src || '';
  if (!rawUrl || isPlaceholderUrl(rawUrl)) return '';

  const fileId = file._id || file.fileId || file.assetId;
  if (fileId) {
    return messageAPI.getFileProxyUrl(fileId);
  }

  return rawUrl;
}

/**
 * Resolve the preview URL for a file, preferring thumbnail/preview over full URL.
 */
export function resolvePreviewUrl(file) {
  if (!file) return '';
  const raw = (
    file.thumbnailUrl ||
    file.thumbnail_url ||
    file.previewUrl ||
    file.preview_url ||
    file.url ||
    file.src ||
    file.secureUrl ||
    file.secure_url ||
    ''
  );
  return raw;
}

/**
 * Resolve the download URL for a file.
 * For Cloudinary files, uses the server proxy to avoid CORS/auth issues.
 */
export function resolveDownloadUrl(file) {
  if (!file) return '';
  const assetId = file._id || file.fileId || file.assetId;
  if (assetId) {
    return messageAPI.getFileProxyUrl(assetId);
  }
  return file.url || file.secureUrl || file.secure_url || file.downloadUrl || '';
}

/**
 * Build auth headers for fetching a file from the server.
 */
export function buildAuthHeaders() {
  const token = useAuthStore.getState().accessToken;
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId;
  return headers;
}

/**
 * Build a complete file info object with all metadata for preview modals.
 * Normalizes across different attribute naming conventions.
 */
export function buildFileInfo(attrs) {
  if (!attrs) return null;

  const fileId = attrs.fileId || attrs._id || attrs.assetId || null;
  const fileName = attrs.fileName || attrs.name || attrs.originalName || 'File';
  const mimeType = attrs.mimeType || attrs.type || 'application/octet-stream';
  const fileSize = attrs.fileSize || attrs.size || 0;
  const url = attrs.url || attrs.src || attrs.secureUrl || '';
  const thumbnailUrl = attrs.thumbnailUrl || url;

  return {
    _id: fileId,
    fileId,
    assetId: fileId,
    url,
    src: url,
    secureUrl: url,
    fileName,
    name: fileName,
    originalName: fileName,
    mimeType,
    type: mimeType,
    fileSize,
    size: fileSize,
    thumbnailUrl,
  };
}

// ─── Upload Response Parsing ────────────────────────────────────────────

/**
 * Normalize an upload response into a consistent file metadata object.
 * Handles both message upload responses and canvas-specific uploads.
 *
 * CRITICAL: For async uploads (queue mode), the server returns a placeholder URL.
 * The caller must handle URL resolution when the upload completes.
 */
export function normalizeUploadResult(response, originalFile) {
  // Try various response nesting patterns
  const data = response?.data?.data?.files?.[0] ||
    response?.data?.data?.file ||
    response?.data?.file ||
    response?.data?.data ||
    response?.data ||
    response;

  const url = resolveFileUrl(data);
  const isPlaceholder = isPlaceholderUrl(url);
  const fileId = data?._id || data?.fileId || data?.assetId || data?.publicId || null;
  const mimeType = data?.mimeType || data?.type || data?.mimetype || originalFile?.type || 'application/octet-stream';
  const fileName = data?.originalName || data?.originalname || data?.fileName || originalFile?.name || 'file';
  const fileSize = data?.fileSize || data?.size || originalFile?.size || 0;
  const thumbnailUrl = data?.thumbnailUrl || data?.thumbnail_url || null;
  const downloadUrl = data?.downloadUrl || data?.downloadURL || null;

  return {
    fileId,
    _id: fileId,
    assetId: fileId,
    url,
    secureUrl: url,
    src: url,
    fileName,
    originalName: fileName,
    name: fileName,
    mimeType,
    type: mimeType,
    fileSize: typeof fileSize === 'number' ? fileSize : parseInt(fileSize, 10) || 0,
    size: typeof fileSize === 'number' ? fileSize : parseInt(fileSize, 10) || 0,
    thumbnailUrl,
    downloadUrl,
    isPlaceholder,
    // Preserve original data for downstream consumers
    raw: data,
  };
}

// ─── Download ────────────────────────────────────────────────────────────

/**
 * Download a file by fetching it through the server proxy.
 * Handles authentication and returns the blob for further use.
 */
export async function downloadFile(file, onProgress) {
  const url = resolveDownloadUrl(file);
  if (!url) throw new Error('No URL available for download');

  const headers = buildAuthHeaders();
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status})`);
  }

  const contentLength = +response.headers.get('Content-Length') || 0;
  const reader = response.body?.getReader();

  if (!reader) {
    return response.blob();
  }

  let receivedLength = 0;
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedLength += value.length;
    if (contentLength && onProgress) {
      onProgress(Math.round((receivedLength / contentLength) * 100));
    }
  }

  return new Blob(chunks);
}

/**
 * Trigger a browser download from a blob.
 */
export function triggerDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName || 'download';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}