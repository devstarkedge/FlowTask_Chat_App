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

const HEADER_BYTES_NEEDED = 12;

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
 * Validate a single file against its declared MIME type.
 *
 * @param {string} filePath   Absolute path on disk
 * @param {string} mimeType   Declared MIME type from multer
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateFileMagic(filePath, mimeType) {
  const signatures = MAGIC_SIGNATURES[mimeType];

  // MIME type not in our map — reject unknown types defensively
  if (!(mimeType in MAGIC_SIGNATURES)) {
    return { valid: false, reason: `MIME type not whitelisted: ${mimeType}` };
  }

  // null entry means "no magic bytes to check" — pass through
  if (signatures === null) {
    return { valid: true };
  }

  const header = readHeader(filePath);

  console.log("================================");
  console.log("FILE:", filePath);
  console.log("MIME:", mimeType);
  console.log("HEADER HEX:", header?.toString("hex"));
  console.log("HEADER TEXT:", header?.toString("utf8"));
  console.log("EXPECTED:", MAGIC_SIGNATURES[mimeType]);
  console.log("================================");
  if (!header) {
    return { valid: false, reason: "Could not read file header" };
  }

  const matched = signatures.some((sig) => matchesSignature(header, sig));
  if (!matched) {
    return {
      valid: false,
      reason: `File content does not match declared type (${mimeType}). Possible MIME spoofing.`,
    };
  }

  return { valid: true };
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
    const result = validateFileMagic(file.path, file.mimetype);
    if (!result.valid) {
      invalid.push({ filename: file.originalname, reason: result.reason });
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
      },
    });
  }

  next();
}
