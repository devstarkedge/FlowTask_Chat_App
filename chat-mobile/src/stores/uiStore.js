import { create } from 'zustand';

export const useUIStore = create((set) => ({
  isDrawerOpen: false,
  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
  toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),
  
  // Channel list sections
  sectionsExpanded: {
    dms: true,
    system: true,
    public: true,
    private: true,
  },
  toggleSection: (section) => set((state) => ({
    sectionsExpanded: {
      ...state.sectionsExpanded,
      [section]: !state.sectionsExpanded[section],
    },
  })),
}));
