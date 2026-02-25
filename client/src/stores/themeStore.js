import { create } from 'zustand'

const getInitialTheme = () => {
  const saved = localStorage.getItem('chat_theme')
  if (saved) return saved
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

// Apply theme on load
const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('chat_theme', theme)
}

// Initialize immediately
applyTheme(getInitialTheme())

export const useThemeStore = create((set, get) => ({
  theme: getInitialTheme(),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },

  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
}))
