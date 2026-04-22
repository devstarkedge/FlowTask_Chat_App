import { create } from 'zustand'

export const APPEARANCE_STORAGE_KEY = 'chat_appearance'
const LEGACY_THEME_KEY = 'chat_theme'

export const THEME_MODES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Match system' },
]

export const DEFAULT_CUSTOM_THEME = {
  sidebarBg: '#3f0e40',
  sidebarText: '#f8edf7',
  accentColor: '#1264a3',
  sidebarActive: '#1164a3',
}

export const SIDEBAR_THEME_PRESETS = [
  {
    id: 'aubergine',
    name: 'Aubergine',
    description: 'Slack classic',
    colors: {
      sidebarBg: '#3f0e40',
      sidebarText: '#f8edf7',
      sidebarHover: 'rgba(255, 255, 255, 0.12)',
      sidebarActive: '#1164a3',
      sidebarActiveText: '#ffffff',
      accentColor: '#1264a3',
    },
  },
  {
    id: 'purple',
    name: 'Purple',
    description: 'Rich and focused',
    colors: {
      sidebarBg: '#4a154b',
      sidebarText: '#fbf4ff',
      sidebarHover: 'rgba(255, 255, 255, 0.13)',
      sidebarActive: '#7c3aed',
      sidebarActiveText: '#ffffff',
      accentColor: '#7c3aed',
    },
  },
  {
    id: 'blue',
    name: 'Blue',
    description: 'Calm enterprise',
    colors: {
      sidebarBg: '#0f3d5e',
      sidebarText: '#edf7ff',
      sidebarHover: 'rgba(255, 255, 255, 0.12)',
      sidebarActive: '#1d6fb8',
      sidebarActiveText: '#ffffff',
      accentColor: '#1d6fb8',
    },
  },
  {
    id: 'green',
    name: 'Green',
    description: 'Fresh operations',
    colors: {
      sidebarBg: '#0f5132',
      sidebarText: '#ecfff5',
      sidebarHover: 'rgba(255, 255, 255, 0.12)',
      sidebarActive: '#11875d',
      sidebarActiveText: '#ffffff',
      accentColor: '#11875d',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Neutral premium',
    colors: {
      sidebarBg: '#1f2428',
      sidebarText: '#f5f7f8',
      sidebarHover: 'rgba(255, 255, 255, 0.11)',
      sidebarActive: '#3f7fbf',
      sidebarActiveText: '#ffffff',
      accentColor: '#3f7fbf',
    },
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Your palette',
    colors: null,
  },
]

export const DEFAULT_APPEARANCE = {
  mode: 'system',
  sidebarTheme: 'aubergine',
  customTheme: DEFAULT_CUSTOM_THEME,
}

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

function getMediaQuery() {
  if (!isBrowser || !window.matchMedia) return null
  return window.matchMedia('(prefers-color-scheme: dark)')
}

function getEffectiveTheme(mode) {
  if (mode !== 'system') return mode === 'light' ? 'light' : 'dark'
  return getMediaQuery()?.matches ? 'dark' : 'light'
}

function safeParse(value) {
  try {
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function sanitizeAppearance(value) {
  const source = value && typeof value === 'object' ? value : {}
  const mode = ['light', 'dark', 'system'].includes(source.mode || source.theme)
    ? (source.mode || source.theme)
    : DEFAULT_APPEARANCE.mode

  const presetIds = new Set(SIDEBAR_THEME_PRESETS.map((preset) => preset.id))
  const sidebarTheme = presetIds.has(source.sidebarTheme)
    ? source.sidebarTheme
    : DEFAULT_APPEARANCE.sidebarTheme

  return {
    mode,
    sidebarTheme,
    customTheme: {
      ...DEFAULT_CUSTOM_THEME,
      ...(source.customTheme && typeof source.customTheme === 'object' ? source.customTheme : {}),
    },
  }
}

function readStoredAppearance() {
  if (!isBrowser) return DEFAULT_APPEARANCE

  const saved = safeParse(localStorage.getItem(APPEARANCE_STORAGE_KEY))
  if (saved) return sanitizeAppearance(saved)

  const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY)
  if (['light', 'dark', 'system'].includes(legacyTheme)) {
    return sanitizeAppearance({ ...DEFAULT_APPEARANCE, mode: legacyTheme })
  }

  return DEFAULT_APPEARANCE
}

function persistAppearance(appearance) {
  if (!isBrowser) return
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
  localStorage.setItem(LEGACY_THEME_KEY, appearance.mode)
}

export function getSidebarThemeColors(sidebarTheme, customTheme = DEFAULT_CUSTOM_THEME) {
  if (sidebarTheme === 'custom') {
    return {
      sidebarBg: customTheme.sidebarBg || DEFAULT_CUSTOM_THEME.sidebarBg,
      sidebarText: customTheme.sidebarText || DEFAULT_CUSTOM_THEME.sidebarText,
      sidebarHover: 'color-mix(in srgb, var(--sidebar-text) 13%, transparent)',
      sidebarActive: customTheme.sidebarActive || DEFAULT_CUSTOM_THEME.sidebarActive,
      sidebarActiveText: '#ffffff',
      accentColor: customTheme.accentColor || DEFAULT_CUSTOM_THEME.accentColor,
    }
  }

  const preset = SIDEBAR_THEME_PRESETS.find((item) => item.id === sidebarTheme)
  return preset?.colors || SIDEBAR_THEME_PRESETS[0].colors
}

function applyAppearance(appearance, options = {}) {
  if (!isBrowser) return

  const { persist = true } = options
  const effectiveTheme = getEffectiveTheme(appearance.mode)
  const root = document.documentElement
  const sidebar = getSidebarThemeColors(appearance.sidebarTheme, appearance.customTheme)

  root.setAttribute('data-theme', effectiveTheme)
  root.setAttribute('data-theme-mode', appearance.mode)
  root.setAttribute('data-sidebar-theme', appearance.sidebarTheme)
  root.style.colorScheme = effectiveTheme

  root.style.setProperty('--sidebar-bg', sidebar.sidebarBg)
  root.style.setProperty('--sidebar-text', sidebar.sidebarText)
  root.style.setProperty('--sidebar-hover', sidebar.sidebarHover)
  root.style.setProperty('--sidebar-active', sidebar.sidebarActive)
  root.style.setProperty('--sidebar-active-text', sidebar.sidebarActiveText)
  root.style.setProperty('--accent-color', sidebar.accentColor)
  root.style.setProperty('--accent-primary', sidebar.accentColor)
  root.style.setProperty('--border-focus', sidebar.accentColor)

  if (persist) {
    persistAppearance(appearance)
  }
}

const initialAppearance = readStoredAppearance()
applyAppearance(initialAppearance)

export const useThemeStore = create((set, get) => ({
  ...initialAppearance,
  theme: initialAppearance.mode,
  effectiveTheme: getEffectiveTheme(initialAppearance.mode),

  applyCurrent: () => {
    const appearance = {
      mode: get().mode,
      sidebarTheme: get().sidebarTheme,
      customTheme: get().customTheme,
    }
    applyAppearance(appearance)
    set({ effectiveTheme: getEffectiveTheme(appearance.mode), theme: appearance.mode })
  },

  setMode: (mode) => {
    if (!['light', 'dark', 'system'].includes(mode)) return
    set({ mode, theme: mode, effectiveTheme: getEffectiveTheme(mode) })
    get().applyCurrent()
  },

  setTheme: (mode) => {
    get().setMode(mode)
  },

  toggleTheme: () => {
    const next = get().effectiveTheme === 'dark' ? 'light' : 'dark'
    get().setMode(next)
  },

  setSidebarTheme: (sidebarTheme) => {
    if (!SIDEBAR_THEME_PRESETS.some((preset) => preset.id === sidebarTheme)) return
    set({ sidebarTheme })
    get().applyCurrent()
  },

  setCustomTheme: (updates) => {
    set((state) => ({
      sidebarTheme: 'custom',
      customTheme: { ...state.customTheme, ...updates },
    }))
    get().applyCurrent()
  },

  resetAppearance: () => {
    set({
      ...DEFAULT_APPEARANCE,
      theme: DEFAULT_APPEARANCE.mode,
      effectiveTheme: getEffectiveTheme(DEFAULT_APPEARANCE.mode),
    })
    applyAppearance(DEFAULT_APPEARANCE)
  },

  hydrateFromPreferences: (preferences) => {
    if (!preferences) return
    const next = sanitizeAppearance({
      ...get(),
      mode: preferences.theme || preferences.mode || get().mode,
      sidebarTheme: preferences.sidebarTheme || get().sidebarTheme,
      customTheme: preferences.customTheme || get().customTheme,
    })
    set({ ...next, theme: next.mode, effectiveTheme: getEffectiveTheme(next.mode) })
    applyAppearance(next)
  },

  getAppearancePayload: () => ({
    theme: get().mode,
    sidebarTheme: get().sidebarTheme,
    customTheme: get().customTheme,
  }),

  syncFromStorage: () => {
    const next = readStoredAppearance()
    set({ ...next, theme: next.mode, effectiveTheme: getEffectiveTheme(next.mode) })
    applyAppearance(next, { persist: false })
  },
}))

if (isBrowser) {
  const media = getMediaQuery()
  const onSystemThemeChange = () => {
    if (useThemeStore.getState().mode === 'system') {
      useThemeStore.getState().applyCurrent()
    }
  }

  media?.addEventListener?.('change', onSystemThemeChange)
  media?.addListener?.(onSystemThemeChange)

  window.addEventListener('storage', (event) => {
    if (event.key === APPEARANCE_STORAGE_KEY || event.key === LEGACY_THEME_KEY) {
      useThemeStore.getState().syncFromStorage()
    }
  })
}
