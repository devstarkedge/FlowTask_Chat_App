import { fileAPI } from '../services/api';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export async function prepareMediaFile(file, channelId, onProgress) {
  if (file._id || file.id) return file;
  let uri = file._tempUri || file.uri;
  if (!uri) throw new Error('The selected file is no longer available. Select it again.');
  const name = file.originalName || file.fileName || file.name || 'file';
  if (uri.startsWith('data:')) {
    const data = uri.match(/^data:([^;,]+);base64,([\s\S]+)$/);
    if (!data) throw new Error('This pasted file cannot be read. Select it from Photos or Files instead.');
    const extension = name.includes('.') ? name.split('.').pop() : 'bin';
    const destination = `${FileSystem.cacheDirectory}paste_${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    await FileSystem.writeAsStringAsync(destination, data[2], { encoding: FileSystem.EncodingType.Base64 });
    uri = destination;
  }
  if (uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
    const extension = name.includes('.') ? name.split('.').pop() : 'jpg';
    const destination = `${FileSystem.cacheDirectory}upload_${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    await FileSystem.copyAsync({ from: uri, to: destination });
    uri = destination;
  }
  if (/^https?:\/\//i.test(uri)) {
    const extension = name.includes('.') ? name.split('.').pop() : 'bin';
    const destination = `${FileSystem.cacheDirectory}paste_${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    const downloaded = await FileSystem.downloadAsync(uri, destination);
    if (downloaded.status < 200 || downloaded.status >= 300) throw new Error('The pasted media could not be downloaded.');
    uri = destination;
  }
  if (Platform.OS === 'android' && !/^(file|content):\/\//.test(uri)) uri = `file://${uri}`;
  const body = new FormData();
  body.append('files', { uri, name, type: file.mimeType || file.type || 'application/octet-stream' });
  const { data } = await fileAPI.uploadFiles(channelId, body, onProgress, true);
  const uploaded = data?.data?.files?.[0];
  if (!uploaded?._id && !uploaded?.id) throw new Error('Upload completed without a file reference. Please retry.');
  return { ...file, ...uploaded, _id: uploaded._id || uploaded.id, name: uploaded.originalName || name, localPreviewUri: uri };
}

// One persisted message per selected file. Await creation before advancing so
// upload speed cannot reorder messages. Keep only failed entries for retry.
export async function sendMediaBatch({ files, channelId, baseOptions, onSend, onProgress, onRemainingFiles, prepare = prepareMediaFile }) {
  const failedFiles = [];
  const remaining = [...files];
  for (const [index, original] of files.entries()) {
    let file = { ...original, _clientMessageId: original._clientMessageId || `temp-media-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    try {
      onProgress?.(original, { status: 'uploading', uploading: true, uploadFailed: false });
      file = await prepare(file, channelId, event => {
        if (event.total > 0) onProgress?.(original, { progress: Math.round(event.loaded * 100 / event.total) });
      });
      await onSend('', {
        ...baseOptions,
        fileReferences: [String(file._id || file.id)],
        optimisticAttachments: [{
          ...file,
          url: file.localPreviewUri || file._tempUri || file.uri || file.url || file.secureUrl,
          thumbnailUrl: file.localPreviewUri || file._tempUri || file.uri || file.thumbnailUrl || file.url,
          localPreviewUri: file.localPreviewUri || file._tempUri || file.uri,
        }],
        _clientMessageId: file._clientMessageId,
      });
      remaining[index] = null;
    } catch (error) {
      const failed = { ...file, status: 'failed', uploading: false, uploadFailed: true, error: error?.message || 'Send failed' };
      failedFiles.push(failed);
      remaining[index] = failed;
    }
    onRemainingFiles?.(remaining.filter(Boolean));
  }
  return failedFiles;
}
