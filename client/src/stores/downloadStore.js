import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useDownloadStore = create(
  persist(
    (set, get) => ({
      downloads: [],

      addDownload: (file) => {
        const url = file.url || file.secureUrl;
        if (!url) return null;

        const exists = get().downloads.find((d) => d.url === url);

        if (exists) {
          return { ...exists, alreadyExists: true };
        }

        const newDownload = {
          id: Date.now(),
          name: file.name || "Unnamed file",
          url,
          size: file.size || "—",
          type: file.type || "",
          thumbnailUrl: file.thumbnailUrl || null,
          status: "downloading",
          progress: 0,
          blobUrl: null,
          createdAt: new Date().toISOString(),
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
          createdAt: d.createdAt,
        })),
      }),
    }
  )
);