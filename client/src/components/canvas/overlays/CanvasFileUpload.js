import { useRef, useCallback } from "react";
import { messageAPI } from "../../../services/api";
import toast from "react-hot-toast";
import { PERMISSION_TOAST_MESSAGE } from "../permissions/useCanvasPermissions";

/**
 * Hook encapsulating all file upload logic for the canvas editor.
 *
 * @param {Editor|null} editor    - TipTap editor instance
 * @param {Object}      canvas    - Canvas document (for channelId context)
 * @param {boolean}     isViewOnly - Whether the user has read-only access
 * @returns {{ triggerFileSelect, handleFileChange, fileInputRef }}
 */
export function useCanvasFileUpload(editor, canvas, isViewOnly) {
  const fileInputRef = useRef(null);
  const fileTypeRef = useRef("fileAttachment");

  // Check if a file is an image type
  const isImageFile = useCallback((file) => {
    return file && file.type && file.type.startsWith("image/");
  }, []);

  // Upload file to backend server
  const uploadFileToServer = useCallback(async (file, channelId) => {
    const formData = new FormData();
    formData.append("files", file);

    try {
      const channelIdToUse = channelId || canvas?.channelId;
      if (channelIdToUse) {
        const response = await messageAPI.uploadFiles(channelIdToUse, formData);
        const uploadedFile =
          response?.data?.data?.files?.[0] ||
          response?.data?.data?.file ||
          response?.data;
        const fileUrl =
          uploadedFile?.url || uploadedFile?.secure_url || uploadedFile?.path;
        if (fileUrl) return { url: fileUrl, data: uploadedFile };
      }

      // Fallback: try canvas-specific upload or return null
      console.warn(
        "[Canvas Upload] No channel context for upload, using blob URL",
      );
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
      editorInstance.state.doc.descendants((node, pos) => {
        if (node.type.name === nodeType && node.attrs.loading === true) {
          editorInstance.view.dispatch(
            editorInstance.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              ...newAttrs,
              loading: false,
            }),
          );
        }
      });
    },
    [],
  );

  const insertMedia = useCallback(
    async (file, nodeType) => {
      if (isViewOnly) {
        toast.error(PERMISSION_TOAST_MESSAGE);
        return;
      }
      if (!editor) return;
      const localUrl = URL.createObjectURL(file);
      const name = file.name;
      const size = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      const isImage = isImageFile(file);

      // Auto-detect image type from file
      if (isImage && nodeType === "fileAttachment") {
        nodeType = "image";
      }

      // 1. Insert Node with loading: true (shows loading placeholder)
      let nodeAttrs = { loading: true };
      if (nodeType === "image") {
        nodeAttrs = { src: localUrl, loading: true };
      } else if (nodeType === "videoBlock") {
        nodeAttrs = { src: localUrl, loading: true };
      } else if (nodeType === "audioBlock") {
        nodeAttrs = { src: localUrl, loading: true };
      } else if (nodeType === "fileAttachment") {
        nodeAttrs = { url: localUrl, name, size, loading: true };
      }

      editor
        .chain()
        .focus()
        .insertContent({ type: nodeType, attrs: nodeAttrs })
        .run();

      // 2. Upload file to server
      const uploadResult = await uploadFileToServer(file);

      // 3. Update the loading node with the uploaded URL
      if (uploadResult?.url) {
        const finalUrl = uploadResult.url;
        if (nodeType === "image") {
          updateNodeAfterUpload(editor, nodeType, { src: finalUrl });
        } else if (nodeType === "videoBlock" || nodeType === "audioBlock") {
          updateNodeAfterUpload(editor, nodeType, { src: finalUrl });
        } else if (nodeType === "fileAttachment") {
          updateNodeAfterUpload(editor, nodeType, {
            url: finalUrl,
            name,
            size,
          });
        }
      } else {
        // Upload failed or no server available - fall back to blob URL
        console.warn(
          "[Canvas Upload] No upload result, using local blob URL as fallback",
        );
        setTimeout(() => {
          updateNodeAfterUpload(editor, nodeType, {
            ...(nodeType === "image" ? { src: localUrl } : {}),
            ...(nodeType === "fileAttachment"
              ? { url: localUrl, name, size }
              : {}),
          });
        }, 500);
      }
    },
    [editor, isViewOnly, isImageFile, uploadFileToServer, updateNodeAfterUpload],
  );

  const triggerFileSelect = useCallback(
    (nodeType) => {
      if (isViewOnly) {
        toast.error(PERMISSION_TOAST_MESSAGE);
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
