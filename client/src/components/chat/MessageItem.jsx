import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { format } from "date-fns";
import {
  Smile,
  MessageSquare,
  Edit,
  Trash2,
  Pin,
  FileText,
  Download,
  Image as ImageIcon,
  File,
  FileArchive,
  FileCode,
  Film,
  Music,
  Check,
  CheckCheck,
  CheckSquare,
  Square,
  Copy,
  Bookmark,
  BookmarkCheck,
  Forward,
  Link2,
  MoreVertical,
  Info,
  ChevronDown,
  X,
  Save,
} from "lucide-react";
import { useLaterStore } from "../../stores/laterStore";
import SlackFileCard from "./SlackFileCard";
import { ReactionRenderer } from "../shared/EmojiRenderer";
import { Avatar } from "./MemberAvatarGroup";
import EmojiPicker from "./EmojiPicker";
import EmojiPickerPortal from "./EmojiPickerPortal";
import { sanitizeHtml } from "../../utils/sanitize";
import { extractPlainText } from "../../utils/extractPlainText";
import toast from "react-hot-toast";
import { handleDownload } from "../../utils/handleDownload";
import { getFileUrl, getFileAssetId } from "../../utils/fileProxy";
import MessageDetailsPanel from "./MessageDetailsPanel";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import RichTextEditor from "./RichTextEditor";
import FormattingToolbar from "./FormattingToolbar";

