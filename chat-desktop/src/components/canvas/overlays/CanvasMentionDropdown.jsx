import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import MentionDropdown from "../../chat/MentionDropdown";
import { useChannelStore } from "../../../stores/channelStore";

/**
 * CanvasMentionDropdown — handles mention detection (@ trigger),
 * fetches channel members via useChannelStore, computes cursor-relative
 * position, manages keyboard navigation, and renders the dropdown via portal.
 *
 * @param {{ editor: Editor|null, isViewOnly: boolean, channelId: string|undefined }} props
 */
export function useCanvasMentionDropdown({ editor, isViewOnly, channelId }) {
  const [mentionType, setMentionType] = useState(null); // 'user' | null
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [activeIndex, setActiveIndex] = useState(0);

  // Fetch members from channel store when channelId changes
  const fetchMembers = useChannelStore((s) => s.fetchMembers);
  const members = useChannelStore(
    useCallback((s) => (channelId ? s.membersByChannel[channelId] : null), [channelId]),
  );

  useEffect(() => {
    if (channelId) {
      fetchMembers(channelId);
    }
  }, [channelId, fetchMembers]);

  // Compute filtered items based on mention query
  const items = useMemo(() => {
    if (mentionType !== "user" || !members || members.length === 0) return [];

    const q = mentionQuery.toLowerCase().trim();
    return members
      .filter((m) => {
        if (!q) return true;
        const name = (m.name || m.userId?.name || "").toLowerCase();
        const email = (m.email || m.userId?.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 10)
      .map((m) => ({
        id: m._id || m.userId?._id || m.userId,
        name: m.name || m.userId?.name || "Unknown",
        avatar: m.avatar || m.userId?.avatar,
        type: "user",
      }));
  }, [mentionType, mentionQuery, members]);

  // Reset active index when items change
  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

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
        const match = textBefore.match(/(@)([^\s@]*)$/);
        if (match) {
          const query = match[2];
          setMentionType("user");
          setMentionQuery(query);
          // Compute caret position in viewport coordinates
          try {
            const coords = editor.view.coordsAtPos(from);
            setMentionPosition({
              top: coords.bottom + 4,
              left: coords.left,
            });
          } catch (_) {
            // fall back to last known position on positioning errors
          }
        } else {
          setMentionType(null);
          setMentionQuery("");
        }
      } catch (err) {
        // Silently ignore detection errors
      }
    };
    detect();
    editor.on("update", detect);
    editor.on("selectionUpdate", detect);
    return () => {
      try {
        editor.off("update", detect);
        editor.off("selectionUpdate", detect);
      } catch (e) {
        // Ignore cleanup errors
      }
    };
  }, [editor]);

  // Close mention dropdown
  const closeMentions = useCallback(() => {
    setMentionType(null);
    setMentionQuery("");
    setActiveIndex(0);
  }, []);

  // Select a mention item
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
        const match = textBefore.match(/(@)([^\s@]*)$/);
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
                mentionType: "user",
              },
            },
            { type: "text", text: " " },
          ])
          .run();
        closeMentions();
      } catch (err) {
        // Ignore insertion errors
      }
    },
    [editor, closeMentions],
  );

  // Mention from toolbar button
  const handleMentionFromToolbar = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent("@").run();
  }, [editor]);

  // Keyboard navigation for mention dropdown
  const handleMentionKeyDown = useCallback(
    (event) => {
      if (!mentionType || items.length === 0) return false;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          event.stopPropagation();
          setActiveIndex((prev) => (prev + 1) % items.length);
          return true;
        case "ArrowUp":
          event.preventDefault();
          event.stopPropagation();
          setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
          return true;
        case "Enter":
        case "Tab":
          if (items[activeIndex]) {
            event.preventDefault();
            event.stopPropagation();
            handleMentionSelect(items[activeIndex]);
            return true;
          }
          return false;
        case "Escape":
          event.preventDefault();
          event.stopPropagation();
          closeMentions();
          return true;
        default:
          return false;
      }
    },
    [mentionType, items, activeIndex, handleMentionSelect, closeMentions],
  );

  const MentionDropdownPortal =
    mentionType && items.length > 0 && typeof document !== "undefined"
      ? createPortal(
          <MentionDropdown
            items={items}
            activeIndex={activeIndex}
            position={mentionPosition}
            onSelect={handleMentionSelect}
            onClose={closeMentions}
            setActiveIndex={setActiveIndex}
          />,
          document.body,
        )
      : null;

  return {
    mentionType,
    handleMentionFromToolbar,
    MentionDropdownPortal,
    handleMentionKeyDown,
  };
}

export default useCanvasMentionDropdown;