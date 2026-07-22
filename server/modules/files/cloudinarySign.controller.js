import { v2 as cloudinary } from "cloudinary";
import asyncHandler from "../../middleware/asyncHandler.js";
import env from "../../config/environment.js";
import FileAsset from "./FileAsset.model.js";
import FileReference from "./FileReference.model.js";
import Channel from "../channels/Channel.model.js";
import ChannelMember from "../channels/ChannelMember.model.js";
import {
  NotFoundError,
  ForbiddenError,
} from "../../middleware/errorHandler.js";
import logger from "../../utils/logger.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

function redactDeliveryUrl(url = "") {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("signature")) {
      parsed.searchParams.set("signature", "redacted");
    }
    if (parsed.searchParams.has("api_key")) {
      parsed.searchParams.set("api_key", "redacted");
    }
    return parsed.toString().replace(/\/s--[^/]+--\//, "/s--redacted--/").substring(0, 180);
  } catch {
    return url
      .replace(/\/s--[^/]+--\//, "/s--redacted--/")
      .replace(/([?&](signature|api_key)=)[^&]+/g, "$1redacted")
      .substring(0, 180);
  }
}

async function assertFileAccess(asset, req) {
  if (!req.workspaceId || asset.workspaceId?.toString() !== req.workspaceId.toString()) {
    throw new ForbiddenError("Access denied");
  }

  if (asset.uploadedBy?.toString() === req.user._id.toString()) return;

  const references = await FileReference.find({
    workspaceId: req.workspaceId,
    fileId: asset._id,
  }).select('channelId').lean();
  const channelIds = [...new Set(
    references.map((reference) => reference.channelId?.toString()).filter(Boolean),
  )];
  if (channelIds.length === 0) throw new ForbiddenError("Access denied");

  const channels = await Channel.find({
    _id: { $in: channelIds },
    workspaceId: req.workspaceId,
    isArchived: { $ne: true },
  }).select('type visibility flowTaskRef').lean();
  const publicChannel = channels.some(
    (channel) =>
      channel.visibility === 'public' &&
      channel.type !== 'project' &&
      channel.flowTaskRef?.entityType !== 'board',
  );
  if (publicChannel) return;

  const isMember = await ChannelMember.exists({
    channelId: { $in: channels.map((channel) => channel._id) },
    userId: req.user._id,
    isActive: true,
  });
  if (!isMember) throw new ForbiddenError("Access denied");
}

function getResourceTypeFromUrl(url = "") {
  const match = url.match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\//);
  return match?.[1] || null;
}

function getVersionFromUrl(url = "") {
  const match = url.match(/\/upload\/v(\d+)\//);
  return match?.[1] || null;
}

function getOriginalExtension(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext && ext !== name.toLowerCase() ? ext : null;
}

function buildSignedDeliveryUrl(asset) {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET ||
    !asset?.publicId
  ) {
    return null;
  }

  const storedResourceType = asset.resourceType && asset.resourceType !== "auto"
    ? asset.resourceType
    : null;
  const resourceType =
    storedResourceType ||
    getResourceTypeFromUrl(asset.secureUrl) ||
    "raw";
  const version = getVersionFromUrl(asset.secureUrl);
  const publicIdHasExtension = /\.[^/.]+$/.test(asset.publicId);
  const format = publicIdHasExtension ? undefined : getOriginalExtension(asset.originalName);

  return cloudinary.url(asset.publicId, {
    resource_type: resourceType,
    type: "upload",
    secure: true,
    sign_url: true,
    ...(version ? { version } : {}),
    ...(format ? { format } : {}),
  });
}

function buildSignedApiDownloadUrl(asset) {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET ||
    !asset?.publicId
  ) {
    return null;
  }

  const storedResourceType = asset.resourceType && asset.resourceType !== "auto"
    ? asset.resourceType
    : null;
  const resourceType =
    storedResourceType ||
    getResourceTypeFromUrl(asset.secureUrl) ||
    "raw";
  const publicIdHasExtension = /\.[^/.]+$/.test(asset.publicId);
  const format = publicIdHasExtension ? undefined : getOriginalExtension(asset.originalName);

  return cloudinary.utils.private_download_url(asset.publicId, format, {
    resource_type: resourceType,
    type: "upload",
    attachment: false,
  });
}

function shouldRetryWithSignedUrl(upstream, cldError = "") {
  if (![401, 403].includes(upstream.status)) return false;
  return cldError === "unknown" || /deny|acl|unauthorized|forbidden|access/i.test(cldError || "");
}

