import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';

export const useUIStore = create(
  persist(
    (set) => ({
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

      // Home screen quick cards customization
      enabledHomeCards: {
        catchUp: true,
        threads: true,
        huddles: true,
        later: true,
        drafts: true,
        scheduled: true,
      },
      toggleHomeCard: (cardKey) => set((state) => ({
        enabledHomeCards: {
          ...state.enabledHomeCards,
          [cardKey]: !state.enabledHomeCards[cardKey],
        },
      })),
    }),
    {
      name: 'flowtask-ui-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        enabledHomeCards: state.enabledHomeCards,
        sectionsExpanded: state.sectionsExpanded,
      }),
    }
  )
);
