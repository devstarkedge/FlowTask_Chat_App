import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Production-grade Portal-based floating UI wrapper.
 * Used for emoji pickers, dropdowns, menus - anything that needs to escape parent overflow.
 * 
 * Features:
 * - Renders at document.body level (escapes all parent containers)
 * - Viewport-aware positioning with intelligent flip logic
 * - Handles scroll repositioning
 * - Prevents clipping in thread panels, sidebars, modals
 * - Responsive to window resize
 */
export default function FloatingPortal({ 
  children, 
  anchorRef, 
  isOpen, 
  onClose,
  position = 'bottom-start',
  offset = 8,
  zIndex = 1000,
  minWidth = 380,
  minHeight = 450
}) {
  const portalRef = useRef(null);
  const [portalPosition, setPortalPosition] = useState({ top: 0, left: 0 });
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [isPositioned, setIsPositioned] = useState(false);

  // Calculate optimal position to stay within viewport
  const calculatePosition = useCallback(() => {
    if (!anchorRef?.current) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;

    let top = 0;
    let left = 0;
    let adjustedPos = position;

    // Parse position (e.g., 'bottom-start', 'top-end', 'bottom')
    const [vertical, horizontal = 'start'] = position.split('-');

    // VERTICAL POSITIONING with intelligent flip
    const spaceAbove = anchorRect.top;
    const spaceBelow = viewportHeight - anchorRect.bottom;
    const minRequiredSpace = minHeight + offset + 16; // Add margin buffer

    if (vertical === 'bottom') {
      if (spaceBelow < minRequiredSpace && spaceAbove > spaceBelow) {
        // Flip to top
        top = anchorRect.top + scrollY - minHeight - offset;
        adjustedPos = `top-${horizontal}`;
      } else {
        top = anchorRect.bottom + scrollY + offset;
      }
    } else if (vertical === 'top') {
      if (spaceAbove < minRequiredSpace && spaceBelow > spaceAbove) {
        // Flip to bottom
        top = anchorRect.bottom + scrollY + offset;
        adjustedPos = `bottom-${horizontal}`;
      } else {
        top = anchorRect.top + scrollY - minHeight - offset;
      }
    }

    // HORIZONTAL POSITIONING with intelligent align
    const spaceLeft = anchorRect.left;
    const spaceRight = viewportWidth - anchorRect.right;
    const minRequiredWidth = minWidth + 16; // Add margin buffer

    if (horizontal === 'start') {
      left = anchorRect.left + scrollX;
      if (spaceRight < minRequiredWidth && spaceLeft > minRequiredWidth) {
        // Align to right edge of anchor
        left = anchorRect.right + scrollX - minWidth;
        adjustedPos = adjustedPos.replace('start', 'end');
      }
    } else if (horizontal === 'end') {
      left = anchorRect.right + scrollX - minWidth;
      if (spaceLeft < minRequiredWidth && spaceRight > minRequiredWidth) {
        // Align to left edge of anchor
        left = anchorRect.left + scrollX;
        adjustedPos = adjustedPos.replace('end', 'start');
      }
    } else if (horizontal === 'center') {
      left = anchorRect.left + scrollX + (anchorRect.width / 2) - (minWidth / 2);
    }

    // VIEWPORT BOUNDS - ensure picker never goes offscreen
    const maxLeft = viewportWidth + scrollX - minWidth - 8;
    const maxTop = viewportHeight + scrollY - minHeight - 8;
    
    left = Math.max(scrollX + 8, Math.min(left, maxLeft));
    top = Math.max(scrollY + 8, Math.min(top, maxTop));

    setPortalPosition({ top, left });
    setAdjustedPosition(adjustedPos);
    setIsPositioned(true);
  }, [anchorRef, position, offset, minWidth, minHeight]);

  // Recalculate on mount, resize, scroll
  useEffect(() => {
    if (!isOpen) {
      setIsPositioned(false);
      return;
    }

    // Initial position calculation
    calculatePosition();

    // Reposition on resize/scroll
    const handleResize = () => calculatePosition();
    const handleScroll = () => calculatePosition();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    // Also listen to anchor element's scroll container
    const scrollParent = findScrollParent(anchorRef?.current);
    if (scrollParent) {
      scrollParent.addEventListener('scroll', handleScroll);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      if (scrollParent) {
        scrollParent.removeEventListener('scroll', handleScroll);
      }
    };
  }, [isOpen, calculatePosition, anchorRef]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (portalRef.current && !portalRef.current.contains(e.target)) {
        // Check if click was on the anchor element (don't close in that case)
        if (anchorRef?.current && !anchorRef.current.contains(e.target)) {
          onClose?.();
        }
      }
    };

    // Use setTimeout to prevent immediate closure from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, anchorRef, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={portalRef}
      className="floating-portal"
      style={{
        position: 'absolute',
        top: `${portalPosition.top}px`,
        left: `${portalPosition.left}px`,
        zIndex,
        minWidth,
        minHeight,
        opacity: isPositioned ? 1 : 0,
        transition: 'opacity 120ms ease',
        pointerEvents: isPositioned ? 'auto' : 'none',
      }}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>,
    document.body
  );
}

// Helper: Find scrollable parent element
function findScrollParent(element) {
  if (!element) return null;
  
  let parent = element.parentElement;
  while (parent) {
    const { overflow, overflowY } = window.getComputedStyle(parent);
    if (/(auto|scroll)/.test(overflow + overflowY)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  
  return null;
}
