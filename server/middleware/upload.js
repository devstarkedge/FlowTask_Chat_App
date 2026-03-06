import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import env from '../config/environment.js';
import { ValidationError } from './errorHandler.js';

/**
 * Multer upload middleware — handles file uploads with disk storage.
 * Files are stored in the configured UPLOAD_DIR with unique filenames.
 */

// Ensure upload directory exists
const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed MIME types
// NOTE: SVG excluded due to XSS risk (can embed JavaScript)
const ALLOWED_TYPES = new Set([
  // Images (SVG excluded — XSS vector)
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain', 'text/csv', 'text/markdown',
  // Archives
  'application/zip', 'application/x-rar-compressed', 'application/gzip',
  // Code / data
  'application/json', 'application/xml',
]);

// Mime-to-extension mapping for safe filename generation
const MIME_TO_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav',
  'application/pdf': '.pdf', 'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt', 'text/csv': '.csv', 'text/markdown': '.md',
  'application/zip': '.zip', 'application/x-rar-compressed': '.rar', 'application/gzip': '.gz',
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

// File filter
function fileFilter(_req, file, cb) {
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
      return next(new ValidationError(`File too large. Max size: ${env.MAX_FILE_SIZE / 1024 / 1024}MB`));
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(new ValidationError('Too many files. Max: 10 files per upload'));
    }
    return next(new ValidationError(err.message));
  }
  next(err);
}
