/**
 * File Magic-Byte Validator
 *
 * Validates uploaded files by checking their actual binary content
 * (magic bytes / file signatures) against the declared MIME type.
 * Prevents MIME-type spoofing attacks (e.g., renaming an .exe to .pdf).
 *
 * Called as a post-upload middleware AFTER multer writes the file to disk.
 */

import fs from "node:fs";
import path from "node:path";
import logger from "./logger.js";

/**
 * Magic byte signatures: each entry maps a MIME type to one or more
 * known file-header signatures (arrays of byte values, null = wildcard).
 *
 * We read only the first 12 bytes to cover all signatures below.
 */
const MAGIC_SIGNATURES = {
  // ── Images ────────────────────────────────────────────────────────────
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ], // GIF87a, GIF89a
  "image/webp": [
    [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  ], // RIFF....WEBP

  // ── Video ─────────────────────────────────────────────────────────────
  "video/mp4": [[0x00, 0x00, 0x00, null, 0x66, 0x74, 0x79, 0x70]], // ....ftyp  (ISO base)
  "video/quicktime": [
    [0x00, 0x00, 0x00, null, 0x66, 0x74, 0x79, 0x70],
    [0x6d, 0x6f, 0x6f, 0x76],
  ], // ftyp or moov
  "video/webm": [[0x1a, 0x45, 0xdf, 0xa3]], // EBML header
  "video/x-msvideo": [[0x52, 0x49, 0x46, 0x46]], // RIFF (AVI)
  "video/mpeg": [
    [0x00, 0x00, 0x01, 0xb3],
    [0x00, 0x00, 0x01, 0xba],
  ], // MPEG-1/2

  // ── Audio ─────────────────────────────────────────────────────────────
  "audio/mpeg": [
    [0xff, 0xfb],
    [0xff, 0xf3],
    [0xff, 0xf2],
    [0x49, 0x44, 0x33],
  ], // MP3 or ID3
  "audio/wav": [[0x52, 0x49, 0x46, 0x46]], // RIFF
  "audio/ogg": [[0x4f, 0x67, 0x67, 0x53]], // OggS
  "audio/flac": [[0x66, 0x4c, 0x61, 0x43]], // fLaC
  "audio/aac": [
    [0xff, 0xf1],
    [0xff, 0xf9],
  ], // ADTS

  // ── Documents ─────────────────────────────────────────────────────────
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  // ZIP-based Office formats (docx, xlsx, pptx) and ODF
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    [0x50, 0x4b, 0x03, 0x04],
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    [0x50, 0x4b, 0x03, 0x04],
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    [0x50, 0x4b, 0x03, 0x04],
  ],
  // Legacy Office formats use OLE2 compound document
  "application/msword": [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  "application/vnd.ms-excel": [
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  ],
  "application/vnd.ms-powerpoint": [
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  ],

  // ── Archives ──────────────────────────────────────────────────────────
  "application/zip": [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
  ], // PK.. (local file / empty)
  "application/x-zip-compressed": [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
  ], // Windows alternate MIME for .zip
  "application/x-rar-compressed": [[0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]], // Rar!
  "application/vnd.rar": [[0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]], // Modern RAR MIME
  "application/x-7z-compressed": [[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]], // 7z
  "application/gzip": [[0x1f, 0x8b]], // gzip
  "application/x-tar": null, // TAR has no universal magic — skip validation

  // ── Text / Code / Data ────────────────────────────────────────────────
  // Text files have no reliable magic bytes; skip strict validation.
  "text/plain": null,
  "text/csv": null,
  "text/markdown": null,
  "text/html": null,
  "image/svg+xml": null,
  "text/css": null,
  "text/javascript": null,
  "text/typescript": null,
  "text/x-python": null,
  "text/x-java-source": null,
  "text/x-c": null,
  "text/x-scss": null,
  "text/x-sql": null,
  "text/yaml": null,
  "text/x-env": null,
  "application/json": null,
  "application/xml": null,
  "application/javascript": null,
  "application/typescript": null,
  "application/x-yaml": null,
};

const HEADER_BYTES_NEEDED = 16;

/**
 * Read the first N bytes of a file as a Buffer.
 * Returns null on error (e.g., file already deleted).
 */
