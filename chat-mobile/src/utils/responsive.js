import { Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

// Use iPhone 11/12/13/14 Standard (or similar standard phone) as base size
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

// Returns the smaller of width or height to ensure scale works on landscape/tablets
const shortDimension = width < height ? width : height;
const longDimension = width < height ? height : width;

/**
 * Scale relative to width
 * Best used for: widths, horizontal margins/padding, icon sizes
 */
export const scale = (size) => (shortDimension / guidelineBaseWidth) * size;

/**
 * Scale relative to height
 * Best used for: heights, vertical margins/padding
 */
export const verticalScale = (size) => (longDimension / guidelineBaseHeight) * size;

/**
 * Moderate scale - returns a size between the original size and the fully scaled size
 * Best used for: fonts, border radius, where scaling linearly is too dramatic
 * @param {number} size - Original size
 * @param {number} factor - How much to scale (0 = no scale, 1 = full linear scale)
 */
export const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

/**
 * Safe area padding helpers for devices without safe area context
 */
export const isTablet = () => {
  const pixelDensity = Dimensions.get('window').scale;
  const adjustedWidth = width * pixelDensity;
  const adjustedHeight = height * pixelDensity;
  if (pixelDensity < 2 && (adjustedWidth >= 1000 || adjustedHeight >= 1000)) {
    return true;
  } else if (pixelDensity === 2 && (adjustedWidth >= 1920 || adjustedHeight >= 1920)) {
    return true;
  }
  return false;
};

// Common scaled values for rapid use
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
    width,
    height,
  },
  isSmallDevice: width < 375,
  isTablet: isTablet(),
};
