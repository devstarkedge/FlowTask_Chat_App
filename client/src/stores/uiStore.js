import { create } from "zustand";

export const useUIStore = create((set) => ({
  isDownloadsOpen: false,

  openDownloads: () => set({ isDownloadsOpen: true }),
  closeDownloads: () => set({ isDownloadsOpen: false }),
}));