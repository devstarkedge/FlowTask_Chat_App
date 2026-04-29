import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useDownloadStore = create(
  persist(
    (set, get) => ({
      downloads: [],

      addDownload: (file) => {
        const exists = get().downloads.find(
          (d) => d.url === (file.url || file.secureUrl),
        );
        if (exists) return;

        const newFile = {
          id: Date.now(),
          name: file.name,
          url: file.url,
          size: file.size || "—",
          type: file.type || "file",
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          downloads: [newFile, ...state.downloads],
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
    },
  ),
);