// ─── Inject styles once ───────────────────────────────────────────────────────
const STYLE_ID = "msg-item-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes msgPinnedPulse {
      0%   { background: color-mix(in srgb, var(--accent-color, #1264a3) 28%, transparent);
              box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent-color, #1264a3) 40%, transparent); }
      55%  { background: color-mix(in srgb, var(--accent-color, #1264a3) 12%, transparent);
              box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent-color, #1264a3) 18%, transparent); }
      100% { background: transparent; box-shadow: none; }
    }
    .msg-pinned-active {
      animation: msgPinnedPulse 2s ease forwards !important;
      border-radius: 8px;
    }

    /* ── Inline Editor ── */
    .inline-editor-wrap {
      width: 100%;
      border-radius: 10px;
      overflow: hidden;
      border: 1.5px solid var(--accent-primary, #1264a3);
      background: var(--bg-primary, #1a1d21);
      box-shadow: 0 2px 12px rgba(0,0,0,0.18);
      animation: inlineEditorIn 140ms cubic-bezier(0.2, 0, 0.13, 1.3) both;
      margin-bottom: 8px;
    }
    @keyframes inlineEditorIn {
      from { opacity: 0; transform: scaleY(0.94); transform-origin: top; }
      to   { opacity: 1; transform: scaleY(1); }
    }

    .inline-editor-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 5px 8px;
      border-bottom: 1px solid var(--border-primary, rgba(255,255,255,0.1));
      background: var(--bg-secondary, #222529);
      flex-wrap: wrap;
    }

    .inline-editor-content {
      min-height: 60px;
      max-height: 200px;
      overflow-y: auto;
    }

    /* Override TipTap editor padding inside the inline editor */
    .inline-editor-content .ProseMirror {
      padding: 10px 14px;
      font-size: 15px;
      line-height: 1.5;
      color: var(--text-primary, #d1d2d3);
      outline: none;
      min-height: 60px;
    }
    .inline-editor-content .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      color: var(--text-muted, #666);
      pointer-events: none;
      float: left;
      height: 0;
    }

    .inline-editor-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px 8px;
      border-top: 1px solid var(--border-primary, rgba(255,255,255,0.08));
      background: var(--bg-secondary, #222529);
      gap: 8px;
      flex-shrink: 0;
      border-radius: 0 0 10px 10px;
    }
    .inline-editor-hint {
      font-size: 11px;
      color: var(--text-muted, #666);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: 0.01em;
      flex-shrink: 1;
      min-width: 0;
    }
    .inline-editor-hint kbd {
      display: inline-block;
      padding: 1px 4px;
      font-size: 10px;
      font-family: inherit;
      background: var(--bg-hover, rgba(255,255,255,0.07));
      border: 1px solid var(--border-secondary, rgba(255,255,255,0.12));
      border-radius: 3px;
      color: var(--text-secondary, #9b9b9b);
      margin: 0 1px;
    }
    .inline-editor-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .inline-editor-cancel-btn {
      height: 28px;
      padding: 0 12px;
      font-size: 12.5px;
      font-weight: 500;
      font-family: inherit;
      border-radius: 6px;
      border: 1px solid var(--border-secondary, rgba(255,255,255,0.15));
      background: transparent;
      color: var(--text-secondary, #9b9b9b);
      cursor: pointer;
      transition: background 110ms ease, color 110ms ease, border-color 110ms ease;
      white-space: nowrap;
    }
    .inline-editor-cancel-btn:hover {
      background: var(--bg-hover, rgba(255,255,255,0.07));
      color: var(--text-primary, #d1d2d3);
      border-color: var(--border-primary, rgba(255,255,255,0.2));
    }
    .inline-editor-save-btn {
      height: 28px;
      padding: 0 14px;
      font-size: 12.5px;
      font-weight: 600;
      font-family: inherit;
      border-radius: 6px;
      border: none;
      background: var(--accent-primary, #1264a3);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: background 110ms ease, transform 80ms ease, opacity 110ms ease;
      white-space: nowrap;
    }
    .inline-editor-save-btn:hover {
      background: color-mix(in srgb, var(--accent-primary, #1264a3) 85%, white 15%);
    }
    .inline-editor-save-btn:active {
      transform: scale(0.96);
    }
    .inline-editor-save-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(s);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isImage(mimeType) {
  return mimeType?.startsWith("image/");
}
function isVideo(mimeType) {
  return mimeType?.startsWith("video/");
}
function isAudio(mimeType) {
  return mimeType?.startsWith("audio/");
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0,
    size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileIcon(mimeType) {
  if (mimeType?.startsWith("image/")) return ImageIcon;
  if (mimeType?.startsWith("video/")) return Film;
  if (mimeType?.startsWith("audio/")) return Music;
  if (
    mimeType?.includes("pdf") ||
    mimeType?.includes("document") ||
    mimeType?.includes("word")
  )
    return FileText;
  if (
    mimeType?.includes("zip") ||
    mimeType?.includes("rar") ||
    mimeType?.includes("tar") ||
    mimeType?.includes("gzip")
  )
    return FileArchive;
  if (
    mimeType?.includes("json") ||
    mimeType?.includes("javascript") ||
    mimeType?.includes("xml")
  )
    return FileCode;
  return File;
}

const MESSAGE_EDIT_WINDOW_MS = 10 * 60 * 1000;

// ─── InlineEditor ─────────────────────────────────────────────────────────────

/**
 * Inline message editor — uses RichTextEditor (TipTap) and the shared
 * FormattingToolbar. Formatting is preserved because we pass `html` (TipTap
 * HTML output) to `onSave`, which the store stores as `htmlContent`.
 */
function InlineEditor({ initialHtml, initialText, onSave, onCancel }) {
  const editorRef = useRef(null);
  const wrapRef = useRef(null);

  const [formatState, setFormatState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
    code: false,
    codeBlock: false,
  });

  // Sync active marks from TipTap into local state
  const syncFormatState = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    setFormatState({
      bold: ed.isActive("bold"),
      italic: ed.isActive("italic"),
      underline: ed.isActive("underline"),
      strike: ed.isActive("strike"),
      bulletList: ed.isActive("bulletList"),
      orderedList: ed.isActive("orderedList"),
      blockquote: ed.isActive("blockquote"),
      code: ed.isActive("code"),
      codeBlock: ed.isActive("codeBlock"),
    });
  }, []);

  // Populate editor with the message's existing HTML (or plain text fallback)
  useEffect(() => {
    const timer = setTimeout(() => {
      const ed = editorRef.current;
      if (!ed) return;

      if (initialHtml) {
        ed.setContent(initialHtml);
      } else if (initialText) {
        ed.setContent(initialText);
      }

      ed.focus("end");
      syncFormatState();

      // Scroll into view gently after DOM update
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          wrapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      });
    }, 50);

    return () => clearTimeout(timer);
  }, [initialHtml, initialText, syncFormatState]);

  // Escape key cancels edit
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const handleSave = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;

    const { html, text } = ed.getContent();

    // Require at least some non-whitespace text content
    if (!text?.trim()) return;

    // Pass both HTML (for rich rendering) and plain text (for search/preview)
    onSave(html, text);
  }, [onSave]);

  // onInput from RichTextEditor receives { html, text, isEmpty } — we only need
  // to re-sync the active-mark state so toolbar buttons update correctly.
  const handleEditorInput = useCallback(() => {
    syncFormatState();
  }, [syncFormatState]);

  return (
    <div className="inline-editor-wrap" ref={wrapRef}>
      {/* Toolbar — shared FormattingToolbar in compact variant */}
      <div className="inline-editor-toolbar">
        <FormattingToolbar
          editorRef={editorRef}
          formatState={formatState}
          onFormatChange={syncFormatState}
          variant="compact"
        />
      </div>

      {/* TipTap editor */}
      <div className="inline-editor-content">
        <RichTextEditor
          ref={editorRef}
          placeholder="Edit message…"
          onInput={handleEditorInput}
          onSubmit={handleSave}
        />
      </div>

      {/* Footer */}
      <div className="inline-editor-footer">
        <span className="inline-editor-hint">
          <kbd>Shift+Enter</kbd> new line · <kbd>Escape</kbd> cancel
        </span>
        <div className="inline-editor-actions">
          <button className="inline-editor-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="inline-editor-save-btn" onClick={handleSave}>
            <Save size={12} />
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MessageItem ─────────────────────────────────────────────────────────────

const MessageItem = memo(
  function MessageItem({
    message,
    compact,
    isLastInGroup,
    onOpenThread,
    onOpenProfile,
    onOpenFilePreview,
    isDMChannel,
    onSaveMessage,
    isPinnedHighlight,
    onForwardMessage,
    isSelecting,
    isSelected,
    onSelectMessage,
  }) {
    const { user } = useAuthStore();
    const {
      addReaction,
      removeReaction,
      editMessage,
      deleteMessage,
      retryMessage,
      pinMessage,
      unpinMessage,
      highlightMessageId,
      messageIdToDelete,
      setMessageIdToDelete,
      clearMessageIdToDelete,
      editingMessageId,
      setEditingMessageId,
      clearEditingMessageId,
    } = useChatStore();
    const { confirm } = useDeleteConfirm();
    
    // Derive edit state from global store (single source of truth)
    const isEditing = editingMessageId === message._id;

    const isSaved = useLaterStore((s) => s.savedMessageIds.has(message._id));

    const [showActions, setShowActions] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showMessageDetails, setShowMessageDetails] = useState(false);

    const messageRef = useRef(null);
    const moreMenuRef = useRef(null);
    const emojiButtonRef = useRef(null);

    // ── Pinned-highlight animation ───────────────────────────────────────────
    useEffect(() => {
      if (!isPinnedHighlight) return;
      const el = messageRef.current;
      if (!el) return;
      el.classList.remove("msg-pinned-active");
      void el.offsetWidth;
      el.classList.add("msg-pinned-active");
      const t = setTimeout(
        () => el.classList.remove("msg-pinned-active"),
        2100,
      );
      return () => clearTimeout(t);
    }, [isPinnedHighlight]);


    // ── Close reaction picker on outside click / Escape ──────────────────────
    useEffect(() => {
      if (!showReactionPicker) return;
      const onDown = (e) => {
        if (messageRef.current && !messageRef.current.contains(e.target)) {
          setShowReactionPicker(false);
          setShowActions(false);
        }
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          setShowReactionPicker(false);
          setShowActions(false);
        }
      };
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("keydown", onKey);
      };
    }, [showReactionPicker]);

    // ── Close more-menu on outside click / Escape ────────────────────────────
    useEffect(() => {
      if (!showMoreMenu) return;
      const onDown = (e) => {
        if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
          setShowMoreMenu(false);
          setShowActions(false);
        }
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          setShowMoreMenu(false);
          setShowActions(false);
        }
      };
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("keydown", onKey);
      };
    }, [showMoreMenu]);

    // ── Handle forward attachment ─────────────────────────────────────────────
    // When a specific file is passed (from SlackFileCard's per-file Forward button),
    // build a synthetic message containing ONLY that file — not all attachments.
    // Also pass attachmentFileIds so the backend clones only the targeted file.
    // When no file is passed (message-level forward), forward the full message.
    const handleForwardAttachment = useCallback((file) => {
      if (file) {
        // Re-derive attachments (same logic as the render path below)
        const atts = message.fileReferences?.length > 0
          ? message.fileReferences
              .map((ref) =>
                ref.fileId
                  ? {
                      ...ref.fileId,
                      url: getFileUrl(ref.fileId) || ref.fileId.url,
                      messageId: ref.messageId || message._id,
                      channelId: ref.channelId || message.channelId,
                      workspaceId: ref.workspaceId || message.workspaceId,
                      contextType: ref.contextType || (message.threadId ? "thread" : "channel"),
                    }
                  : null,
              )
              .filter(Boolean)
          : message.attachments || [];

        // Only filter when the message actually has multiple attachments
        if (atts.length > 1) {
          const fileId = file._id || file.fileId || file.assetId;
          const fileName = file.originalName || file.fileName || file.name;

          // Find the specific attachment by _id first, then fall back to name match
          const matchedAtt = atts.find(
            (a) =>
              (fileId && (a._id === fileId || String(a._id) === String(fileId))) ||
              (fileName && (a.originalName || a.fileName || a.name) === fileName),
          ) || file;

          // Find matching fileReference so the backend clones only this one
          const matchedRef = message.fileReferences?.find((ref) => {
            const refFileId = ref.fileId?._id || ref.fileId;
            return (
              (fileId && String(refFileId) === String(fileId)) ||
              (fileName && (ref.fileId?.originalName || ref.fileId?.fileName) === fileName)
            );
          });

          const forwardMsg = {
            ...message,
            attachments: [matchedAtt],
            fileReferences: matchedRef ? [matchedRef] : [],
          };
          // Pass attachmentFileIds so the backend filters the cloned file references
          onForwardMessage?.(forwardMsg, { attachmentFileIds: fileId ? [fileId] : undefined });
          return;
        }
      }
      // Single-attachment message or no specific file → forward full message
      onForwardMessage?.(message);
    }, [onForwardMessage, message]);

    const isOwn =
      message.authorId?._id === user?._id || message.authorId === user?._id;
    const isSystem = message.contentType === "system" && !message.activityMeta;
    const isPending = message.pending === true;
    const isFailed = message.failed === true;
    const isDeleted = message.isDeleted === true;
    const canEdit =
      isOwn &&
      !isDeleted &&
      Date.now() - new Date(message.createdAt).getTime() <
        MESSAGE_EDIT_WINDOW_MS;

    const authorName =
      message.senderSnapshot?.name || message.authorId?.name || "FlowTask Bot";
    const authorAvatar =
      message.senderSnapshot?.avatar ||
      (typeof message.authorId === "object" ? message.authorId?.avatar : null);
    const authorData =
      typeof message.authorId === "object"
        ? message.authorId
        : { _id: message.authorId, name: authorName, avatar: authorAvatar };
    const time = format(new Date(message.createdAt), "h:mm a");
    const deletedText = isOwn
      ? "You deleted this message"
      : "This message was deleted";
    const deletedTextColor = isOwn
      ? "var(--text-muted)"
      : "var(--text-secondary)";

    /**
     * Called by InlineEditor when the user saves.
     * `html`  — TipTap HTML (bold, lists, code, etc.) — stored as htmlContent
     * `text`  — plain-text equivalent              — stored as content
     */
    const handleEdit = useCallback(
      (html, text) => {
        if (text?.trim()) {
          editMessage(message._id, {
            content: text,
            htmlContent: html,
          });
        }
        clearEditingMessageId();
      },
      [editMessage, message._id, clearEditingMessageId],
    );

    const handleReaction = (emoji) => {
      const existing = message.reactions?.find(
        (r) =>
          r.emoji === emoji &&
          (r.users?.includes(user?._id) ||
            r.userIds?.some((id) => id?.toString() === user?._id)),
      );
      if (existing) removeReaction(message._id, emoji);
      else addReaction(message._id, emoji);
      setShowReactionPicker(false);
    };

    const derivedAttachments =
      message.fileReferences?.length > 0
        ? message.fileReferences
            .map((ref) =>
              ref.fileId
                ? {
                    ...ref.fileId,
                    url: getFileUrl(ref.fileId) || ref.fileId.url,
                    // Include FileReference metadata for navigation
                    messageId: ref.messageId || message._id,
                    channelId: ref.channelId || message.channelId,
                    workspaceId: ref.workspaceId || message.workspaceId,
                    contextType:
                      ref.contextType ||
                      (message.threadId ? "thread" : "channel"),
                  }
                : null,
            )
            .filter(Boolean)
        : message.attachments || [];

    // System messages
    if (isSystem) {
      return (
        <div className="flex items-center gap-3 py-2 px-5 my-1 animate-fade-in">
          <div
            className="flex-1 h-px"
            style={{ background: "var(--border-secondary)" }}
          />
          <p
            className="text-xs italic px-2"
            style={{ color: "var(--text-muted)" }}
          >
            {message.content}
          </p>
          <div
            className="flex-1 h-px"
            style={{ background: "var(--border-secondary)" }}
          />
        </div>
      );
    }

    const renderDeliveryStatus = () => {
      if (!isDMChannel || !isOwn || isPending || isFailed) return null;
      const status = message.status || "sent";
      if (status === "seen")
        return (
          <span title="Seen" className="inline-flex items-center ml-1">
            <CheckCheck size={13} style={{ color: "var(--accent-primary)" }} />
          </span>
        );
      if (status === "delivered")
        return (
          <span title="Delivered" className="inline-flex items-center ml-1">
            <CheckCheck size={13} style={{ color: "var(--text-muted)" }} />
          </span>
        );
      return (
        <span title="Sent" className="inline-flex items-center ml-1">
          <Check size={13} style={{ color: "var(--text-muted)" }} />
        </span>
      );
    };

    const groupPos =
      !compact && isLastInGroup
        ? "solo"
        : !compact
          ? "first"
          : isLastInGroup
            ? "last"
            : "middle";

    // ── Full-width editing layout ─────────────────────────────────────────────
    if (isEditing) {
      return (
        <div
          id={`msg-${message._id}`}
          ref={messageRef}
          style={{ marginTop: compact ? 2 : 12, padding: "4px 16px 16px" }}
        >
          {/* Name row */}
          {!compact && (
            <div
              className={`flex items-baseline gap-1.5 mb-2 px-1 ${isOwn ? "justify-end" : ""}`}
            >
              <span
                className="font-semibold text-[13px] cursor-pointer hover:underline"
                style={{ color: "var(--text-white)" }}
                onClick={() => onOpenProfile?.(authorData)}
              >
                {authorName}
              </span>
              <span
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                {time}
              </span>
              {message.isEdited && (
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  (edited)
                </span>
              )}
            </div>
          )}
          {/* Full-width editor */}
          <InlineEditor
            initialHtml={message.htmlContent || ""}
            initialText={message.content}
            onSave={handleEdit}
            onCancel={clearEditingMessageId}
          />
        </div>
      );
    }

    // ── Message content renderer ──────────────────────────────────────────────
    /**
     * Render priority:
     * 1. Deleted → tombstone
     * 2. htmlContent present → sanitised rich HTML (covers all edited/sent rich messages)
     * 3. Fallback → plain text
     *
     * The `rich-message-content` CSS class (injected by FormattingToolbar.jsx)
     * styles TipTap's output: paragraphs, lists, code blocks, blockquotes, etc.
     */
    const renderMessageContent = () => {
      // Deleted Message
      if (isDeleted) {
        return (
          <div
            className="message-content text-[16px] leading-relaxed italic"
            style={{ color: deletedTextColor }}
          >
            {deletedText}
          </div>
        );
      }

      // Rich HTML Message
      if (
        message.htmlContent &&
        typeof message.htmlContent === "string" &&
        message.htmlContent.trim() !== ""
      ) {
        return (
          <div
            className="message-content rich-message-content text-[15px] leading-relaxed break-words"
            style={{ color: "inherit" }}
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(message.htmlContent),
            }}
          />
        );
      }

      // Fallback: if content contains HTML tags (e.g. forwarded messages),
      // render as sanitized HTML instead of raw text
      const rawContent = message.content || "";
      if (typeof rawContent === "string" && /<[a-z][\s\S]*>/i.test(rawContent)) {
        return (
          <div
            className="message-content rich-message-content text-[15px] leading-relaxed break-words"
            style={{ color: "inherit" }}
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(rawContent),
            }}
          />
        );
      }

      // Plain Text Fallback
      return (
        <div
          className="message-content text-[15px] leading-relaxed break-words whitespace-pre-wrap"
          style={{ color: "inherit" }}
        >
          {rawContent}
        </div>
      );
    };

    return (
      <div
        id={`msg-${message._id}`}
        ref={messageRef}
        className={`relative group ${highlightMessageId === message._id ? "message-highlight" : ""}`}
        style={{
          background: isSelected
            ? "color-mix(in srgb, var(--accent-primary, #5865f2) 12%, transparent)"
            : messageIdToDelete === message._id
              ? "var(--bg-danger, rgba(239, 68, 68, 0.08))"
              : showActions
                ? "var(--bg-hover)"
                : "transparent",
          border: messageIdToDelete === message._id
            ? "1px solid var(--border-danger, rgba(239, 68, 68, 0.25))"
            : isSelected
              ? "1px solid var(--accent-primary, #5865f2)"
              : "1px solid transparent",
          transition: "background 150ms ease, border-color 150ms ease",
          opacity: isPending ? 0.6 : isFailed ? 0.5 : 1,
          marginTop: compact ? 2 : 12,
        }}
        onMouseEnter={() => {
          if (!isDeleted) setShowActions(true);
        }}
        onMouseLeave={() => {
          if (!showReactionPicker && !showMoreMenu) setShowActions(false);
        }}
      >
        <div
          className={`flex items-start gap-2 px-4 pb-0 ${isOwn ? "flex-row-reverse" : ""}`}
        >
          {/* Selection checkbox (visible in selection mode or on hover when selecting) */}
          {isSelecting && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectMessage?.(message._id, e.shiftKey);
              }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 0, marginTop: compact ? 2 : 6, flexShrink: 0,
                color: isSelected ? "var(--accent-primary, #5865f2)" : "var(--text-muted)",
                transition: "color 150ms ease",
              }}
              aria-label={isSelected ? "Deselect" : "Select"}
            >
              {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>
          )}

          {/* Gutter */}
          <div className="shrink-0" style={{ width: 36 }}>
            {!compact ? (
              <div
                className="cursor-pointer"
                onClick={() => onOpenProfile?.(authorData)}
              >
                <Avatar
                  member={{
                    name: authorName,
                    avatar: authorAvatar,
                    onlineStatus: "offline",
                  }}
                  size={36}
                  showStatus={false}
                />
              </div>
            ) : (
              <span
                className="flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-muted)", height: 36, fontSize: 10 }}
              >
                {format(new Date(message.createdAt), "h:mm")}
              </span>
            )}
          </div>

          {/* Column: name + bubble */}
          <div
            className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
            style={{ maxWidth: "min(65%, 480px)" }}
          >
            {!compact && (
              <div
                className={`flex items-baseline gap-1.5 mb-1 px-1 ${isOwn ? "flex-row-reverse" : ""}`}
              >
                <span
                  className="font-semibold text-[13px] cursor-pointer hover:underline"
                  style={{ color: "var(--text-white)" }}
                  onClick={() => onOpenProfile?.(authorData)}
                >
                  {authorName}
                </span>
                {message.contentType === "bot" && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--accent-primary)",
                      color: "white",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    BOT
                  </span>
                )}
                <span
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {time}
                </span>
                {message.isEdited && (
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    (edited)
                  </span>
                )}
                {message.isPinned && (
                  <Pin size={11} style={{ color: "var(--accent-yellow)" }} />
                )}
                {renderDeliveryStatus()}
              </div>
            )}

            {/* Bubble */}
            <div
              className={`message-bubble ${isOwn ? "sent" : "received"} ${groupPos}`}
              style={{
                opacity: message.isOptimistic ? 0.7 : 1,
                transition: "opacity 200ms ease",
              }}
            >
              {/* ── Forwarded indicator ── */}
              {message.forwardMeta?.isForwarded && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    marginBottom: 6,
                    paddingBottom: 6,
                    borderBottom: "1px solid var(--border-secondary)",
                    fontSize: 12,
                    fontStyle: "italic",
                    color: "var(--text-secondary)",
                    opacity: 0.8,
                  }}
                >
                  <Forward size={12} />
                  <span>
                    Forwarded from{" "}
                    <strong style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                      {message.forwardMeta.originalChannelName
                        ? `#${message.forwardMeta.originalChannelName}`
                        : message.forwardMeta.originalSenderName || "Unknown"}
                    </strong>
                  </span>
                </div>
              )}

              {/* ── Message content (rich HTML or plain text) ── */}
              {renderMessageContent()}

              {!isDeleted && isFailed && (
                <div className="flex items-center gap-2 mt-1">
                  <span style={{ fontSize: 12, color: "var(--accent-red)" }}>
                    Failed to send
                  </span>
                  <button
                    onClick={() => retryMessage(message._id, message.channelId)}
                    className="text-xs cursor-pointer px-2 py-0.5 rounded"
                    style={{
                      color: "var(--text-link)",
                      background: "transparent",
                      border: "1px solid var(--border-secondary)",
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {!isDeleted &&
                !message.content?.trim() &&
                message.isPinned &&
                compact && (
                  <div className="flex items-center mb-1">
                    <Pin size={11} style={{ color: "var(--accent-yellow)" }} />
                  </div>
                )}

              {/* Attachments */}
              {!isDeleted && derivedAttachments.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {derivedAttachments.length > 1 ? (
                    <div
                      className="flex items-center gap-2 text-[13px] font-medium mb-1"
                      style={{ color: "inherit", opacity: 0.85 }}
                    >
                      <span className="cursor-pointer flex items-center gap-1 hover:underline">
                        {derivedAttachments.length} files{" "}
                        <ChevronDown size={14} style={{ opacity: 0.7 }} />
                      </span>
                      <span style={{ opacity: 0.4 }}>|</span>
                      <span
                        className="cursor-pointer flex items-center gap-1 hover:underline"
                        onClick={() =>
                          derivedAttachments.forEach((file) =>
                            handleDownload(file),
                          )
                        }
                      > 
                        <Download size={14} style={{ opacity: 0.7 }} /> Download
                        all
                      </span>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-1 text-[13px] font-medium mb-1"
                      style={{ color: "inherit", opacity: 0.85 }}
                    >
                      <span className="cursor-pointer flex items-center gap-1 hover:underline">
                        {derivedAttachments[0].originalName ||
                          derivedAttachments[0].fileName ||
                          derivedAttachments[0].name ||
                          "File"}{" "}
                        <ChevronDown size={14} style={{ opacity: 0.7 }} />
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {derivedAttachments.map((att, idx) => (
                      <SlackFileCard
                        key={att._id || att.referenceId || idx}
                        file={att}
                        onOpen={(f) =>
                          onOpenFilePreview?.(f, derivedAttachments)
                        }
                        onDownload={handleDownload}
                        onForward={handleForwardAttachment}
                        isSingle={derivedAttachments.length === 1}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Reactions */}
              {message.reactions?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {message.reactions.map((reaction) => {
                    const hasReacted =
                      reaction.users?.includes(user?._id) ||
                      reaction.userIds?.some(
                        (id) => id?.toString() === user?._id,
                      );
                    const count = reaction.users?.length || reaction.count || 0;
                    return (
                      <ReactionRenderer
                        key={reaction.emoji}
                        emoji={reaction.emoji}
                        count={count}
                        hasReacted={hasReacted}
                        onClick={handleReaction}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Thread preview — outside bubble */}
            {message.replyCount > 0 && (
              <ThreadPreview
                message={message}
                onOpenThread={onOpenThread}
                isOwn={isOwn}
              />
            )}
          </div>

          {/* Action bar */}
          {(showActions || showReactionPicker || showMoreMenu) &&
            !isDeleted &&
            !isEditing &&
            !isPending &&
            !isFailed && (
              <div
                className="absolute -top-3.5 right-5 flex items-center gap-1.5 px-2 py-1 rounded-lg z-10 animate-fade-in-scale"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-primary)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <span ref={emojiButtonRef}>
                  <ActionButton
                    icon={Smile}
                    title="Add reaction"
                    onClick={() => setShowReactionPicker(!showReactionPicker)}
                  />
                </span>
                <ActionButton
                  icon={MessageSquare}
                  title="Reply in thread"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenThread?.({
                      rootMessageId: message._id,
                      channelId: message.channelId,
                    });
                  }}
                />
                <ActionButton
                  icon={isSaved ? BookmarkCheck : Bookmark}
                  title={isSaved ? "Unsave message" : "Save message"}
                  color={isSaved ? "var(--accent-primary)" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onSaveMessage?.(message._id);
                    setShowActions(false);
                  }}
                />
                {isOwn && (
                  <>
                    {canEdit && (
                      <ActionButton
                        icon={Edit}
                        title="Edit"
                        onClick={() => setEditingMessageId(message._id)}
                      />
                    )}
                    <ActionButton
                      icon={Trash2}
                      title="Delete"
                      danger
                      onClick={async () => {
                        setMessageIdToDelete(message._id);
                        const ok = await confirm({
                          title: "Delete message",
                          message:
                            "This message will be permanently removed for everyone.",
                        });
                        clearMessageIdToDelete();
                        if (ok) deleteMessage(message._id, message.channelId);
                      }}
                    />
                  </>
                )}
                <ActionButton
                  icon={MoreVertical}
                  title="More actions"
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                />
              </div>
            )}

          {/* More menu */}
          {showMoreMenu && (
            <div
              ref={moreMenuRef}
              className="absolute z-20 w-48 rounded-md shadow-lg py-1"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                top: "-40px",
                right: "40px",
              }}
            >
              <MoreMenuItem
                icon={Pin}
                label={message.isPinned ? "Unpin message" : "Pin message"}
                onClick={() => {
                  message.isPinned
                    ? unpinMessage(message._id)
                    : pinMessage(message._id);
                  setShowMoreMenu(false);
                  setShowActions(false);
                }}
              />
              {message.content?.trim() && (
                <MoreMenuItem
                  icon={Copy}
                  label="Copy text"
                  onClick={async () => {
                    try {
                      const raw = message.htmlContent || message.content || "";
                      const plainText = extractPlainText(raw);

                      if (navigator?.clipboard?.writeText) {
                        await navigator.clipboard.writeText(plainText);
                      } else {
                        const ta = document.createElement("textarea");
                        ta.value = plainText;
                        ta.style.cssText = "position:fixed;opacity:0";
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand("copy");
                        document.body.removeChild(ta);
                      }

                      toast.success("Copied to clipboard", { duration: 1500 });
                    } catch {
                      toast.error("Copy failed");
                    }

                    setShowMoreMenu(false);
                    setShowActions(false);
                  }}
                />
              )}
              {/* <MoreMenuItem
                icon={Link2}
                laabel="Copy link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/chat/${message.channelId}/${message._id}`,
                    );
                    toast.success("Link copied", { duration: 1500 });
                  } catch {
                    toast.error("Failed to copy link");
                  }
                  setShowMoreMenu(false);
                  setShowActions(false);
                }}
              /> */}
              <MoreMenuItem
                icon={Forward}
                label="Forward message"
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowActions(false);
                  onForwardMessage?.(message);
                }}
              />
              <MoreMenuItem
                icon={Info}
                label="Message Details"
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowActions(false);
                  setShowMessageDetails(true);
                }}
              />
            </div>
          )}

          {/* Message Details Panel (Portal-based) */}
          {showMessageDetails && (
            <MessageDetailsPanel
              message={message}
              onClose={() => setShowMessageDetails(false)}
              onForward={onForwardMessage}
            />
          )}

          {/* Reaction picker (Portal-based to prevent clipping) */}
          <EmojiPickerPortal
            anchorRef={emojiButtonRef}
            isOpen={showReactionPicker}
            onClose={() => {
              setShowReactionPicker(false);
              setShowActions(false);
            }}
            onSelect={(emoji) => {
              handleReaction(emoji);
              setShowActions(false);
            }}
            position="top-start"
            zIndex={1050}
          />
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.message._id === next.message._id &&
      prev.message.content === next.message.content &&
      prev.message.htmlContent === next.message.htmlContent &&
      prev.message.reactions === next.message.reactions &&
      prev.message.isEdited === next.message.isEdited &&
      prev.message.isOptimistic === next.message.isOptimistic &&
      prev.message.isPinned === next.message.isPinned &&
      prev.message.isDeleted === next.message.isDeleted &&
      prev.message.status === next.message.status &&
      prev.message.replyCount === next.message.replyCount &&
      prev.message.lastReplyAt === next.message.lastReplyAt &&
      prev.message.threadParticipants === next.message.threadParticipants &&
      prev.message.pending === next.message.pending &&
      prev.message.failed === next.message.failed &&
      prev.compact === next.compact &&
      prev.isLastInGroup === next.isLastInGroup &&
      prev.isDMChannel === next.isDMChannel &&
      prev.isPinnedHighlight === next.isPinnedHighlight &&
      prev.message.forwardMeta === next.message.forwardMeta &&
      prev.isSelecting === next.isSelecting &&
      prev.isSelected === next.isSelected &&
      prev.messageIdToDelete === next.messageIdToDelete
    );
  },
);

