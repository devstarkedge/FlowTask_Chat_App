import { useState, useCallback } from "react";
import EmojiPickerPortal from "../../chat/EmojiPickerPortal";

/**
 * useCanvasEmojiPicker — manages emoji picker visibility and
 * handles emoji insertion into the editor.
 *
 * @param {{ editor: Editor|null, isViewOnly: boolean, emojiBtnRef: React.RefObject }} props
 */
export function useCanvasEmojiPicker({ editor, isViewOnly, emojiBtnRef }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleEmojiSelect = useCallback(
    (emoji) => {
      if (!editor) return;
      editor.chain().focus().insertContent(emoji).run();
      setShowEmojiPicker(false);
    },
    [editor],
  );

  const toggleEmojiPicker = useCallback(() => {
    setShowEmojiPicker((v) => !v);
  }, []);

  const EmojiPicker = (
    <EmojiPickerPortal
      anchorRef={emojiBtnRef}
      isOpen={showEmojiPicker}
      onClose={() => setShowEmojiPicker(false)}
      onSelect={handleEmojiSelect}
      position="top-start"
      zIndex={1100}
    />
  );

  return {
    showEmojiPicker,
    toggleEmojiPicker,
    EmojiPicker,
  };
}

export default useCanvasEmojiPicker;
