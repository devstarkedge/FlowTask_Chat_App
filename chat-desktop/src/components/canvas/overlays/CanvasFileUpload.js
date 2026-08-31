import { useRef, useCallback } from "react";
import { messageAPI } from "../../../services/api";
import { normalizeUploadResult, detectMediaKind } from "../../../services/mediaService";
import toast from "react-hot-toast";

/**
 * Determine the correct TipTap node type for a given file
 * based on its MIME type and extension.
 */
function getNodeTypeForFile(file, defaultType) {
  if (!file) return defaultType;

  const kind = detectMediaKind(file.type, file.name);
  if (kind === 'image') return "image";
  if (kind === 'video') return "videoBlock";
  if (kind === 'audio') return "audioBlock";

  return defaultType;
}

/**
 * Build initial loading attributes for a given node type and file.
 * Stores rich metadata so the node can display properly.
 */
function buildNodeAttrs(nodeType, file, localUrl) {
  const name = file.name;
  const size = file.size;
  const mimeType = file.type || '';

  if (nodeType === "image") {
    return {
      src: localUrl,
      loading: true,
      alt: name,
      fileName: name,
      mimeType: mimeType || 'image/png',
      fileSize: size,
      thumbnailUrl: localUrl,
      fileId: null,
    };
  }
  if (nodeType === "videoBlock") {
    return {
      src: localUrl,
      loading: true,
      fileName: name,
      mimeType: mimeType || 'video/mp4',
      fileSize: size,
      thumbnailUrl: localUrl,
      fileId: null,
    };
  }
  if (nodeType === "audioBlock") {
    return {
      src: localUrl,
      loading: true,
      fileName: name,
      mimeType: mimeType || 'audio/mpeg',
      fileSize: size,
      fileId: null,
    };
  }
  // fileAttachment
  return {
    url: localUrl,
    name,
    fileName: name,
    mimeType: mimeType || 'application/octet-stream',
    fileSize: size,
    size,
    loading: true,
    fileId: null,
    thumbnailUrl: localUrl,
  };
}

/**
 * Build the final attributes after upload completes.
 * Includes all metadata from the server response.
 */
function buildFinalAttrs(nodeType, uploadResult, file) {
  const { url, fileId, fileName, mimeType, fileSize, thumbnailUrl } = uploadResult;
  const name = fileName || file.name;

  const common = {
    loading: false,
    fileId: fileId || null,
    fileName: name,
    mimeType: mimeType || file.type || 'application/octet-stream',
    fileSize: fileSize || file.size || 0,
    thumbnailUrl: thumbnailUrl || url,
  };

  if (nodeType === "image") {
    return { ...common, src: url, alt: name };
  }
  if (nodeType === "videoBlock" || nodeType === "audioBlock") {
    return { ...common, src: url };
  }
  // fileAttachment
  return { ...common, url, name, size: fileSize || file.size || 0 };
}

/**
 * Hook encapsulating all file upload logic for the canvas editor.
 *
 * @param {Editor|null} editor    - TipTap editor instance
 * @param {Object}      canvas    - Canvas document (for channelId context)
 * @param {boolean}     isViewOnly - Whether the user has read-only access
 * @returns {{ triggerFileSelect, handleFileChange, fileInputRef, insertMedia }}
 */
