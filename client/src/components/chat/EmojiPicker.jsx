import { useState, useRef, useEffect } from 'react';
import EmojiPicker from 'emoji-picker-react';

export default function EmojiPickerComponent({ onSelect, onClose, position = 'top' }) {
  const pickerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const onEmojiClick = (emojiData) => {
    onSelect(emojiData.emoji);
    onClose?.();
  };

  return (
    <div
      ref={pickerRef}
      className="animate-fade-in-scale"
      style={{
        position: 'absolute',
        [position === 'top' ? 'bottom' : 'top']: '100%',
        right: 10,
        zIndex: 60,
        marginBottom: position === 'top' ? 8 : 0,
        marginTop: position === 'bottom' ? 8 : 0,
      }}
    >
      <EmojiPicker
        onEmojiClick={onEmojiClick}
        autoFocusSearch={true}
        width={320}
        height={400}
        searchPlaceholder="Search emoji..."
        previewConfig={{
          showPreview: false
        }}
        skinTonesDisabled
        searchDisabled={false}
        emojiStyle="native"
      />
    </div>
  );
}

