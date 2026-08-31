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
  // {
  //   id: 'custom',
  //   name: 'Custom',
  //   description: 'Your palette',
  //   colors: null,
  // },
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

export function resolveEffectiveTheme(mode) {
  return getEffectiveTheme(mode)
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

  const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
  if (raw != null) {
    // Try to parse JSON (expected shape is an object). If parsing
    // succeeds and yields an object, use it. If parsing yields a
    // primitive string like "dark" (or raw contains an unquoted
    // legacy value), accept it as a mode.
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return sanitizeAppearance(parsed)
      if (typeof parsed === 'string' && ['light', 'dark', 'system'].includes(parsed)) {
        return sanitizeAppearance({ ...DEFAULT_APPEARANCE, mode: parsed })
      }
    } catch (err) {
      // raw might be an unquoted legacy string (e.g. dark)
      if (['light', 'dark', 'system'].includes(raw)) {
        return sanitizeAppearance({ ...DEFAULT_APPEARANCE, mode: raw })
      }
      // otherwise fall through to check legacy key
    }
  }

  const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY)
  if (['light', 'dark', 'system'].includes(legacyTheme)) {
    return sanitizeAppearance({ ...DEFAULT_APPEARANCE, mode: legacyTheme })
  }

  return DEFAULT_APPEARANCE
}

function persistAppearance(appearance) {
  if (!isBrowser) return
  try {
    console.log('[Theme] persistAppearance called with:', appearance)
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
    localStorage.setItem(LEGACY_THEME_KEY, appearance.mode)
    console.log('[Theme] chat_appearance:', localStorage.getItem(APPEARANCE_STORAGE_KEY))
    console.log('[Theme] chat_theme:', localStorage.getItem(LEGACY_THEME_KEY))
  } catch (err) {
    // Don't let localStorage failures break the app; log for debugging.
    // This can fail in strict private-mode browsers or when quota is exceeded.
    // Failing to persist is non-fatal; the in-memory store still reflects the choice.
    // eslint-disable-next-line no-console
    console.error('[Theme] Failed to persist appearance to localStorage:', err)
  }
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
  const sidebar = getSidebarThemeColors(
    appearance.sidebarTheme,
    appearance.customTheme
  )

  root.setAttribute('data-theme', effectiveTheme)
  root.setAttribute('data-theme-mode', appearance.mode)
  root.setAttribute('data-sidebar-theme', appearance.sidebarTheme)

  try {
    if (document.body) {
      document.body.setAttribute('data-theme', effectiveTheme)
      document.body.setAttribute('data-theme-mode', appearance.mode)
      document.body.setAttribute('data-sidebar-theme', appearance.sidebarTheme)
    }
  } catch (e) {
    // ignore body attribute failures
  }

  root.style.colorScheme = effectiveTheme

  root.style.setProperty('--sidebar-bg', sidebar.sidebarBg)
  root.style.setProperty('--sidebar-text', sidebar.sidebarText)
  root.style.setProperty('--sidebar-hover', sidebar.sidebarHover)
  root.style.setProperty('--sidebar-active', sidebar.sidebarActive)
  root.style.setProperty('--sidebar-active-text', sidebar.sidebarActiveText)
  root.style.setProperty('--accent-color', sidebar.accentColor)
  root.style.setProperty('--accent-primary', sidebar.accentColor)
  root.style.setProperty('--border-focus', sidebar.accentColor)

  window.dispatchEvent(
    new CustomEvent('themeChanged', {
      detail: {
        theme: effectiveTheme,
        mode: appearance.mode,
      },
    })
  )

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

  applyAppearance: (appearance, options) => {
    const next = sanitizeAppearance(appearance)
    applyAppearance(next, options)
    set({
      ...next,
      theme: next.mode,
      effectiveTheme: getEffectiveTheme(next.mode),
    })
  },

  applyCurrent: (options) => {
    const appearance = {
      mode: get().mode,
      sidebarTheme: get().sidebarTheme,
      customTheme: get().customTheme,
    }
    get().applyAppearance(appearance, options)
  },

  setMode: (mode) => {
    if (!['light', 'dark', 'system'].includes(mode)) return
    set({ mode, theme: mode, effectiveTheme: getEffectiveTheme(mode) })
    get().applyCurrent({ persist: true })
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
    get().applyAppearance(DEFAULT_APPEARANCE)
  },

  hydrateFromPreferences: (preferences) => {
    if (!preferences) return

    // Local storage MUST take priority over backend preferences so that
    // user's explicit browser choice is never overwritten by server defaults.
    // Priority: localStorage > backend preferences > current state > defaults
    const stored = readStoredAppearance()
    
    // Extract mode from preferences - handle both old (string) and new (object) schema
    const prefMode = typeof preferences.theme === 'string' 
      ? preferences.theme 
      : preferences.theme?.mode ?? preferences.mode
    
    // Debug logging to trace theme priority
    console.log('[Theme] hydrateFromPreferences called:', {
      stored,
      preferences,
      prefMode,
      currentMode: get().mode,
      finalMode: stored.mode ?? prefMode ?? get().mode,
    })
    
    const next = sanitizeAppearance({
      mode: stored.mode ?? prefMode ?? get().mode,
      sidebarTheme: stored.sidebarTheme ?? preferences.sidebarTheme ?? get().sidebarTheme,
      customTheme: stored.customTheme ?? preferences.customTheme ?? get().customTheme,
    })
    get().applyAppearance(next, { persist: true })
  },

  getAppearancePayload: () => ({
    theme: get().mode,
    sidebarTheme: get().sidebarTheme,
    customTheme: get().customTheme,
  }),

  syncFromStorage: () => {
    const next = readStoredAppearance()
    get().applyAppearance(next, { persist: false })
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