export default MessageItem;

// ─── ActionButton ─────────────────────────────────────────────────────────────

function ActionButton({
  icon: Icon,
  title,
  onClick,
  danger,
  color,
  size = 16,
}) {
  const [ripple, setRipple] = useState(null);
  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      id: Date.now(),
    });
    setTimeout(() => setRipple(null), 500);
    onClick?.(e);
  };
  return (
    <button
      className={`ab-btn ${danger ? "danger" : "normal"}`}
      onClick={handleClick}
      title={title}
      aria-label={title}
      style={{
        color:
          color ||
          (danger ? "var(--accent-red, #e5534b)" : "var(--text-secondary)"),
      }}
    >
      {ripple && (
        <span
          key={ripple.id}
          className="ab-ripple-circle"
          style={{
            left: ripple.x - 12,
            top: ripple.y - 12,
            background: danger
              ? "color-mix(in srgb, var(--accent-red, #e5534b) 40%, transparent)"
              : "color-mix(in srgb, var(--text-secondary) 30%, transparent)",
          }}
        />
      )}
      <span className="ab-icon-wrap">
        <Icon size={size} strokeWidth={1.75} />
      </span>
    </button>
  );
}

// ─── MoreMenuItem ─────────────────────────────────────────────────────────────

function MoreMenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <>
      <style>{`
        @keyframes mmi-slide-in { 0%{opacity:0;transform:translateX(-6px)} 100%{opacity:1;transform:translateX(0)} }
        @keyframes mmi-icon-nudge { 0%{transform:translateX(0)} 40%{transform:translateX(3px)} 100%{transform:translateX(0)} }
        .mmi-btn{display:flex;align-items:center;gap:9px;padding:6px 12px;font-size:13px;font-family:inherit;cursor:pointer;background:transparent;border:none;text-align:left;border-radius:6px;margin:1px 4px;width:calc(100% - 8px);transition:background 110ms ease,color 110ms ease,transform 100ms ease;animation:mmi-slide-in 160ms ease both;position:relative;overflow:hidden}
        .mmi-btn:hover{transform:translateX(2px)}
        .mmi-btn:hover .mmi-icon{animation:mmi-icon-nudge 220ms ease forwards}
        .mmi-btn:active{transform:scale(0.98) translateX(1px)}
        .mmi-btn.danger:hover{background:color-mix(in srgb,var(--accent-red,#e5534b) 10%,transparent);color:var(--accent-red,#e5534b)!important}
        .mmi-btn.normal:hover{background:var(--bg-hover)}
        .mmi-label{letter-spacing:-0.01em;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mmi-icon{flex-shrink:0;transition:opacity 110ms ease}
      `}</style>
      <button
        className={`mmi-btn ${danger ? "danger" : "normal"}`}
        onClick={onClick}
        style={{
          color: danger ? "var(--accent-red, #e5534b)" : "var(--text-primary)",
        }}
      >
        <span className="mmi-icon" style={{ opacity: danger ? 0.85 : 0.65 }}>
          <Icon size={14} strokeWidth={1.75} />
        </span>
        <span className="mmi-label">{label}</span>
      </button>
    </>
  );
}

