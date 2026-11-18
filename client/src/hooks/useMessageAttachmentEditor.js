import { useCallback, useEffect, useRef, useState } from 'react';
import { messageAPI } from '../services/api';
import toast from 'react-hot-toast';

const MAX_ATTACHMENTS = 10;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function attachmentId(file) {
  // Legacy embedded attachments have their own subdocument `_id`, not a FileAsset ID.
  const id = file?.fileReferenceId || file?.assetId || file?.fileId;
  return id?._id?.toString?.() || id?.toString?.() || null;
}

export function useMessageAttachmentEditor(channelId, initialAttachments = []) {
  const [attachments, setAttachments] = useState(initialAttachments);
  const [isUploading, setIsUploading] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState(null);
  const fileInputRef = useRef(null);
  const attachmentsRef = useRef(attachments);
  const initialSignature = initialAttachments.map((file) =>
    attachmentId(file) || file.url || file.secureUrl || file.originalName || file.fileName || ''
  ).join('|');

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    setAttachments(initialAttachments || []);
  // Parent message rows rebuild this array while rendering; only reset when
  // the actual attachment set changes, not when its object identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSignature]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((file) => {
      if (file.previewObjectUrl) URL.revokeObjectURL(file.previewObjectUrl);
    });
  }, []);

  const uploadImages = useCallback(async (files, replacing = null) => {
    const picked = Array.from(files || []).filter((file) => file?.type?.startsWith('image/'));
    if (!picked.length) return;
    const currentCount = attachmentsRef.current.length - (replacing === null ? 0 : 1);
    if (currentCount + picked.length > MAX_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_ATTACHMENTS} attachments per message`);
      return;
    }
    const oversized = picked.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      toast.error(`Image "${oversized.name || 'pasted image'}" exceeds the 100MB limit`);
      return;
    }

    setIsUploading(true);
    const previews = picked.map((file) => URL.createObjectURL(file));
    try {
      const formData = new FormData();
      picked.forEach((file) => formData.append('files', file));
      const { data } = await messageAPI.uploadFilesSync(channelId, formData);
      const uploaded = (data.data?.files || []).map((file, index) => ({
        ...file,
        fileReferenceId: file._id,
        previewObjectUrl: previews[index],
        preview: previews[index],
      }));
      previews.slice(uploaded.length).forEach((url) => URL.revokeObjectURL(url));

      setAttachments((current) => {
        const next = [...current];
        if (replacing !== null && uploaded.length) {
          next.splice(replacing, 1, ...uploaded);
        } else {
          next.push(...uploaded);
        }
        attachmentsRef.current = next;
        return next;
      });
    } catch (error) {
      previews.forEach((url) => URL.revokeObjectURL(url));
      toast.error(error.response?.data?.error?.message || 'Image upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [channelId]);

  const handlePaste = useCallback((event) => {
    const imageFiles = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!imageFiles.length) return;
    event.preventDefault();
    void uploadImages(imageFiles);
  }, [uploadImages]);

  const handleFileInput = useCallback((event) => {
    const files = Array.from(event.target.files || []);
    void uploadImages(files, replaceIndex);
    setReplaceIndex(null);
    event.target.value = '';
  }, [replaceIndex, uploadImages]);

  const openPicker = useCallback((index = null) => {
    setReplaceIndex(index);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  const removeAttachment = useCallback((index) => {
    const removed = attachmentsRef.current[index];
    if (removed?.previewObjectUrl) URL.revokeObjectURL(removed.previewObjectUrl);
    setAttachments((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  const moveAttachment = useCallback((from, to) => {
    if (from === to) return;
    setAttachments((current) => {
      if (from < 0 || from >= current.length || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  return {
    attachments,
    attachmentIds: attachments.map(attachmentId).filter(Boolean),
    embeddedAttachments: attachments
      .filter((file) => !attachmentId(file) && (file.url || file.secureUrl))
      .map((file) => ({
        fileName: file.fileName || file.originalName || 'attachment',
        originalName: file.originalName || file.fileName || 'attachment',
        mimeType: file.mimeType || 'application/octet-stream',
        fileSize: Number(file.fileSize) || 0,
        url: file.url || file.secureUrl,
        thumbnailUrl: file.thumbnailUrl || null,
        source: file.source || 'chat_upload',
        ...(file.flowTaskAttachmentId ? { flowTaskAttachmentId: file.flowTaskAttachmentId } : {}),
      })),
    isUploading,
    fileInputRef,
    handlePaste,
    handleFileInput,
    openPicker,
    removeAttachment,
    moveAttachment,
  };
}
