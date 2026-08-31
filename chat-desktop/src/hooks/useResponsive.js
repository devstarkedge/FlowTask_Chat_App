import { useState, useEffect } from 'react'

const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
}

export default function useResponsive() {
  const [state, setState] = useState(() => getState())

  useEffect(() => {
    const onResize = () => setState(getState())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return state
}

function getState() {
  if (typeof window === 'undefined') {
    // SSR-safe fallback: assume desktop layout
    return { isMobile: false, isTablet: false, isDesktop: true, width: BREAKPOINTS.desktop }
  }
  const w = window.innerWidth
  return {
    isMobile: w < BREAKPOINTS.mobile,
    isTablet: w >= BREAKPOINTS.mobile && w < BREAKPOINTS.tablet,
    isDesktop: w >= BREAKPOINTS.desktop,
    width: w,
  }
}
