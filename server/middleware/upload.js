import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import env from '../config/environment.js';
import { ValidationError } from './errorHandler.js';
import { validateUploadedFileMagic } from '../utils/fileMagicValidator.js';

/**
 * Multer upload middleware — handles file uploads with disk storage.
 * Files are stored in the configured UPLOAD_DIR with unique filenames.
 */

// Ensure upload directory exists
const uploadDir = path.resolve(env.UPLOAD_DIR);
  'image/svg+xml';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  // ── Images (SVG allowed — sanitized by Cloudinary, served as attachment) ──
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',

  // ── Video ─────────────────────────────────────────────────────────────
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/mpeg',

  // ── Audio ─────────────────────────────────────────────────────────────
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac',
  'audio/m4a', 'audio/mp4',

  // ── Documents ─────────────────────────────────────────────────────────
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // ── Text / Markup ─────────────────────────────────────────────────────
  'text/plain', 'text/csv', 'text/markdown', 'text/html', 'text/css',

  // ── Code / Dev files ─────────────────────────────────────────────────
  'text/javascript', 'application/javascript',
  'text/typescript', 'application/typescript',
  'text/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-scss',
  'text/x-sql',
  'text/yaml', 'application/x-yaml',
  'text/x-env',

  // ── Archives ──────────────────────────────────────────────────────────
  'application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed',
  'application/vnd.rar', 'application/x-7z-compressed', 'application/gzip', 'application/x-tar',

  // ── Data ──────────────────────────────────────────────────────────────
  'application/json', 'application/xml',
]);

// Mime-to-extension mapping for safe filename generation
const MIME_TO_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-msvideo': '.avi',
  'image/svg+xml': '.svg',
  'video/webm': '.webm', 'video/mpeg': '.mpeg',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg',
  'audio/flac': '.flac', 'audio/aac': '.aac',
  'audio/m4a': '.m4a', 'audio/mp4': '.mp4',
  'application/pdf': '.pdf', 'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt', 'text/csv': '.csv', 'text/markdown': '.md',
  'text/html': '.html', 'text/css': '.css',
  'text/javascript': '.js', 'application/javascript': '.js',
  'text/typescript': '.ts', 'application/typescript': '.ts',
  'text/x-python': '.py', 'text/x-java-source': '.java',
  'text/x-c': '.c', 'text/x-scss': '.scss',
  'text/x-sql': '.sql', 'text/yaml': '.yaml', 'application/x-yaml': '.yaml',
  'text/x-env': '.env',
  
  'application/json': '.json', 'application/xml': '.xml',
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || path.extname(file.originalname) || '';
    const uniqueName = `${randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

/**
 * Sanitize original filename — strip path traversal, null bytes, and
 * dangerous shell characters while preserving the human-readable name.
 */
function sanitizeFilename(name) {
  return (name || 'file')
    .replace(/[\/\\:*?"<>|\x00]/g, '_') // path separators, shell specials, null byte
    .replace(/\.{2,}/g, '.')             // no double-dots (path traversal)
    .replace(/^[.\s]+|[.\s]+$/g, '')     // no leading/trailing dots or spaces
    .slice(0, 255)                        // enforce max length
    || 'file';
}

// File filter
function fileFilter(_req, file, cb) {
  // Sanitize the original filename on ingress
  file.originalname = sanitizeFilename(file.originalname);

  if (ALLOWED_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ValidationError(`File type not allowed: ${file.mimetype}`), false);
  }
}

/**
 * Upload middleware for multiple files (max 10).
 */
export const uploadFiles = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE, // 10MB default
    files: 10,
  },
}).array('files', 10);

/**
 * Upload middleware for a single file.
 */
export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE,
  },
}).single('file');

/**
 * Error handler wrapper for multer errors.
 */
export function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ValidationError(`File too large. Max size: ${Math.round(env.MAX_FILE_SIZE / 1024 / 1024)}MB`));
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(new ValidationError('Too many files. Max: 10 files per upload'));
    }
    return next(new ValidationError(err.message));
  }
  next(err);
}

// Re-export magic-byte validator so routes can apply it after multer
export { validateUploadedFileMagic };
