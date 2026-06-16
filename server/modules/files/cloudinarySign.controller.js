import { v2 as cloudinary } from "cloudinary";
import asyncHandler from "../../middleware/asyncHandler.js";
import env from "../../config/environment.js";
import FileAsset from "./FileAsset.model.js";
import {
  NotFoundError,
  ForbiddenError,
} from "../../middleware/errorHandler.js";
import logger from "../../utils/logger.js";

/**
 * Cloudinary Direct Upload Signing Endpoint.
 *
 * Generates signed upload parameters so the client can upload
 * directly to Cloudinary, bypassing the server for file streams.
 * This dramatically reduces server load and enables upload progress tracking.
 *
 * Flow: Client requests signature → uploads directly to Cloudinary → sends URL in message
 */

/**
 * POST /api/chat/upload/sign
 * Returns signed params for client-side direct upload to Cloudinary.
 */
export const getUploadSignature = asyncHandler(async (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `flowtask-chat/uploads/${req.user._id}`;

  const paramsToSign = {
    timestamp,
    folder,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    env.CLOUDINARY_API_SECRET,
  );

  res.json({
    success: true,
    data: {
      signature,
      timestamp,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      folder,
    },
  });
});

/**
 * GET /api/chat/files/:assetId/proxy
 * Server-side proxy that fetches a file from Cloudinary storage and streams
 * it back to the authenticated client.  This bypasses Cloudinary account-level
 * access restrictions that prevent direct browser fetches (e.g. the 401 that
 * Chrome's PDF viewer extension triggers when trying to re-fetch the CDN URL
 * without credentials).
 *
 * Security:
 *  - Requires valid JWT (protect middleware)
 *  - Verifies the FileAsset belongs to the user's active workspace
 *  - Validates the stored URL is a Cloudinary CDN domain (prevents SSRF)
 *  - Sets Cache-Control: private so the blob is not shared across users
 */
/**
 * GET /api/chat/files/:assetId/details
 * Returns file metadata including download/forward counts for the File Details modal.
 */
export const getFileDetails = asyncHandler(async (req, res) => {
  const { assetId } = req.params;
  const asset = await FileAsset.findById(assetId)
    .select('publicId secureUrl resourceType mimeType fileSize originalName uploadedBy thumbnailUrl metadata status downloadCount forwardCount createdAt updatedAt')
    .populate('uploadedBy', 'name avatar email')
    .lean();

  if (!asset) throw new NotFoundError('File');

  // Workspace isolation
  if (!req.workspaceId || asset.workspaceId.toString() !== req.workspaceId.toString()) {
    throw new ForbiddenError('Access denied');
  }

  res.json({ success: true, data: asset });
});

/**
 * POST /api/chat/files/:assetId/download
 * Increments the download counter for a file asset (fire-and-forget from client).
 */
export const incrementDownloadCount = asyncHandler(async (req, res) => {
  const { assetId } = req.params;
  await FileAsset.findByIdAndUpdate(assetId, { $inc: { downloadCount: 1 } });
  res.json({ success: true });
});

