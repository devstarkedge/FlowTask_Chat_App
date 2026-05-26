import {
  AtSign,
  Bot,
  CalendarClock,
  CheckSquare,
  Code2,
  Columns3,
  File,
  Heading1,
  Image,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table2,
  Type,
} from "lucide-react";
// import MentionDropdown from "../../chat/MentionDropdown";
import { useCallback } from "react";

const RECENT_KEY = "flowtask.canvas.recentCommands";

function insertParagraph(editor, text) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    })
    .run();
}

export const COMMAND_GROUPS = [
  {
    id: "basic",
    label: "Basic",
    commands: [
      {
        id: "text",
        label: "Text",
        description: "Start with plain text",
        icon: Type,
        keywords: ["paragraph", "body"],
        run: (editor) => editor.chain().focus().setParagraph().run(),
      },
      {
        id: "heading",
        label: "Heading",
        description: "Large section heading",
        icon: Heading1,
        keywords: ["title", "h1"],
        run: (editor) =>
          editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        id: "checklist",
        label: "Checklist",
        description: "Track tasks with checkboxes",
        icon: CheckSquare,
        keywords: ["todo", "task", "check"],
        run: (editor) => editor.chain().focus().toggleTaskList().run(),
      },
      {
        id: "bullet-list",
        label: "Bullet List",
        description: "Simple unordered list",
        icon: List,
        keywords: ["list", "ul"],
        run: (editor) => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: "number-list",
        label: "Number List",
        description: "Ordered steps",
        icon: ListOrdered,
        keywords: ["ordered", "ol"],
        run: (editor) => editor.chain().focus().toggleOrderedList().run(),
      },
    ],
  },
  {
    id: "media",
    label: "Media",
    commands: [
      {
        id: "image",
        label: "Image",
        description: "Embed an image URL",
        icon: Image,
        keywords: ["photo", "picture"],
        run: (editor) => {
          const src = window.prompt("Image URL");
          if (src) editor.chain().focus().setImage({ src }).run();
        },
      },
      {
        id: "file",
        label: "File",
        description: "Add a file placeholder",
        icon: File,
        keywords: ["attachment", "upload"],
        run: (editor) => insertParagraph(editor, "Attach a file"),
      },
      {
        id: "embed",
        label: "Embed",
        description: "Paste a link preview",
        icon: Link,
        keywords: ["url", "preview"],
        run: (editor) => {
          const href = window.prompt("Embed URL");
          if (href) {
            editor
              .chain()
              .focus()
              .insertContent({
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: href,
                    marks: [{ type: "link", attrs: { href } }],
                  },
                ],
              })
              .run();
          }
        },
      },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    commands: [
      {
        id: "table",
        label: "Table",
        description: "Insert a 3 by 3 table",
        icon: Table2,
        keywords: ["grid", "cells"],
        run: (editor) =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
      },
      {
        id: "code",
        label: "Code",
        description: "Code block with monospace text",
        icon: Code2,
        keywords: ["snippet", "developer"],
        run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        id: "columns",
        label: "Columns",
        description: "Create a lightweight two-column layout",
        icon: Columns3,
        keywords: ["layout", "split"],
        run: (editor) =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 1, cols: 2, withHeaderRow: false })
            .run(),
      },
      {
        id: "quote",
        label: "Quote",
        description: "Highlight a passage",
        icon: Quote,
        keywords: ["blockquote"],
        run: (editor) => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: "divider",
        label: "Divider",
        description: "Separate sections",
        icon: Minus,
        keywords: ["rule", "separator"],
        run: (editor) => editor.chain().focus().setHorizontalRule().run(),
      },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    commands: [
      {
        id: "mention",
        label: "Mention",
        description: "Mention a teammate",
        icon: AtSign,
        keywords: ["person", "user"],
        onClick: () => {
          editorRef.current?.insertText("@");
          detectMention();
        },
        run: (editor) => insertParagraph(editor, "@"),
      },
      {
        id: "reminder",
        label: "Reminder",
        description: "Add a reminder line",
        icon: CalendarClock,
        keywords: ["date", "follow up"],
        run: (editor) => insertParagraph(editor, "Reminder: "),
      },
      {
        id: "ai-draft",
        label: "AI Draft",
        description: "Insert an AI-ready drafting prompt",
        icon: Bot,
        keywords: ["generate", "summarize", "assistant"],
        run: (editor) => insertParagraph(editor, "AI prompt: "),
      },
    ],
  },
];

