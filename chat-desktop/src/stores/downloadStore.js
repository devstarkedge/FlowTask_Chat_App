import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useDownloadStore = create(
  persist(
    (set, get) => ({
      downloads: [],

      addDownload: (file) => {
        const url = file.url || file.secureUrl;
        if (!url) return null;

        // Use assetId for deduplication (more reliable than URL)
        // Fall back to URL if assetId is not available
        const dedupKey = file.assetId || url;
        const existing = get().downloads.filter((d) => {
          const key = d.assetId || d.url;
          return key === dedupKey;
        });
        
        // Cap duplicates at 4 entries per file
        if (existing.length >= 4) {
          return { ...existing[0], alreadyExists: true };
        }

        // Generate unique ID using crypto.randomUUID if available, fallback to timestamp + random
        const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID 
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const newDownload = {
          id: uniqueId,
          name: file.name || "Unnamed file",
          url,
          size: file.size || "—",
          type: file.type || "",
          thumbnailUrl: file.thumbnailUrl || null,
          status: "downloading",
          progress: 0,
          blobUrl: null,
          createdAt: new Date().toISOString(),
          // file origin references to enable "open folder" navigation
          workspaceId: file.workspaceId || null,
          channelId: file.channelId || null,
          messageId: file.messageId || null,
          assetId: file.assetId || null,
          contextType: file.contextType || null,
        };

        set((state) => ({
          downloads: [newDownload, ...state.downloads],
        }));

        return newDownload;
      },

      updateDownload: (id, updates) => {
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
        }));
      },

      removeDownload: (id) =>
        set((state) => ({
          downloads: state.downloads.filter((d) => d.id !== id),
        })),

      clearDownloads: () => set({ downloads: [] }),
    }),
    {
      name: "downloads-storage",
      partialize: (state) => ({
        // persist downloads but avoid storing transient blobUrl values
        downloads: state.downloads.map((d) => ({
          id: d.id,
          name: d.name,
          url: d.url,
          size: d.size,
          type: d.type,
          thumbnailUrl: d.thumbnailUrl,
          status: d.status,
          progress: d.progress,
          // do not persist blobUrl as it is session-scoped
          blobUrl: null,
          workspaceId: d.workspaceId || null,
          channelId: d.channelId || null,
          messageId: d.messageId || null,
          assetId: d.assetId || null,
          contextType: d.contextType || null,
          createdAt: d.createdAt,
        })),
      }),
    }
  )
);