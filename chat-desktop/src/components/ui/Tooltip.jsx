import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Tooltip({ children, label, position = 'right', delay = 200 }) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const timerRef = useRef(null)
  const triggerRef = useRef(null)

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      let top, left

      if (position === 'right') {
        top = rect.top + rect.height / 2
        left = rect.right + 10
      } else if (position === 'left') {
        top = rect.top + rect.height / 2
        left = rect.left - 10
      } else if (position === 'top') {
        top = rect.top - 8
        left = rect.left + rect.width / 2
      } else if (position === 'bottom') {
        top = rect.bottom + 8
        left = rect.left + rect.width / 2
      }

      setCoords({ top, left })
      setVisible(true)
    }, delay)
  }, [delay, position])

  const hide = useCallback(() => {
    clearTimeout(timerRef.current)
    setVisible(false)
  }, [])

  // Clear pending timer on unmount to prevent setState on an unmounted component
  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const transformStyle =
    position === 'right'
      ? 'translateY(-50%)'
      : position === 'left'
        ? 'translate(-100%, -50%)'
        : position === 'top'
          ? 'translate(-50%, -100%)'
          : 'translate(-50%, 0)'

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </div>
      {visible &&
        createPortal(
          <div
            className="ws-tooltip"
            style={{
              top: coords.top,
              left: coords.left,
              transform: transformStyle,
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  )
}