// ─── ThreadPreview ─────────────────────────────────────────────────────────────

function ThreadPreview({ message, onOpenThread, isOwn = false }) {
  const { user } = useAuthStore();
  const allParticipants = Array.isArray(message.threadParticipants)
    ? message.threadParticipants
    : [];
  const participants = allParticipants.filter(
    (p) => p._id && p._id.toString() !== user?._id?.toString(),
  );
  const count = message.replyCount || 0;
  const formatLastReply = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return `today at ${format(d, "h:mm a")}`;
    const isYesterday =
      new Date(now - 86400000).toDateString() === d.toDateString();
    if (isYesterday) return `yesterday at ${format(d, "h:mm a")}`;
    return `${format(d, "MMM d")} at ${format(d, "h:mm a")}`;
  };
  const lastReplyText = formatLastReply(message.lastReplyAt);
  return (
    <button
      className={`thread-preview${isOwn ? " thread-preview--own" : ""}`}
      onClick={() =>
        onOpenThread?.({
          rootMessageId: message._id,
          channelId: message.channelId,
        })
      }
    >
      {participants.length > 0 ? (
        <div className="thread-preview__avatars">
          {participants.slice(0, 4).map((p, i) =>
            p.avatar ? (
              <img
                key={p._id || i}
                src={p.avatar}
                alt={p.name || ""}
                className="thread-preview__avatar-img"
              />
            ) : (
              <div key={p._id || i} className="thread-preview__avatar-fallback">
                {(p.name || "?").charAt(0).toUpperCase()}
              </div>
            ),
          )}
        </div>
      ) : (
        <MessageSquare size={14} className="thread-preview__icon" />
      )}
      <span className="thread-preview__count">
        {count} {count === 1 ? "reply" : "replies"}
      </span>
      <span className="thread-preview__meta">
        {lastReplyText && (
          <span className="thread-preview__time">{lastReplyText}</span>
        )}
        <span className="thread-preview__cta">View thread</span>
      </span>
    </button>
  );
}
