import { useRef, useCallback } from 'react';
import FloatingPortal from './FloatingPortal';
import EmojiPickerComponent from './EmojiPicker';

/**
 * Portal-based Emoji Picker wrapper
 * 
 * Solves thread panel emoji picker clipping issues by:
 * - Rendering emoji picker at document.body level via React Portal
 * - Intelligent viewport-aware positioning
 * - Automatic boundary detection and repositioning
 * - Never gets clipped by parent overflow: hidden
 * 
 * Usage in ThreadPanel, MessageItem, etc.:
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
  const pickerAnchorRef = useRef(null);

  const handleSelect = useCallback((emoji) => {
    onSelect?.(emoji);
    onClose?.();
  }, [onSelect, onClose]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <FloatingPortal
      anchorRef={anchorRef || pickerAnchorRef}
      isOpen={isOpen}
      onClose={handleClose}
      position={position}
      offset={8}
      zIndex={zIndex}
      minWidth={380}
      minHeight={450}
    >
      <div ref={pickerAnchorRef}>
        <EmojiPickerComponent
          onSelect={handleSelect}
          onClose={handleClose}
          position={position.includes('top') ? 'top' : 'bottom'}
        />
      </div>
    </FloatingPortal>
  );
}