export const proxyFileAsset = asyncHandler(async (req, res) => {
  const { assetId } = req.params;

  logger.info("File proxy request received", {
    assetId,
    userId: req.user?._id?.toString(),
    workspaceId: req.workspaceId,
  });

  const asset = await FileAsset.findById(assetId).lean();

  if (!asset) throw new NotFoundError("File");

  logger.info("File proxy: asset loaded", {
    assetId,
    mimeType: asset.mimeType,
    resourceType: asset.resourceType,
    publicId: asset.publicId,
    status: asset.status,
    secureUrl: asset.secureUrl?.substring(0, 120),
    urlContainsRaw: asset.secureUrl?.includes("/raw/"),
    urlContainsImage: asset.secureUrl?.includes("/image/"),
  });

  // Workspace isolation
  if (
    !req.workspaceId ||
    asset.workspaceId.toString() !== req.workspaceId.toString()
  ) {
    throw new ForbiddenError("Access denied");
  }

  // Guard: asset must be fully uploaded before we can proxy it
  if (asset.status !== "available") {
    throw new NotFoundError(
      "File is not yet available — upload may still be in progress",
    );
  }

  const storedUrl = asset.secureUrl;

  // Guard: secureUrl must be a real Cloudinary URL, not a placeholder
  if (
    !storedUrl ||
    storedUrl === "/placeholder-loading" ||
    storedUrl.startsWith("/")
  ) {
    logger.error("FileAsset has invalid secureUrl", {
      assetId,
      secureUrl: storedUrl,
      status: asset.status,
    });
    throw new Error("File is still processing — upload may not be complete");
  }

  // SSRF guard — only proxy Cloudinary CDN URLs stored in the DB
  let parsedUrl;
  try {
    parsedUrl = new URL(storedUrl);
  } catch {
    throw new ForbiddenError("Invalid file URL");
  }
  if (!parsedUrl.hostname.endsWith(".cloudinary.com")) {
    throw new ForbiddenError("Only Cloudinary CDN files can be proxied");
  }

  // IMPORTANT: Always use the stored secureUrl exactly as saved in the database.
  // Never reconstruct or rewrite Cloudinary URLs — the stored secureUrl is the
  // canonical URL returned by Cloudinary at upload time and is guaranteed correct.
  // Reconstructing URLs (e.g. swapping /image/upload/ → /raw/upload/) causes 404s
  // because Cloudinary stores all assets (including PDFs) under /image/upload/.
  const fetchUrl = storedUrl;

  logger.info("Proxy: fetching from Cloudinary using stored secureUrl", {
    assetId,
    fetchUrl: fetchUrl.substring(0, 150),
    mimeType: asset.mimeType,
  });

  let upstream;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    upstream = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "FlowTask-Chat/1.0" },
    });

    clearTimeout(timeoutId);
  } catch (err) {
    logger.error("Proxy: Cloudinary fetch failed", {
      assetId,
      error: err.message,
      errorType: err.name,
      fetchUrl: fetchUrl.substring(0, 150),
    });
    throw new Error(`Failed to fetch from Cloudinary: ${err.message}`);
  }

  logger.info("Proxy: upstream result", {
    assetId,
    status: upstream.status,
    statusText: upstream.statusText,
    fetchUrl: fetchUrl.substring(0, 150),
    contentType: upstream.headers.get("content-type"),
    contentLength: upstream.headers.get("content-length"),
  });

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    const cldError = upstream.headers.get("x-cld-error") || "unknown";

    logger.error("Proxy: Cloudinary upstream failure", {
      assetId,
      status: upstream.status,
      statusText: upstream.statusText,
      xCldError: cldError,
      fetchUrl: fetchUrl.substring(0, 150),
      responseBody: body.slice(0, 300),
    });

    res.status(502).json({
      success: false,
      error: {
        message: `Cloudinary proxy error: HTTP ${upstream.status} ${upstream.statusText}`,
        cloudinaryError: cldError,
        statusCode: upstream.status,
      },
    });
    return;
  }

  // Forward safe headers
  const contentType =
    upstream.headers.get("content-type") ||
    asset.mimeType ||
    "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");

  logger.debug("Proxy file streaming", {
    assetId,
    declaredMimeType: asset.mimeType,
    upstreamContentType: upstream.headers.get("content-type"),
    responseContentType: contentType,
    format: asset.metadata?.format,
  });

  // Set CORS headers explicitly for streaming responses
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Workspace-Id",
  );

  res.setHeader("Content-Type", contentType);
  if (contentLength) res.setHeader("Content-Length", contentLength);
  const safeFilename = encodeURIComponent(asset.originalName || "file");

  // Use inline disposition for images/videos/audio/PDFs to allow browser rendering
  // Use attachment for other documents/archives to trigger download
  const isInlineMedia =
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType === "application/pdf";
  const disposition = isInlineMedia
    ? "inline"
    : `attachment; filename="${safeFilename}"`;
  res.setHeader("Content-Disposition", disposition);

  logger.debug("Setting response headers", {
    assetId,
    contentType,
    disposition,
    isInlineMedia,
  });

  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Stream body to client with back-pressure handling
  const reader = upstream.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      res.end();
      return;
    }
    const canContinue = res.write(Buffer.from(value));
    if (!canContinue) {
      await new Promise((resolve) => res.once("drain", resolve));
    }
  }
});
