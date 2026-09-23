import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_OPEN_DELAY = 140
const DEFAULT_CLOSE_DELAY = 180

export default function useHoverPanelController({
  openDelay = DEFAULT_OPEN_DELAY,
  closeDelay = DEFAULT_CLOSE_DELAY,
} = {}) {
  const [activePanel, setActivePanel] = useState(null)
  const [anchorRect, setAnchorRect] = useState(null)

  const openTimerRef = useRef(null)
  const closeTimerRef = useRef(null)

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const closeNow = useCallback(() => {
    clearOpenTimer()
    clearCloseTimer()
    setActivePanel(null)
    setAnchorRect(null)
  }, [clearCloseTimer, clearOpenTimer])

  const openFromTrigger = useCallback((panelId, rect) => {
    clearOpenTimer()
    clearCloseTimer()

    openTimerRef.current = setTimeout(() => {
      setActivePanel(panelId)
      setAnchorRect(rect)
    }, openDelay)
  }, [clearCloseTimer, clearOpenTimer, openDelay])

  const refreshAnchorRect = useCallback((rect) => {
    setAnchorRect(rect)
  }, [])

  const queueClose = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => {
      setActivePanel(null)
      setAnchorRect(null)
    }, closeDelay)
  }, [clearCloseTimer, closeDelay])

  const cancelClose = useCallback(() => {
    clearCloseTimer()
  }, [clearCloseTimer])

  useEffect(() => () => {
    clearOpenTimer()
    clearCloseTimer()
  }, [clearCloseTimer, clearOpenTimer])

  return {
    activePanel,
    anchorRect,
    openFromTrigger,
    refreshAnchorRect,
    queueClose,
    cancelClose,
    closeNow,
  }
}
