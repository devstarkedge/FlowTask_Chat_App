import { create } from "zustand";

export const useUIStore = create((set) => ({
  isDownloadsOpen: false,

  // Panels for the left navigation area
  activeWorkspacePanel: null, // e.g. 'later' when WorkspaceSidebar → Later is opened
  activeLaterPage: null, // e.g. 'drafts' | 'sent' when user opens those within later/full page

  openDownloads: () => set({ isDownloadsOpen: true }),
  closeDownloads: () => set({ isDownloadsOpen: false }),

  setActiveWorkspacePanel: (panel) => set({ activeWorkspacePanel: panel }),
  clearActiveWorkspacePanel: () => set({ activeWorkspacePanel: null }),

  setActiveLaterPage: (page) => set({ activeLaterPage: page }),
  clearActiveLaterPage: () => set({ activeLaterPage: null }),
}));