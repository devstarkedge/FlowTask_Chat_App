export const createUploadSlice = (set, get) => ({
  pendingUploads: {}, // { [uploadId]: { progress, status: 'uploading' | 'paused' | 'completed' | 'cancelled' | 'failed', file } }

  setUploadProgress: (uploadId, progress) => {
    set((state) => ({
      pendingUploads: {
        ...state.pendingUploads,
        [uploadId]: {
          ...(state.pendingUploads[uploadId] || {}),
          progress,
        }
      }
    }));
  },

  updateUploadStatus: (uploadId, status, extra = {}) => {
    set((state) => ({
      pendingUploads: {
        ...state.pendingUploads,
        [uploadId]: {
          ...(state.pendingUploads[uploadId] || {}),
          status,
          ...extra,
        }
      }
    }));
  },

  removeUpload: (uploadId) => {
    set((state) => {
      const uploads = { ...state.pendingUploads };
      delete uploads[uploadId];
      return { pendingUploads: uploads };
    });
  }
});