export function getRecentCommandIds() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function rememberCommand(commandId) {
  const next = [
    commandId,
    ...getRecentCommandIds().filter((id) => id !== commandId),
  ].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function getAllCommands() {
  // const detectMention = useCallback(() => {
  //   const ed = editorRef.current;
  //   if (!ed) return;

  //   const textBefore = ed.getTextBeforeCursor();
  //   if (!textBefore) {
  //     setMentionType(null);
  //     return;
  //   }

  //   // Look backwards for @ or # trigger
  //   const match = textBefore.match(/([@#])([^\s@#]*)$/);
  //   if (match) {
  //     const triggerChar = match[1];
  //     const query = match[2];
  //     setMentionType(triggerChar === "@" ? "user" : "channel");
  //     setMentionQuery(query);
  //   } else {
  //     setMentionType(null);
  //   }
  // }, []);

  // const handleMentionSelect = useCallback(
  //   (item) => {
  //     const ed = editorRef.current;
  //     if (!ed) return;

  //     const tiptap = ed.getEditor();
  //     if (!tiptap) return;

  //     // Delete the trigger character + query text
  //     const textBefore = ed.getTextBeforeCursor();
  //     const match = textBefore.match(/([@#])([^\s@#]*)$/);
  //     if (match) {
  //       const deleteCount = match[0].length;
  //       const { from } = tiptap.state.selection;
  //       tiptap
  //         .chain()
  //         .focus()
  //         .deleteRange({ from: from - deleteCount, to: from })
  //         .run();
  //     }

  //     // Insert mention node
  //     ed.insertMention(
  //       item.id,
  //       item.name,
  //       mentionType === "user" ? "user" : "channel",
  //     );
  //     setMentionType(null);
  //     setMentionQuery("");
  //   },
  //   [mentionType],
  // );

  // const handleKeyDown = useCallback(
  //   (event) => {
  //     if (mentionType) {
  //       if (["ArrowUp", "ArrowDown", "Tab", "Enter"].includes(event.key)) {
  //         return false;
  //       }
  //       if (event.key === "Escape") {
  //         event.preventDefault();
  //         setMentionType(null);
  //         return true;
  //       }
  //     }

  //     if (event.key === "Escape") {
  //       if (showEmoji) {
  //         setShowEmoji(false);
  //         return true;
  //       }
  //       if (showLinkModal) {
  //         setShowLinkModal(false);
  //         return true;
  //       }
  //     }

  //     return false;
  //   },
  //   [mentionType, showEmoji, showLinkModal],
  // );

  return COMMAND_GROUPS.flatMap((group) =>
    group.commands.map((command) => ({
      ...command,
      group: group.label,
    })),
  );
  {
    /* Mention Dropdown */
  }
  // {
  //   mentionType && (
  //     <MentionDropdown
  //       type={mentionType}
  //       query={mentionQuery}
  //       channelId={channelId}
  //       position={{ bottom: "100%", left: 0 }}
  //       onSelect={handleMentionSelect}
  //       onClose={() => setMentionType(null)}
  //     />
  //   );
  // }
}

export function fuzzyMatch(command, query) {
  if (!query) return true;
  const haystack = [
    command.label,
    command.description,
    command.group,
    ...(command.keywords || []),
  ]
    .join(" ")
    .toLowerCase();

  let cursor = 0;
  const needle = query.toLowerCase();
  for (const char of needle) {
    cursor = haystack.indexOf(char, cursor);
    if (cursor === -1) return false;
    cursor += 1;
  }
  return true;
}

export function runSlashCommand(editor, command, range) {
  if (!editor || !command) return;

  const chain = editor.chain().focus();
  if (range) {
    chain.deleteRange(range).run();
  }

  command.run(editor);
  rememberCommand(command.id);
}
