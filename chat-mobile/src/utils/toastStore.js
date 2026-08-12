import { create } from 'zustand';

let toastTimeout = null;

export const useToastStore = create((set) => ({
  options: null,
  visible: false,
  show: (options) => {
    set({ options, visible: true });
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      set({ visible: false });
    }, options.visibilityTime || 1500);
  },
  hide: () => set({ visible: false })
}));
