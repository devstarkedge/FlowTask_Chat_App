import toast from "react-hot-toast";
import logger from "./logger";

/**
 * Copies an image to the system clipboard as a PNG blob.
 * Works across Web browsers (Chrome, Edge, Firefox, Safari) and Electron.
 * 
 * @param {string} imgUrl - URL or blob URL of the image
 * @returns {Promise<boolean>} - True if copied successfully
 */
export async function copyImageToClipboard(imgUrl) {
  if (!imgUrl) return false;

  try {
    let pngBlob = null;

    // 1. If it's a blob URL or data URL
    if (imgUrl.startsWith("blob:") || imgUrl.startsWith("data:")) {
      try {
        const res = await fetch(imgUrl);
        const rawBlob = await res.blob();
        if (rawBlob.type === "image/png") {
          pngBlob = rawBlob;
        } else if (typeof createImageBitmap === "function") {
          const bitmap = await createImageBitmap(rawBlob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        }
      } catch {
        // Fall back to canvas conversion
      }
    }

    // 2. Convert to standard PNG blob via canvas (required by Clipboard API)
    if (!pngBlob) {
      const img = new Image();
      if (!imgUrl.startsWith("blob:") && !imgUrl.startsWith("data:")) {
        img.crossOrigin = "anonymous";
      }
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image for copying"));
        img.src = imgUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 300;
      canvas.height = img.naturalHeight || img.height || 300;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    }

    if (pngBlob && navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      toast.success("Image copied to clipboard");
      return true;
    } else {
      throw new Error("Clipboard API not supported");
    }
  } catch (err) {
    logger.warn("copyImageToClipboard error:", err);
    // Fallback: copy image URL if blob write fails
    try {
      await navigator.clipboard.writeText(imgUrl);
      toast.success("Image link copied to clipboard");
      return true;
    } catch {
      toast.error("Could not copy image");
    }
  }
  return false;
}
