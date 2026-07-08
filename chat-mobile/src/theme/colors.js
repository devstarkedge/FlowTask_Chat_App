// Theme color system for FlowTask-Chat Mobile
// Supports Light, Dark, and Custom Workspace Themes
// Matches web application architecture
import { Platform } from 'react-native';

// ─── Utility: derive rgba from hex + alpha ──────────────────────────────────

/**
 * Convert a hex color to an rgba() string.
 * @param {string} hex  – e.g. '#3B82F6'
 * @param {number} alpha – 0..1
 * @returns {string} rgba(r,g,b,a)
 */
export const withAlpha = (hex, alpha) => {
  if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
};

// ─── Design Tokens (theme-agnostic) ─────────────────────────────────────────

export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
};

export const fontWeights = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
  extraBold: '800',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
};

// Platform-aware shadow tokens (consumed via getTheme)

export const shadows = {
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    android: { elevation: 2 },
    default: {},
  }),
  md: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
    android: { elevation: 4 },
    default: {},
  }),
  lg: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
    android: { elevation: 8 },
    default: {},
  }),
};

// Avatar fallback color palette
export const avatarColors = [
  '#e91e63',
  '#9c27b0',
  '#673ab7',
  '#3f51b5',
  '#2196f3',
  '#009688',
  '#4caf50',
  '#ff9800',
  '#ff5722',
  '#795548',
];

// Accent color presets
export const accentColors = {
  blue: {
    primary: '#3B82F6',
    primaryHover: '#2563EB',
    primaryLight: '#DBEAFE',
    headerGradient: ['#3B82F6', '#2563EB'],
  },
  purple: {
    primary: '#8B5CF6',
    primaryHover: '#7C3AED',
    primaryLight: '#EDE9FE',
    headerGradient: ['#8B5CF6', '#7C3AED'],
  },
  green: {
    primary: '#10B981',
    primaryHover: '#059669',
    primaryLight: '#D1FAE5',
    headerGradient: ['#10B981', '#059669'],
  },
  orange: {
    primary: '#F97316',
    primaryHover: '#EA580C',
    primaryLight: '#FFEDD5',
    headerGradient: ['#F97316', '#EA580C'],
  },
  red: {
    primary: '#EF4444',
    primaryHover: '#DC2626',
    primaryLight: '#FEE2E2',
    headerGradient: ['#EF4444', '#DC2626'],
  },
};

export const lightTheme = {
  // Background
  background: '#FFFFFF',
  backgroundSecondary: '#F9FAFB',
  backgroundTertiary: '#F3F4F6',
  
  // Sidebar
  sidebar: '#3F0E40',
  sidebarText: '#F8EDF7',
  sidebarHover: 'rgba(255, 255, 255, 0.12)',
  sidebarActive: '#1164A3',
  sidebarActiveText: '#FFFFFF',
  
  // Channel
  channel: '#FFFFFF',
  channelHover: '#F9FAFB',
  channelActive: '#E0E7FF',
  channelActiveText: '#4F46E5',
  
  // Text
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',
  
  // Primary/Accent
  primary: '#6366F1',
  primaryHover: '#4F46E5',
  primaryLight: '#E0E7FF',
  
  // Status
  online: '#10B981',
  away: '#F59E0B',
  busy: '#EF4444',
  offline: '#9CA3AF',
  
  // Semantic
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  
  // Border
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  borderDark: '#D1D5DB',
  
  // Card
  card: '#F9FAFB',
  
  // Message
  messageBubbleSent: '#F3F4F6',
  messageBubbleReceived: '#F3F4F6',
  messageTextSent: '#111827',
  messageTextReceived: '#111827',
  
  // Badge
  badgeBackground: '#EF4444',
  badgeText: '#FFFFFF',
  
  // Input
  inputBackground: '#F9FAFB',
  inputBorder: '#E5E7EB',
  inputText: '#111827',
  inputPlaceholder: '#9CA3AF',
  
  // Shadow
  shadow: 'rgba(0, 0, 0, 0.1)',
  shadowDark: 'rgba(0, 0, 0, 0.2)',

  // Shadow alpha tokens
  shadowSm: 'rgba(0, 0, 0, 0.1)',
  shadowMd: 'rgba(0, 0, 0, 0.15)',
  shadowLg: 'rgba(0, 0, 0, 0.2)',
  shadowXl: 'rgba(0, 0, 0, 0.25)',
  shadowXxl: 'rgba(0, 0, 0, 0.35)',

  // Overlay / Backdrop
  overlay: 'rgba(0, 0, 0, 0.5)',
  backdrop: 'rgba(0, 0, 0, 0.55)',

  // Surface overlays (white-based, for sidebars/drawers)
  surfaceOverlay: 'rgba(255, 255, 255, 0.12)',
  surfaceOverlayLight: 'rgba(255, 255, 255, 0.15)',
  surfaceOverlayMedium: 'rgba(255, 255, 255, 0.2)',
  surfaceOverlayHeavy: 'rgba(255, 255, 255, 0.5)',

  // Primary overlays (computed dynamically in getTheme)
  primaryOverlay: 'rgba(99, 102, 241, 0.08)',
  primaryOverlayLight: 'rgba(99, 102, 241, 0.04)',
  primaryOverlayBorder: 'rgba(99, 102, 241, 0.05)',

  // Text on primary
  textOnPrimary: '#FFFFFF',

  // Danger
  danger: '#e01e5a',
};

