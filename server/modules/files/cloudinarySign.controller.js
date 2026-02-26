import { v2 as cloudinary } from 'cloudinary';
import asyncHandler from '../../middleware/asyncHandler.js';
import env from '../../config/environment.js';

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
