import { messageAPI } from "../services/api";

/**
 * Converts a Cloudinary URL to a server proxy URL to bypass 401 errors.
 * If the URL is not from Cloudinary or lacks an assetId, returns the original URL.
 * 
 * @param {string} url - The original file URL (secureUrl or url)
 * @param {string} assetId - The MongoDB asset ID (_id or fileId)
 * @returns {string} - Proxy URL if Cloudinary, otherwise original URL
 */
export function getSafeFileUrl(url, assetId) {
  if (!url) return url;
  
  // Only proxy Cloudinary CDN URLs
  const isCloudinaryUrl = url.includes('res.cloudinary.com') || url.includes('cloudinary.com');
  
  // Don't proxy if:
  // - Not a Cloudinary URL
  // - No assetId available
  // - Already a relative server URL (starts with /)
  if (!isCloudinaryUrl || !assetId || url.startsWith('/')) {
    return url;
  }
  
  // Return proxy URL
  return messageAPI.getFileProxyUrl(assetId);
}

/**
 * Extracts the asset ID from a file object.
 * Tries multiple possible field names for the asset ID.
 * 
 * @param {object} file - The file object
 * @returns {string|null} - The asset ID or null
 */
export function getFileAssetId(file) {
  if (!file) return null;
  return file._id?.toString() || 
         file.fileId?.toString() || 
         file.assetId?.toString() || 
         file.referenceId?.toString() ||
         null;
}

/**
 * Convenience function that combines getSafeFileUrl and getFileAssetId.
 * Takes a file object and returns the appropriate URL (proxy or direct).
 * 
 * @param {object} file - The file object with url/secureUrl and _id
 * @returns {string} - Safe URL for browser access
 */
export function getFileUrl(file) {
  if (!file) return '';
  const url = file.secureUrl || file.url || '';
  const assetId = getFileAssetId(file);
  return getSafeFileUrl(url, assetId);
}