export const darkTheme = {
  // Background
  background: '#1F2937',
  backgroundSecondary: '#111827',
  backgroundTertiary: '#374151',
  
  // Sidebar
  sidebar: '#1F2937',
  sidebarText: '#F9FAFB',
  sidebarHover: 'rgba(255, 255, 255, 0.1)',
  sidebarActive: '#4F46E5',
  sidebarActiveText: '#FFFFFF',
  
  // Channel
  channel: '#1F2937',
  channelHover: '#374151',
  channelActive: '#4F46E5',
  channelActiveText: '#FFFFFF',
  
  // Text
  textPrimary: '#F9FAFB',
  textSecondary: '#D1D5DB',
  textTertiary: '#9CA3AF',
  textInverse: '#111827',
  
  // Primary/Accent
  primary: '#6366F1',
  primaryHover: '#818CF8',
  primaryLight: '#312E81',
  
  // Status
  online: '#10B981',
  away: '#F59E0B',
  busy: '#EF4444',
  offline: '#6B7280',
  
  // Semantic
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  
  // Border
  border: '#374151',
  borderLight: '#4B5563',
  borderDark: '#1F2937',
  
  // Card
  card: '#374151',
  
  // Message
  messageBubbleSent: '#374151',
  messageBubbleReceived: '#374151',
  messageTextSent: '#F9FAFB',
  messageTextReceived: '#F9FAFB',
  
  // Badge
  badgeBackground: '#EF4444',
  badgeText: '#FFFFFF',
  
  // Input
  inputBackground: '#374151',
  inputBorder: '#4B5563',
  inputText: '#F9FAFB',
  inputPlaceholder: '#9CA3AF',
  
  // Shadow
  shadow: 'rgba(0, 0, 0, 0.3)',
  shadowDark: 'rgba(0, 0, 0, 0.5)',

  // Shadow alpha tokens
  shadowSm: 'rgba(0, 0, 0, 0.2)',
  shadowMd: 'rgba(0, 0, 0, 0.25)',
  shadowLg: 'rgba(0, 0, 0, 0.35)',
  shadowXl: 'rgba(0, 0, 0, 0.45)',
  shadowXxl: 'rgba(0, 0, 0, 0.55)',

  // Overlay / Backdrop
  overlay: 'rgba(0, 0, 0, 0.6)',
  backdrop: 'rgba(0, 0, 0, 0.65)',

  // Surface overlays (white-based, for sidebars/drawers)
  surfaceOverlay: 'rgba(255, 255, 255, 0.1)',
  surfaceOverlayLight: 'rgba(255, 255, 255, 0.12)',
  surfaceOverlayMedium: 'rgba(255, 255, 255, 0.15)',
  surfaceOverlayHeavy: 'rgba(255, 255, 255, 0.3)',

  // Primary overlays (computed dynamically in getTheme)
  primaryOverlay: 'rgba(99, 102, 241, 0.12)',
  primaryOverlayLight: 'rgba(99, 102, 241, 0.06)',
  primaryOverlayBorder: 'rgba(99, 102, 241, 0.08)',

  // Text on primary
  textOnPrimary: '#FFFFFF',

  // Danger
  danger: '#e01e5a',
};

/**
 * Build a merged theme object.
 * @param {'light'|'dark'} mode
 * @param {string} accentColor  – preset name or 'custom'
 * @param {string|null} customColor – hex value when accentColor === 'custom'
 * @param {object|null} workspaceTheme – optional workspace override
 */
export const getTheme = (mode = 'light', accentColor = 'blue', customColor = null, workspaceTheme = null) => {
  const base = mode === 'dark' ? darkTheme : lightTheme;

  let accent;
  if (accentColor === 'custom' && customColor) {
    // Derive accent palette from the picked hex
    const num = parseInt(customColor.replace('#', ''), 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    const dr = Math.max(0, Math.min(255, Math.floor(r * 0.88)));
    const dg = Math.max(0, Math.min(255, Math.floor(g * 0.88)));
    const db = Math.max(0, Math.min(255, Math.floor(b * 0.88)));
    const hover = '#' + ((1 << 24) + (dr << 16) + (dg << 8) + db).toString(16).slice(1).toUpperCase();
    const lr = Math.min(255, Math.floor(r + (255 - r) * 0.88));
    const lg = Math.min(255, Math.floor(g + (255 - g) * 0.88));
    const lb = Math.min(255, Math.floor(b + (255 - b) * 0.88));
    const light = '#' + ((1 << 24) + (lr << 16) + (lg << 8) + lb).toString(16).slice(1).toUpperCase();
    accent = {
      primary: customColor,
      primaryHover: hover,
      primaryLight: mode === 'dark' ? hover : light,
      headerGradient: [customColor, hover],
    };
  } else {
    accent = accentColors[accentColor] || accentColors.blue;
  }

  // Workspace theme override
  const workspace = workspaceTheme
    ? {
        primary: workspaceTheme.primary || accent.primary,
        headerGradient: workspaceTheme.headerGradient || accent.headerGradient,
        sidebar: workspaceTheme.sidebar || base.sidebar,
      }
    : {};

  // Resolve final primary color after workspace override
  const finalPrimary = workspace.primary || accent.primary;

  // Compute primary overlay tokens dynamically from the active accent
  const primaryOverlays = {
    primaryOverlay: withAlpha(finalPrimary, mode === 'dark' ? 0.12 : 0.08),
    primaryOverlayLight: withAlpha(finalPrimary, mode === 'dark' ? 0.06 : 0.04),
    primaryOverlayBorder: withAlpha(finalPrimary, mode === 'dark' ? 0.08 : 0.05),
  };

  return {
    ...base,
    ...accent,
    ...workspace,
    ...primaryOverlays,
    effectiveTheme: mode,
    fontSizes,
    fontWeights,
    spacing,
    radius,
    shadows,
    avatarColors,
  };
};
