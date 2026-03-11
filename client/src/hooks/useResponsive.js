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
  const w = window.innerWidth
  return {
    isMobile: w < BREAKPOINTS.mobile,
    isTablet: w >= BREAKPOINTS.mobile && w < BREAKPOINTS.desktop,
    isDesktop: w >= BREAKPOINTS.desktop,
    width: w,
  }
}
