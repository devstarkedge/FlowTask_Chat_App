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

      removeDownload: (id) =>
        set((state) => ({
          downloads: state.downloads.filter((d) => d.id !== id),
        })),

      clearDownloads: () => set({ downloads: [] }),
    }),
    {
      name: "downloads-storage",
    },
  ),
);
