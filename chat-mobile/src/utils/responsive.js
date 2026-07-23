import { Dimensions, Platform } from 'react-native';

const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;
const MAX_SCALE_FACTOR = 1.35; // Prevents huge UI elements on tablets / 4K displays

// Get initial window dimensions safely
const getInitialDimensions = () => {
  const window = Dimensions.get('window');
  return {
    width: window.width || 375,
    height: window.height || 812,
  };
};

const initialDims = getInitialDimensions();

/**
 * Classify screen type by width and height
 */
export const getScreenCategory = (w = Dimensions.get('window').width, h = Dimensions.get('window').height) => {
  const minDim = Math.min(w, h);
  const maxDim = Math.max(w, h);

  if (minDim < 360) return 'smallPhone';
  if (minDim < 600) return 'phone';
  if (minDim < 900 || maxDim < 1100) return 'tablet';
  return 'desktop';
};

/**
 * Helper to check if screen is a tablet or larger
 */
export const isTablet = (w = Dimensions.get('window').width, h = Dimensions.get('window').height) => {
  const category = getScreenCategory(w, h);
  return category === 'tablet' || category === 'desktop';
};

/**
 * Scale relative to width with max scale factor cap
 * @param {number} size - Base size
 * @param {number} customWidth - Optional live width override
 * @param {number} customHeight - Optional live height override
 */
export const scale = (size, customWidth, customHeight) => {
  const currentWindow = Dimensions.get('window');
  const w = customWidth || currentWindow.width || 375;
  const h = customHeight || currentWindow.height || 812;
  const shortDimension = Math.min(w, h);
  
  const rawScaleFactor = shortDimension / guidelineBaseWidth;
  const cappedScaleFactor = Math.min(rawScaleFactor, MAX_SCALE_FACTOR);
  
  return Math.round(cappedScaleFactor * size);
};

/**
 * Scale relative to height with max scale factor cap
 */
export const verticalScale = (size, customWidth, customHeight) => {
  const currentWindow = Dimensions.get('window');
  const w = customWidth || currentWindow.width || 375;
  const h = customHeight || currentWindow.height || 812;
  const longDimension = Math.max(w, h);
  
  const rawScaleFactor = longDimension / guidelineBaseHeight;
  const cappedScaleFactor = Math.min(rawScaleFactor, MAX_SCALE_FACTOR);
  
  return Math.round(cappedScaleFactor * size);
};

/**
 * Moderate scale - returns a size between the original size and the fully scaled size
 */
export const moderateScale = (size, factor = 0.5, customWidth, customHeight) => {
  const scaled = scale(size, customWidth, customHeight);
  return Math.round(size + (scaled - size) * factor);
};

/**
 * Calculate optimal container max width for tablet & desktop split views or centered modals
 */
export const getMaxContainerWidth = (w = Dimensions.get('window').width) => {
  if (w >= 1200) return 960;
  if (w >= 900) return 780;
  if (w >= 600) return 640;
  return w;
};

/**
 * Pick responsive value based on current breakpoint
 */
export const getResponsiveValue = (config, w = Dimensions.get('window').width) => {
  if (typeof config !== 'object' || config === null) return config;
  if (w >= 1200 && config.xl !== undefined) return config.xl;
  if (w >= 900 && config.lg !== undefined) return config.lg;
  if (w >= 600 && config.md !== undefined) return config.md;
  if (config.sm !== undefined) return config.sm;
  return config.default || Object.values(config)[0];
};

/**
 * Common scaled values for rapid use (evaluated statically for fallback, dynamic via hook)
 */
export const Spacing = {
  xs: moderateScale(4),
  s: moderateScale(8),
  m: moderateScale(16),
  l: moderateScale(24),
  xl: moderateScale(32),
  xxl: moderateScale(48),
};

export const FontSize = {
  xs: moderateScale(10),
  s: moderateScale(12),
  m: moderateScale(14),
  l: moderateScale(16),
  xl: moderateScale(20),
  xxl: moderateScale(24),
  xxxl: moderateScale(32),
};

export const Layout = {
  window: {
    get width() {
      return Dimensions.get('window').width;
    },
    get height() {
      return Dimensions.get('window').height;
    },
  },
  get isSmallDevice() {
    return Dimensions.get('window').width < 375;
  },
  get isTablet() {
    return isTablet();
  },
};
