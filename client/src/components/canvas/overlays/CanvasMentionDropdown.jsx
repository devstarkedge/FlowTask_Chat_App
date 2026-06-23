import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import MentionDropdown from "../../chat/MentionDropdown";

/**
 * CanvasMentionDropdown — handles mention detection (@ and # triggers),
 * computes cursor-relative position, and renders the dropdown via portal.
 *
 * @param {{ editor: Editor|null, isViewOnly: boolean, channelId: string|undefined }} props
 */
export function useCanvasMentionDropdown({ editor, isViewOnly, channelId }) {
  const [mentionType, setMentionType] = useState(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });

  // Mention detection — computes cursor-relative position for the dropdown
  useEffect(() => {
    if (!editor) return undefined;
    const detect = () => {
      try {
        const { state } = editor;
        const { from } = state.selection;
        const textBefore = state.doc.textBetween(
          Math.max(0, from - 50),
          from,
          "\n",
        );
        if (!textBefore) {
          setMentionType(null);
          setMentionQuery("");
          return;
        }
        const match = textBefore.match(/([@#])([^\s@#]*)$/);
        if (match) {
          const triggerChar = match[1];
          const query = match[2];
          setMentionType(triggerChar === "@" ? "user" : "channel");
          setMentionQuery(query);
          // Compute caret position in viewport coordinates
          try {
            const coords = editor.view.coordsAtPos(from);
            setMentionPosition({
              top: coords.bottom + 4, // 4px below the caret baseline
              left: coords.left,
            });
          } catch (_) {
            // fall back to last known position on positioning errors
          }
        } else {
          setMentionType(null);
          setMentionQuery("");
        }
      } catch (err) {}
    };
    detect();
    editor.on("update", detect);
    editor.on("selectionUpdate", detect);
    return () => {
      try {
        editor.off("update", detect);
        editor.off("selectionUpdate", detect);
      } catch (e) {}
    };
  }, [editor]);

  const handleMentionSelect = useCallback(
    (item) => {
      if (!editor) return;
      try {
        const { state } = editor;
        const { from } = state.selection;
        const textBefore = state.doc.textBetween(
          Math.max(0, from - 50),
          from,
          "\n",
        );
        const match = textBefore.match(/([@#])([^\s@#]*)$/);
        if (match) {
          const deleteCount = match[0].length;
          editor
            .chain()
            .focus()
            .deleteRange({ from: from - deleteCount, to: from })
            .run();
        }
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "mention",
              attrs: {
                id: item.id,
                label: item.name,
                mentionType: mentionType === "user" ? "user" : "channel",
              },
            },
            { type: "text", text: " " },
          ])
          .run();
        setMentionType(null);
        setMentionQuery("");
      } catch (err) {}
    },
    [editor, mentionType, isViewOnly],
  );

  // Mention from toolbar button
  const handleMentionFromToolbar = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent("@").run();
  }, [editor]);

  const MentionDropdownPortal =
    mentionType && typeof document !== "undefined"
      ? createPortal(
          <MentionDropdown
            type={mentionType}
            query={mentionQuery}
            channelId={channelId}
            position={mentionPosition}
            onSelect={handleMentionSelect}
            onClose={() => setMentionType(null)}
          />,
          document.body,
        )
      : null;

  return {
    mentionType,
    handleMentionFromToolbar,
    MentionDropdownPortal,
  };
}

export default useCanvasMentionDropdown;
