/**
 * Calculates responsive dimensions for media (e.g., GIFs, images) while preserving aspect ratio.
 * Ensures the media never upscales beyond its natural size, and fits within max boundaries.
 * 
 * @param {number} srcWidth - Original width of the media
 * @param {number} srcHeight - Original height of the media
 * @param {number} maxWidth - Maximum allowed width
 * @param {number} maxHeight - Maximum allowed height
 * @returns {{ width: number, height: number }} - The calculated dimensions
 */
export function calculateResponsiveMediaDimensions(srcWidth, srcHeight, maxWidth, maxHeight) {
  // If original dimensions are missing or invalid, default to max bounds
  if (!srcWidth || !srcHeight || srcWidth <= 0 || srcHeight <= 0) {
    return { width: maxWidth, height: maxHeight };
  }

  // Calculate scaling factor to fit within max dimensions without upscaling
  const scale = Math.min(1, maxWidth / srcWidth, maxHeight / srcHeight);

  return {
    width: Math.floor(srcWidth * scale),
    height: Math.floor(srcHeight * scale),
  };
}
