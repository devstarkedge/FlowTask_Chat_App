import { create } from "zustand";

export const useCanvasUiStore = create((set, get) => ({
  focused: false,
  hoveredBlockId: null,
  activeSidebar: null,
  viewingVersion: null, // { historyId, editorName, editorAvatar, timestamp }
  dragging: {
    active: false,
    blockIds: [],
  },
  selectionToolbar: {
    visible: false,
    x: 0,
    y: 0,
  },
  slashMenu: {
    open: false,
    x: 0,
    y: 0,
    query: "",
    range: null,
  },
  providerStatus: "idle",

  setFocused: (focused) => set({ focused }),
  setHoveredBlockId: (hoveredBlockId) => set({ hoveredBlockId }),
  setProviderStatus: (providerStatus) => set({ providerStatus }),
  openSidebar: (activeSidebar) => set({ activeSidebar }),
  closeSidebar: () => set({ activeSidebar: null, viewingVersion: null }),
  setViewingVersion: (viewingVersion) => set({ viewingVersion }),
  clearViewingVersion: () => set({ viewingVersion: null }),
  setDragging: (dragging) => set({ dragging }),
  showSelectionToolbar: (position) =>
    set({
      selectionToolbar: {
        visible: true,
        ...position,
      },
    }),
  hideSelectionToolbar: () =>
    set({
      selectionToolbar: {
        ...get().selectionToolbar,
        visible: false,
      },
    }),
  openSlashMenu: (menu) =>
    set({
      slashMenu: {
        open: true,
        ...menu,
      },
    }),
  updateSlashMenu: (updates) =>
    set({
      slashMenu: {
        ...get().slashMenu,
        ...updates,
      },
    }),
  closeSlashMenu: () =>
    set({
      slashMenu: {
        ...get().slashMenu,
        open: false,
        query: "",
        range: null,
      },
    }),
}));
