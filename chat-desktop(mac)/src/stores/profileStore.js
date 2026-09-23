import { create } from 'zustand'

export const useProfileStore = create((set) => ({
  profileUser: null,

  openProfile: (user) => set({ profileUser: user }),

  closeProfile: () => set({ profileUser: null }),
}))