async function fetchCloudinaryWithTimeout(fetchUrl, assetId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    return await fetch(fetchUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "FlowTask-Chat/1.0" },
    });
  } catch (err) {
    logger.error("Proxy: Cloudinary fetch failed", {
      assetId,
      error: err.message,
      errorType: err.name,
      fetchUrl: redactDeliveryUrl(fetchUrl),
    });
    throw new Error(`Failed to fetch from Cloudinary: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

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
    .select('workspaceId publicId secureUrl resourceType mimeType fileSize originalName uploadedBy thumbnailUrl metadata status downloadCount forwardCount createdAt updatedAt')
    .populate('uploadedBy', 'name avatar email')
    .lean();

  if (!asset) throw new NotFoundError('File');
  await assertFileAccess(asset, req);

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
  const asset = await FileAsset.findById(assetId)
    .select('workspaceId uploadedBy')
    .lean();
  if (!asset) throw new NotFoundError('File');
  await assertFileAccess(asset, req);
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
  await assertFileAccess(asset, req);

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

  // First try the stored secureUrl exactly as saved in the database. If Cloudinary
  // rejects raw/document delivery with an ACL-style 401/403, retry with a signed
  // URL generated from the stored publicId/resourceType.
  let fetchUrl = storedUrl;

  logger.info("Proxy: fetching from Cloudinary using stored secureUrl", {
    assetId,
    fetchUrl: redactDeliveryUrl(fetchUrl),
    mimeType: asset.mimeType,
  });

  let upstream = await fetchCloudinaryWithTimeout(fetchUrl, assetId);

  logger.info("Proxy: upstream result", {
    assetId,
    status: upstream.status,
    statusText: upstream.statusText,
    fetchUrl: redactDeliveryUrl(fetchUrl),
    contentType: upstream.headers.get("content-type"),
    contentLength: upstream.headers.get("content-length"),
  });

  if (!upstream.ok) {
    let body = await upstream.text().catch(() => "");
    let cldError = upstream.headers.get("x-cld-error") || "unknown";

    if (shouldRetryWithSignedUrl(upstream, cldError)) {
      const signedUrl = buildSignedDeliveryUrl(asset);

      if (signedUrl && signedUrl !== fetchUrl) {
        logger.warn("Proxy: retrying Cloudinary fetch with signed delivery URL", {
          assetId,
          firstStatus: upstream.status,
          firstCldError: cldError,
          signedUrl: redactDeliveryUrl(signedUrl),
          resourceType: asset.resourceType,
          publicId: asset.publicId,
        });

        fetchUrl = signedUrl;
        upstream = await fetchCloudinaryWithTimeout(fetchUrl, assetId);

        logger.info("Proxy: signed upstream result", {
          assetId,
          status: upstream.status,
          statusText: upstream.statusText,
          fetchUrl: redactDeliveryUrl(fetchUrl),
          contentType: upstream.headers.get("content-type"),
          contentLength: upstream.headers.get("content-length"),
        });

        if (upstream.ok) {
          body = "";
          cldError = "none";
        } else {
          body = await upstream.text().catch(() => "");
          cldError = upstream.headers.get("x-cld-error") || cldError;
        }
      }

      if (!upstream.ok && shouldRetryWithSignedUrl(upstream, cldError)) {
        const apiDownloadUrl = buildSignedApiDownloadUrl(asset);

        if (apiDownloadUrl && apiDownloadUrl !== fetchUrl) {
          logger.warn("Proxy: retrying Cloudinary fetch with signed API download URL", {
            assetId,
            previousStatus: upstream.status,
            previousCldError: cldError,
            apiDownloadUrl: redactDeliveryUrl(apiDownloadUrl),
            resourceType: asset.resourceType,
            publicId: asset.publicId,
          });

          fetchUrl = apiDownloadUrl;
          upstream = await fetchCloudinaryWithTimeout(fetchUrl, assetId);

          logger.info("Proxy: API download upstream result", {
            assetId,
            status: upstream.status,
            statusText: upstream.statusText,
            fetchUrl: redactDeliveryUrl(fetchUrl),
            contentType: upstream.headers.get("content-type"),
            contentLength: upstream.headers.get("content-length"),
          });

          if (upstream.ok) {
            body = "";
            cldError = "none";
          } else {
            body = await upstream.text().catch(() => "");
            cldError = upstream.headers.get("x-cld-error") || cldError;
          }
        }
      }
    }

    if (upstream.ok) {
      // Continue into the streaming path below after successful signed retry.
    } else {
      logger.error("Proxy: Cloudinary upstream failure", {
        assetId,
        status: upstream.status,
        statusText: upstream.statusText,
        xCldError: cldError,
        fetchUrl: redactDeliveryUrl(fetchUrl),
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
  }

  // Forward safe headers
  const upstreamContentType = upstream.headers.get("content-type");
  const contentType =
    !upstreamContentType || upstreamContentType === "application/octet-stream"
      ? asset.mimeType || "application/octet-stream"
      : upstreamContentType;
  const contentLength = upstream.headers.get("content-length");

  logger.debug("Proxy file streaming", {
    assetId,
    declaredMimeType: asset.mimeType,
    upstreamContentType,
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
