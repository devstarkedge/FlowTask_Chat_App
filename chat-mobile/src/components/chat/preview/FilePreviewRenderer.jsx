import React from 'react';
import { resolvePreviewFile, MEDIA_PREVIEW_KINDS } from './previewUtils';
import ImagePreviewModal from './ImagePreviewModal';
import VideoPlayerModal from './VideoPlayerModal';
import AudioPlayerModal from './AudioPlayerModal';
import DocumentPreviewModal from './DocumentPreviewModal';
import UnsupportedPreviewModal from './UnsupportedPreviewModal';

/**
 * Central router for file previews (Chat + Files Screen).
 * Preview detection and supported formats mirror the Web App FilePreviewRenderer.
 */
export default function FilePreviewRenderer({ visible, file, onClose, colors }) {
  const resolved = resolvePreviewFile(file);

  if (!visible || !resolved) return null;

  const { kind, previewInfo, fileUrl, name, mime, headers, cacheFile, isSupported } = resolved;

  if (kind === 'image') {
    return (
      <ImagePreviewModal
        visible
        fileUrl={fileUrl}
        name={name}
        mimeType={mime}
        headers={headers}
        cacheFile={cacheFile}
        onClose={onClose}
      />
    );
  }

  if (kind === 'video') {
    return (
      <VideoPlayerModal
        visible
        fileUrl={fileUrl}
        name={name}
        headers={headers}
        cacheFile={cacheFile}
        onClose={onClose}
      />
    );
  }

  if (kind === 'audio') {
    return (
      <AudioPlayerModal
        visible
        fileUrl={fileUrl}
        name={name}
        cacheFile={cacheFile}
        colors={colors}
        onClose={onClose}
      />
    );
  }

  if (isSupported && !MEDIA_PREVIEW_KINDS.has(kind)) {
    return (
      <DocumentPreviewModal
        visible
        file={cacheFile}
        fileUrl={fileUrl}
        name={name}
        mimeType={mime}
        onClose={onClose}
      />
    );
  }

  return (
    <UnsupportedPreviewModal
      visible
      name={name}
      fileUrl={fileUrl}
      mimeType={mime}
      onClose={onClose}
    />
  );
}