function readHeader(filePath) {
  let fd;
  try {
    const buf = Buffer.alloc(HEADER_BYTES_NEEDED);
    fd = fs.openSync(filePath, "r");
    const bytesRead = fs.readSync(fd, buf, 0, HEADER_BYTES_NEEDED, 0);
    return buf.slice(0, bytesRead);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Check whether `header` matches a single signature pattern.
 * `null` entries in the pattern are wildcards.
 */
function matchesSignature(header, signature) {
  if (header.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (signature[i] !== null && header[i] !== signature[i]) return false;
  }
  return true;
}

/**
 * Detect the actual file type from magic bytes.
 * Returns a human-readable type string for logging.
 */
function detectFileType(header) {
  if (!header || header.length < 4) return "unknown/undetectable";

  const hex = header.toString("hex");
  const sig = Array.from(header.slice(0, 8));

  // PNG
  if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) {
    return "image/png (detected from magic bytes: 89504e47)";
  }
  // JPEG
  if (sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) {
    return "image/jpeg (detected from magic bytes: ffd8ff)";
  }
  // GIF
  if (sig[0] === 0x47 && sig[1] === 0x49 && sig[2] === 0x46) {
    return "image/gif (detected from magic bytes: 474946)";
  }
  // WEBP (RIFF....WEBP)
  if (sig[0] === 0x52 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x46) {
    return "image/webp (detected from magic bytes: RIFF....WEBP)";
  }
  // PDF
  if (sig[0] === 0x25 && sig[1] === 0x50 && sig[2] === 0x44 && sig[3] === 0x46) {
    return "application/pdf (detected from magic bytes: 25504446)";
  }
  // ZIP-based (docx, xlsx, pptx, zip)
  if (sig[0] === 0x50 && sig[1] === 0x4b && sig[2] === 0x03 && sig[3] === 0x04) {
    return "application/zip-based (detected from magic bytes: 504b0304)";
  }
  // OLE2 (old Office: doc, xls, ppt)
  if (
    sig[0] === 0xd0 && sig[1] === 0xcf && sig[2] === 0x11 && sig[3] === 0xe0
  ) {
    return "application/ole2 (old Office format, detected from magic bytes: d0cf11e0)";
  }
  // MP4 / QuickTime
  if (sig[0] === 0x00 && sig[1] === 0x00 && sig[2] === 0x00 && sig[4] === 0x66 && sig[5] === 0x74 && sig[6] === 0x79 && sig[7] === 0x70) {
    return "video/mp4 or video/quicktime (detected from magic bytes: ....ftyp)";
  }
  // WebM
  if (sig[0] === 0x1a && sig[1] === 0x45 && sig[2] === 0xdf && sig[3] === 0xa3) {
    return "video/webm (detected from magic bytes: 1a45dfa3)";
  }
  // MP3
  if (sig[0] === 0xff && (sig[1] === 0xfb || sig[1] === 0xf3 || sig[1] === 0xf2)) {
    return "audio/mpeg (detected from magic bytes: fffb/f3/f2)";
  }
  // FLAC
  if (sig[0] === 0x66 && sig[1] === 0x4c && sig[2] === 0x61 && sig[3] === 0x43) {
    return "audio/flac (detected from magic bytes: 664c6143)";
  }
  // 7z
  if (sig[0] === 0x37 && sig[1] === 0x7a && sig[2] === 0xbc && sig[3] === 0xaf) {
    return "application/x-7z-compressed (detected from magic bytes: 37zbcaf)";
  }
  // RAR
  if (sig[0] === 0x52 && sig[1] === 0x61 && sig[2] === 0x72 && sig[3] === 0x21) {
    return "application/x-rar-compressed (detected from magic bytes: 52617221)";
  }

  return `unknown (first 8 bytes hex: ${hex.slice(0, 16)})`;
}

/**
 * Validate a single file against its declared MIME type.
 *
 * @param {string} filePath   Absolute path on disk
 * @param {string} mimeType   Declared MIME type from multer
 * @param {object} fileInfo   Optional: { originalname, mimetype, size } from multer for enhanced logging
 * @returns {{ valid: boolean, reason?: string, detectedType?: string, declaredType?: string }}
 */
export function validateFileMagic(filePath, mimeType, fileInfo = null) {
  const signatures = MAGIC_SIGNATURES[mimeType];

  // MIME type not in our map — reject unknown types defensively
  if (!(mimeType in MAGIC_SIGNATURES)) {
    const header = readHeader(filePath);
    const detectedType = detectFileType(header);
    logger.warn("fileMagicValidator: MIME type not whitelisted", {
      originalname: fileInfo?.originalname || "unknown",
      declaredMimeType: mimeType,
      detectedType,
      headerHex: header?.toString("hex"),
      headerText: header?.toString("utf8"),
      filePath,
    });
    return {
      valid: false,
      reason: `MIME type not whitelisted: ${mimeType}`,
      detectedType,
      declaredType: mimeType,
    };
  }

  // null entry means "no magic bytes to check" — pass through
  if (signatures === null) {
    return { valid: true };
  }

  const header = readHeader(filePath);

  // Enhanced diagnostic logging
  const detectedType = detectFileType(header);
  const headerHex = header?.toString("hex") || "unreadable";
  const headerText = header?.toString("utf8") || "unreadable";

  logger.info("fileMagicValidator: validating file", {
    originalname: fileInfo?.originalname || "unknown",
    declaredMimeType: mimeType,
    detectedType,
    headerHex,
    headerText,
    expectedSignatures: MAGIC_SIGNATURES[mimeType],
    filePath,
    fileSize: fileInfo?.size || "unknown",
  });

  if (!header) {
    return {
      valid: false,
      reason: "Could not read file header",
      detectedType: "unreadable",
      declaredType: mimeType,
    };
  }

  const matched = signatures.some((sig) => matchesSignature(header, sig));
  if (!matched) {
    logger.warn("fileMagicValidator: magic byte mismatch", {
      originalname: fileInfo?.originalname || "unknown",
      declaredMimeType: mimeType,
      detectedType,
      headerHex,
      headerText,
      expectedSignatures: MAGIC_SIGNATURES[mimeType],
      mismatchReason: `File starts with ${headerHex.slice(0, 16)} but ${mimeType} expects ${MAGIC_SIGNATURES[mimeType].map(s => s.map(b => b === null ? "??" : "0x" + b.toString(16)).join(" ")).join(" OR ")}`,
      filePath,
    });
    return {
      valid: false,
      reason: `File content does not match declared type (${mimeType}). Expected ${MAGIC_SIGNATURES[mimeType].map(s => s.map(b => b === null ? "??" : "0x" + b.toString(16)).join(" ")).join(" OR ")}, got ${headerHex.slice(0, 16)}. Possible MIME spoofing or file corruption.`,
      detectedType,
      declaredType: mimeType,
    };
  }

  logger.info("fileMagicValidator: validation passed", {
    originalname: fileInfo?.originalname || "unknown",
    declaredMimeType: mimeType,
    detectedType,
    headerHex,
  });

  return { valid: true, detectedType, declaredType: mimeType };
}

/**
 * Express middleware — runs after multer writes files to disk.
 * Validates each uploaded file's magic bytes.
 * Deletes invalid files and returns 400 if any file fails validation.
 */
export function validateUploadedFileMagic(req, res, next) {
  const files = req.files || (req.file ? [req.file] : []);
  if (!files.length) return next();

  const invalid = [];

  for (const file of files) {
    const result = validateFileMagic(file.path, file.mimetype, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer ? file.buffer.slice(0, 16).toString("hex") : undefined,
    });
    if (!result.valid) {
      invalid.push({
        filename: file.originalname,
        reason: result.reason,
        declaredType: result.declaredType,
        detectedType: result.detectedType,
      });
      // Delete the suspicious file immediately
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        logger.warn("fileMagicValidator: could not delete invalid file", {
          path: file.path,
          error: err.message,
        });
      }
    }
  }

  if (invalid.length > 0) {
    // Also delete any remaining valid files from this request for atomicity
    for (const file of files) {
      if (!invalid.some((inv) => inv.filename === file.originalname)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          /* ignore */
        }
      }
    }
    return res.status(400).json({
      success: false,
      error: {
        message: `File validation failed: ${invalid.map((f) => `"${f.filename}" — ${f.reason}`).join("; ")}`,
        code: "INVALID_FILE_CONTENT",
        details: invalid,
        debug: invalid.map((f) => ({
          filename: f.filename,
          declaredType: f.declaredType,
          detectedType: f.detectedType,
          reason: f.reason,
        })),
      },
    });
  }

  next();
}
