import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import EmojiPickerComponent from './EmojiPicker';
import './EmojiPickerPortal.css';

const PREFERRED_WIDTH = 380;
const PREFERRED_HEIGHT = 450;
const GUTTER = 8;

/**
 * Portal-based Emoji Picker wrapper
 * 
 * Solves thread panel emoji picker clipping issues by:
 * - Rendering emoji picker at document.body level via React Portal
 * - Intelligent viewport-aware positioning
 * - Automatic boundary detection and repositioning
 * - Never gets clipped by parent overflow: hidden
 * 
 * Usage in MessageInput, ThreadPanel, MessageItem, etc.:
 * <EmojiPickerPortal
 *   anchorRef={buttonRef}
 *   isOpen={showPicker}
 *   onClose={() => setShowPicker(false)}
 *   onSelect={(emoji) => handleEmoji(emoji)}
 *   position="top-start"
 * />
 */
export default function EmojiPickerPortal({
  anchorRef,
  isOpen,
  onClose,
  onSelect,
  position = 'bottom-start',
  zIndex = 1000
}) {
  const pickerRef = useRef(null);
  const [bounds, setBounds] = useState(null);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef?.current) {
      setBounds(null);
      return;
    }

    const anchor = anchorRef.current;
    const viewport = window.visualViewport;
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportWidth = viewport?.width || document.documentElement.clientWidth;
      const viewportHeight = viewport?.height || window.innerHeight;
      const leftEdge = viewportLeft + GUTTER;
      const topEdge = viewportTop + GUTTER;
      const bottomEdge = viewportTop + viewportHeight - GUTTER;
      const width = Math.min(PREFERRED_WIDTH, Math.max(0, viewportWidth - 2 * GUTTER));
      const above = Math.max(0, rect.top - GUTTER - topEdge);
      const below = Math.max(0, bottomEdge - rect.bottom - GUTTER);
      const [preferredSide, alignment = 'start'] = position.split('-');
      const useTop = preferredSide === 'top'
        ? above >= PREFERRED_HEIGHT || above >= below
        : !(below >= PREFERRED_HEIGHT || below >= above);
      const height = Math.min(PREFERRED_HEIGHT, useTop ? above : below);
      const anchorLeft = alignment === 'end' ? rect.right - width
        : alignment === 'center' ? rect.left + (rect.width - width) / 2 : rect.left;
      const left = Math.max(leftEdge, Math.min(anchorLeft, viewportLeft + viewportWidth - GUTTER - width));
      const top = Math.max(topEdge, Math.min(
        useTop ? rect.top - GUTTER - height : rect.bottom + GUTTER,
        bottomEdge - height,
      ));
      const next = { top, left, width, height };
      setBounds((previous) => previous && Object.keys(next).every((key) => previous[key] === next[key])
        ? previous : next);
    };

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    // Composer growth or surrounding layout changes can move the trigger.
    for (let element = anchor; element; element = element.parentElement) {
      observer.observe(element);
    }
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    viewport?.addEventListener('resize', updatePosition);
    viewport?.addEventListener('scroll', updatePosition);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      viewport?.removeEventListener('resize', updatePosition);
      viewport?.removeEventListener('scroll', updatePosition);
    };
  }, [isOpen, anchorRef, position]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const handleOutsidePointer = (event) => {
      if (!pickerRef.current?.contains(event.target) && !anchorRef?.current?.contains(event.target)) {
        onClose?.('outside');
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer, true);
  }, [isOpen, anchorRef, onClose]);

  if (!isOpen || !bounds || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={pickerRef}
      className="emoji-picker-portal"
      style={{ position: 'fixed', ...bounds, zIndex }}
    >
      <EmojiPickerComponent
        onSelect={onSelect}
        onClose={onClose}
        width="100%"
        height="100%"
      />
    </div>,
    document.body,
  );
}
