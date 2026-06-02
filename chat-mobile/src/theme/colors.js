// Theme color system for FlowTask Chat Mobile
// Supports Light, Dark, and Custom Workspace Themes
// Matches web application architecture

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
  messageBubbleSent: '#6366F1',
  messageBubbleReceived: '#F3F4F6',
  messageTextSent: '#FFFFFF',
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
  messageBubbleSent: '#6366F1',
  messageBubbleReceived: '#374151',
  messageTextSent: '#FFFFFF',
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
};

// Sidebar theme presets (matching web client)
export const sidebarPresets = {
  aubergine: {
    sidebar: '#3F0E40',
    sidebarText: '#F8EDF7',
    sidebarHover: 'rgba(255, 255, 255, 0.12)',
    sidebarActive: '#1164A3',
    sidebarActiveText: '#FFFFFF',
    primary: '#1264A3',
  },
  purple: {
    sidebar: '#4A154B',
    sidebarText: '#FBF4FF',
    sidebarHover: 'rgba(255, 255, 255, 0.13)',
    sidebarActive: '#7C3AED',
    sidebarActiveText: '#FFFFFF',
    primary: '#7C3AED',
  },
  blue: {
    sidebar: '#0F3D5E',
    sidebarText: '#EDF7FF',
    sidebarHover: 'rgba(255, 255, 255, 0.12)',
    sidebarActive: '#1D6FB8',
    sidebarActiveText: '#FFFFFF',
    primary: '#1D6FB8',
  },
  green: {
    sidebar: '#0F5132',
    sidebarText: '#ECFFF5',
    sidebarHover: 'rgba(255, 255, 255, 0.12)',
    sidebarActive: '#11875D',
    sidebarActiveText: '#FFFFFF',
    primary: '#11875D',
  },
  graphite: {
    sidebar: '#1F2428',
    sidebarText: '#F5F7F8',
    sidebarHover: 'rgba(255, 255, 255, 0.11)',
    sidebarActive: '#3F7FBF',
    sidebarActiveText: '#FFFFFF',
    primary: '#3F7FBF',
  },
};

export const getTheme = (mode = 'light', sidebarTheme = 'aubergine', accentColor = 'blue', customColors = {}, workspaceTheme = null) => {
  const base = mode === 'dark' ? darkTheme : lightTheme;
  const sidebar = sidebarPresets[sidebarTheme] || sidebarPresets.aubergine;
  const accent = accentColors[accentColor] || accentColors.blue;
  
  // Workspace theme override
  const workspace = workspaceTheme ? {
    primary: workspaceTheme.primary || accent.primary,
    headerGradient: workspaceTheme.headerGradient || accent.headerGradient,
    sidebar: workspaceTheme.sidebar || sidebar.sidebar,
  } : {};
  
  return {
    ...base,
    ...sidebar,
    ...accent,
    ...workspace,
    ...customColors,
  };
};
