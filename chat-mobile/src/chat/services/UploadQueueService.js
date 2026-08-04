import axios from 'axios';
import { useChatStore } from '../store';
import ENV from '../../config/environment';
import logger from '../../utils/logger';

class UploadQueueService {
  constructor() {
    this.activeUploads = {}; // Store CancelTokens
  }

  async uploadMedia(uploadId, file, onProgress) {
    const store = useChatStore.getState();
    const source = axios.CancelToken.source();
    
    this.activeUploads[uploadId] = { source, file };
    store.updateUploadStatus(uploadId, 'uploading', { file });

    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || 'upload.bin',
      type: file.mimeType || 'application/octet-stream',
    });

    try {
      const { data } = await axios.post(`${ENV.API_URL}/files/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        cancelToken: source.token,
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total ? Math.round((progressEvent.loaded * 100) / progressEvent.total) : 0;
          store.setUploadProgress(uploadId, progress);
          if (onProgress) onProgress(progress);
        },
      });

      store.updateUploadStatus(uploadId, 'completed', { url: data.url });
      delete this.activeUploads[uploadId];
      return data.url;
    } catch (error) {
      if (axios.isCancel(error)) {
        logger.info(`[UploadQueueService] Upload ${uploadId} cancelled`);
        store.updateUploadStatus(uploadId, 'cancelled');
      } else {
        logger.error(`[UploadQueueService] Upload ${uploadId} failed:`, error);
        store.updateUploadStatus(uploadId, 'failed');
      }
      throw error;
    }
  }

  cancelUpload(uploadId) {
    if (this.activeUploads[uploadId]) {
      this.activeUploads[uploadId].source.cancel('User cancelled upload');
      delete this.activeUploads[uploadId];
    }
  }

  pauseUpload(uploadId) {
    // Axios doesn't support native pause/resume, so we cancel/store progress for re-try
    if (this.activeUploads[uploadId]) {
      this.activeUploads[uploadId].source.cancel('Upload paused');
      const store = useChatStore.getState();
      store.updateUploadStatus(uploadId, 'paused');
    }
  }

  async resumeUpload(uploadId, onProgress) {
    const upload = this.activeUploads[uploadId] || useChatStore.getState().pendingUploads[uploadId];
    if (upload && upload.file) {
      return this.uploadMedia(uploadId, upload.file, onProgress);
    }
  }
}

export default new UploadQueueService();
