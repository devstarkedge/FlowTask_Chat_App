import { v2 as cloudinary } from 'cloudinary';
import asyncHandler from '../../middleware/asyncHandler.js';
import env from '../../config/environment.js';
import FileAsset from './FileAsset.model.js';
import { NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

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
export const proxyFileAsset = asyncHandler(async (req, res) => {
  const { assetId } = req.params;

  const asset = await FileAsset.findById(assetId).lean();
  if (!asset) throw new NotFoundError('File');

  // Workspace isolation
  if (!req.workspaceId || asset.workspaceId.toString() !== req.workspaceId.toString()) {
    throw new ForbiddenError('Access denied');
  }

  // Guard: asset must be fully uploaded before we can proxy it
  if (asset.status !== 'available') {
    throw new NotFoundError('File is not yet available — upload may still be in progress');
  }

  const storedUrl = asset.secureUrl;

  // SSRF guard — only proxy Cloudinary CDN URLs stored in the DB
  let parsedUrl;
  try {
    parsedUrl = new URL(storedUrl);
  } catch {
    throw new ForbiddenError('Invalid file URL');
  }
  if (!parsedUrl.hostname.endsWith('.cloudinary.com')) {
    throw new ForbiddenError('Only Cloudinary CDN files can be proxied');
  }

  // Ensure Cloudinary SDK is configured with credentials
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });

  // Parse resource_type and delivery type from stored URL.
  // URL format: https://res.cloudinary.com/<cloudName>/<resourceType>/<deliveryType>/...
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  const resourceType = pathParts[1] || 'image';  // image | video | raw
  const deliveryType = pathParts[2] || 'upload'; // upload | authenticated | private

  // File format needed for private_download_url
  const nameParts = (asset.originalName || 'file').split('.');
  const format = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : '';

  // Use private_download_url which generates a signed URL via the Cloudinary
  // Management API (api.cloudinary.com). Unlike CDN URLs, this is always
  // authenticated with your API key+secret and bypasses ALL account-level
  // CDN access restrictions that would block direct res.cloudinary.com fetches.
  const authDownloadUrl = cloudinary.utils.private_download_url(
    asset.publicId,
    format,
    {
      resource_type: resourceType,
      type: deliveryType,
      expires_at: Math.floor(Date.now() / 1000) + 300, // 5-minute window
    },
  );

  logger.debug('Cloudinary proxy fetching', { assetId, resourceType, deliveryType, publicId: asset.publicId });

  const upstream = await fetch(authDownloadUrl);
  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '');
    logger.error('Cloudinary proxy upstream failed', {
      assetId,
      status: upstream.status,
      publicId: asset.publicId,
      resourceType,
      deliveryType,
      cloudinaryError: body.slice(0, 300),
    });
    res.status(502).json({
      success: false,
      error: { message: `Upstream fetch failed: HTTP ${upstream.status}` },
    });
    return;
  }

  // Forward safe headers
  const contentType = upstream.headers.get('content-type') || asset.mimeType || 'application/octet-stream';
  const contentLength = upstream.headers.get('content-length');

  res.setHeader('Content-Type', contentType);
  if (contentLength) res.setHeader('Content-Length', contentLength);
  const safeFilename = encodeURIComponent(asset.originalName || 'file');
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Stream body to client with back-pressure handling
  const reader = upstream.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) { res.end(); return; }
    const canContinue = res.write(Buffer.from(value));
    if (!canContinue) {
      await new Promise((resolve) => res.once('drain', resolve));
    }
  }
});
