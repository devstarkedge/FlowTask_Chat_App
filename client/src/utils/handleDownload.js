import { useDownloadStore } from "../stores/downloadStore";
import toast from "react-hot-toast";

export const handleDownload = async (file) => {
  const { addDownload, updateDownload } =
    useDownloadStore.getState();

  const mappedFile = {
    name:
      file.fileName ||
      file.originalName ||
      file.name ||
      "Unnamed file",
    url: file.url || file.secureUrl,
    size: file.fileSize || file.size,
    type: file.mimeType || file.type || "",
    thumbnailUrl: file.thumbnailUrl || null,
  };

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