export function useCanvasFileUpload(editor, canvas, isViewOnly) {
  const fileInputRef = useRef(null);
  const fileTypeRef = useRef("fileAttachment");

  // Resolve file URL from various possible response formats
  const resolveFileUrl = useCallback((uploadedFile) => {
    if (!uploadedFile) return null;
    return (
      uploadedFile.url ||
      uploadedFile.secure_url ||
      uploadedFile.path ||
      uploadedFile.fileUrl ||
      uploadedFile.location ||
      uploadedFile.downloadUrl ||
      uploadedFile.publicUrl ||
      (typeof uploadedFile === "string" && uploadedFile.startsWith("http") ? uploadedFile : null)
    );
  }, []);

  // Upload file to backend server and normalize the result
  // CRITICAL: Uses sync=true to get the real Cloudinary URL immediately.
  // Without sync=true, the server returns a placeholder URL that never updates.
  const uploadFileToServer = useCallback(async (file, channelId) => {
    const formData = new FormData();
    formData.append("files", file);

    try {
      const channelIdToUse = channelId || canvas?.channelId;
      if (channelIdToUse) {
        // Use sync=true to wait for Cloudinary upload and get the real URL
        const response = await messageAPI.uploadFilesSync(channelIdToUse, formData);
        // Use normalizeUploadResult to extract consistent metadata from the response
        const normalized = normalizeUploadResult(response, file);

        // CRITICAL: Validate that we got a real URL, not a placeholder
        if (normalized.isPlaceholder || !normalized.url || normalized.url === '/placeholder-loading') {
          console.error("[Canvas Upload] Received placeholder URL instead of real file URL", {
            fileName: file.name,
            normalized,
          });
          throw new Error('Upload completed but file URL is not ready yet');
        }

        return normalized;
      }

      console.warn("[Canvas Upload] No channel context for upload, using blob URL");
      return null;
    } catch (err) {
      console.error("[Canvas Upload] Upload failed:", err);
      return null;
    }
  }, [canvas?.channelId]);

  // Helper to update a loading node's attributes after upload
  const updateNodeAfterUpload = useCallback(
    (editorInstance, nodeType, newAttrs) => {
      if (!editorInstance) return;
      const tr = editorInstance.state.tr;
      let updated = false;
      editorInstance.state.doc.descendants((node, pos) => {
        if (updated) return;
        if (node.type.name === nodeType && node.attrs.loading === true) {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            ...newAttrs,
            loading: false,
          });
          updated = true;
        }
      });
      if (updated) {
        editorInstance.view.dispatch(tr);
      }
    },
    [],
  );

  const insertMedia = useCallback(
    async (file, nodeType) => {
      if (isViewOnly) {
        toast.error("You don't have permission to upload files");
        return;
      }
      if (!editor || !file) return;

      // Auto-detect the correct node type based on file MIME/extension
      const resolvedType = getNodeTypeForFile(file, nodeType);
      const localUrl = URL.createObjectURL(file);

      // 1. Insert loading placeholder node
      const attrs = buildNodeAttrs(resolvedType, file, localUrl);
      editor.chain().focus().insertContent({ type: resolvedType, attrs }).run();

      // 2. Upload to server
      const uploadResult = await uploadFileToServer(file);

      // 3. Update loading node with final URL
      // uploadResult is already normalized from uploadFileToServer
      if (uploadResult?.url) {
        const finalAttrs = buildFinalAttrs(resolvedType, uploadResult, file);
        updateNodeAfterUpload(editor, resolvedType, finalAttrs);
      } else {
        // Upload failed — keep blob URL as fallback
        console.warn("[Canvas Upload] No server result, keeping local blob URL");
        const fallbackResult = {
          url: localUrl,
          fileId: null,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size || 0,
          thumbnailUrl: localUrl,
        };
        const fallbackAttrs = buildFinalAttrs(resolvedType, fallbackResult, file);
        updateNodeAfterUpload(editor, resolvedType, fallbackAttrs);
      }
    },
    [editor, isViewOnly, uploadFileToServer, updateNodeAfterUpload],
  );

  const triggerFileSelect = useCallback(
    (nodeType) => {
      if (isViewOnly) {
        toast.error("You don't have permission to upload files");
        return;
      }
      fileTypeRef.current = nodeType;
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.click();
      }
    },
    [isViewOnly],
  );

  const handleFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const type = fileTypeRef.current;
      await insertMedia(file, type);
    },
    [insertMedia],
  );

  return {
    triggerFileSelect,
    handleFileChange,
    insertMedia,
    fileInputRef,
  };
}

export default useCanvasFileUpload;