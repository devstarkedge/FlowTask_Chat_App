import { useRef, useEffect, lazy, Suspense, useCallback } from 'react';
import { useThemeStore } from '../../stores/themeStore';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

/**
 * Production-ready Emoji Picker Component
 * - Integrates with FlowTask theme store (reactive theme changes)
 * - Designed to be used inside EmojiPickerPortal for proper positioning
 * - Accessible keyboard navigation
 * - Slack-quality UI
 */
export default function EmojiPickerComponent({ onSelect, onClose, width = 380, height = 450 }) {
  const pickerRef = useRef(null);

  // Get reactive theme from FlowTask store (NO window.matchMedia!)
  const effectiveTheme = useThemeStore((state) => state.effectiveTheme);

  // Map FlowTask theme to emoji-picker-react Theme enum
  const pickerTheme = effectiveTheme === 'dark' ? 'dark' : 'light';

  // Outside pointers are handled by EmojiPickerPortal.
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.('escape');
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Emoji selection handler
  const onEmojiClick = useCallback((emojiData) => {
    onSelect?.(emojiData.emoji);
    onClose?.();
  }, [onSelect, onClose]);

  return (
    <div
      ref={pickerRef}
      className="emoji-picker-wrapper"
      style={{
        width,
        height,
        boxSizing: 'border-box',
        borderRadius: 'var(--radius-xl, 12px)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.3))',
        border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
      }}
      role="dialog"
      aria-label="Emoji picker"
    >
      <Suspense
        fallback={
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-lg)',
            }}
          />
        }
      >
        <EmojiPicker
          onEmojiClick={onEmojiClick}
          autoFocusSearch={true}
          width="100%"
          height="100%"
          searchPlaceholder="Search emoji..."
          previewConfig={{
            showPreview: false
          }}
          skinTonesDisabled={true}
          searchDisabled={false}
          emojiStyle="apple"
          theme={pickerTheme}
          categories={[
            'suggested',
            'smileys_people',
            'animals_nature',
            'food_drink',
            'travel_places',
            'activities',
            'objects',
            'symbols',
            'flags',
          ]}
          defaultSkinTone="neutral"
        />
      </Suspense>
    </div>
  );
}
