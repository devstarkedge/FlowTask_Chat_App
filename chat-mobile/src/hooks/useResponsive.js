import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  getScreenCategory,
  isTablet as checkIsTablet,
  scale as scaleUtil,
  verticalScale as verticalScaleUtil,
  moderateScale as moderateScaleUtil,
  getMaxContainerWidth as getMaxContainerWidthUtil,
  getResponsiveValue as getResponsiveValueUtil,
} from '../utils/responsive';

/**
 * Custom hook providing live responsive dimensions, scaling helpers, and screen breakpoints.
 * Updates automatically when device rotates or window resizes.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isLandscape = width > height;
    const category = getScreenCategory(width, height);
    const isSmallDevice = width < 360;
    const isPhone = category === 'smallPhone' || category === 'phone';
    const isTablet = category === 'tablet';
    const isDesktop = category === 'desktop';
    const maxContainerWidth = getMaxContainerWidthUtil(width);

    // Live scaling helpers passing current width and height
    const scale = (size) => scaleUtil(size, width, height);
    const verticalScale = (size) => verticalScaleUtil(size, width, height);
    const moderateScale = (size, factor = 0.5) => moderateScaleUtil(size, factor, width, height);

    // Dynamic Spacing tokens
    const spacing = {
      xs: moderateScale(4),
      s: moderateScale(8),
      m: moderateScale(16),
      l: moderateScale(24),
      xl: moderateScale(32),
      xxl: moderateScale(48),
    };

    // Dynamic FontSize tokens
    const fontSizes = {
      xs: moderateScale(10),
      s: moderateScale(12),
      m: moderateScale(14),
      l: moderateScale(16),
      xl: moderateScale(20),
      xxl: moderateScale(24),
      xxxl: moderateScale(32),
    };

    // Utility for choosing breakpoint values
    const getValue = (config) => getResponsiveValueUtil(config, width);

    return {
      width,
      height,
      isLandscape,
      category,
      isSmallDevice,
      isPhone,
      isTablet,
      isDesktop,
      maxContainerWidth,
      scale,
      verticalScale,
      moderateScale,
      spacing,
      fontSizes,
      getValue,
    };
  }, [width, height]);
}

export default useResponsive;
