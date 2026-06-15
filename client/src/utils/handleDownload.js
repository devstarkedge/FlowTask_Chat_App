import { useDownloadStore } from "../stores/downloadStore";
import toast from "react-hot-toast";
import { messageAPI } from "../services/api";

export const handleDownload = async (file) => {
  console.log('[handleDownload] Input file object:', {
    _id: file._id,
    fileName: file.fileName,
    messageId: file.messageId,
    channelId: file.channelId,
    workspaceId: file.workspaceId,
    contextType: file.contextType,
    hasMeta: !!file.meta,
  });
  
  const { addDownload, updateDownload } =
    useDownloadStore.getState();

  // Use proxy URL for Cloudinary files to bypass 401 errors
  const rawUrl = file.url || file.secureUrl;
  const assetId = file._id || file.fileId || file.assetId;
  const isCloudinaryUrl = rawUrl && rawUrl.includes('cloudinary.com');
  const useProxy = isCloudinaryUrl && assetId && !rawUrl.startsWith('/');
  const finalUrl = useProxy ? messageAPI.getFileProxyUrl(assetId) : rawUrl;

  const mappedFile = {
    name:
      file.fileName ||
      file.originalName ||
      file.name ||
      "Unnamed file",
    url: finalUrl,
    size: file.fileSize || file.size,
    type: file.mimeType || file.type || "",
    thumbnailUrl: file.thumbnailUrl || null,
    // include origin references when available to support navigation
    assetId: assetId || file.publicId || null,
    workspaceId: file.workspaceId || null,
    channelId: file.channelId || file.roomId || (file.meta && file.meta.channelId) || null,
    messageId: file.messageId || file.msgId || file.originMessageId || (file.meta && file.meta.messageId) || null,
    contextType: file.contextType || (file.isDM ? 'dm' : file.isThread ? 'thread' : null),
  };
  
  console.log('[handleDownload] Mapped file for download store:', {
    assetId: mappedFile.assetId,
    messageId: mappedFile.messageId,
    channelId: mappedFile.channelId,
    workspaceId: mappedFile.workspaceId,
    contextType: mappedFile.contextType,
    usingProxy: useProxy,
  });

  const downloadItem = addDownload(mappedFile);

  // duplicate case
  if (downloadItem?.alreadyExists) {
    toast("You already downloaded this file", {
      icon: "⚠️",
    });
    return;
  }

  if (!downloadItem) return;

  try {
    const response = await fetch(mappedFile.url);

    const contentLength =
      +response.headers.get("Content-Length") || 0;

    const reader = response.body?.getReader();

    //  fallback (no stream support)
    if (!reader) {
      const blob = await response.blob();

      triggerDownload(blob, mappedFile.name);

      const blobUrl = window.URL.createObjectURL(blob);

      updateDownload(downloadItem.id, {
        status: "completed",
        progress: 100,
        blobUrl,
        type: mappedFile.type,
        thumbnailUrl: mappedFile.thumbnailUrl,
      });

      return;
    }

    let receivedLength = 0;
    let chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedLength += value.length;

      if (contentLength) {
        const progress = Math.round(
          (receivedLength / contentLength) * 100
        );
        updateDownload(downloadItem.id, { progress });
      }
    }

    const blob = new Blob(chunks);

    //  download file
    triggerDownload(blob, mappedFile.name);

    //  save blobUrl for "Open file"
    const blobUrl = window.URL.createObjectURL(blob);

    updateDownload(downloadItem.id, {
      status: "completed",
      progress: 100,
      blobUrl,
      type: mappedFile.type,
      thumbnailUrl: mappedFile.thumbnailUrl,
    });
  } catch (err) {
    console.error("Download failed", err);

    updateDownload(downloadItem.id, {
      status: "failed",
    });

    toast.error("Download failed");
  }
};

// helper
const triggerDownload = (blob, name) => {
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();

  //  delay revoke 
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 1000);
};