
import { useState, useEffect, useRef, memo } from "react";
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
  Copy,
  Bookmark,
  BookmarkCheck,
  Forward,
  Link2,
  MoreVertical,
  ChevronDown,
} from "lucide-react";
import { useLaterStore } from "../../stores/laterStore";
import SlackFileCard from "./SlackFileCard";
import { Avatar } from "./MemberAvatarGroup";
import EmojiPicker from "./EmojiPicker";
import { sanitizeHtml } from "../../utils/sanitize";
import toast from "react-hot-toast";
import { handleDownload } from "../../utils/handleDownload";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";

// ─── Inject highlight keyframes once ─────────────────────────────────────────
const HIGHLIGHT_STYLE_ID = "msg-pinned-highlight-style";
if (
  typeof document !== "undefined" &&
  !document.getElementById(HIGHLIGHT_STYLE_ID)
) {
  const s = document.createElement("style");
  s.id = HIGHLIGHT_STYLE_ID;
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
    // isPinnedHighlight: true when this message was jumped to from PinnedBar/Panel.
    // MessageItem self-applies the CSS animation as soon as it is rendered into
    // the DOM (via useEffect), which is the correct moment because Virtuoso only
    // mounts the row *after* the scroll completes.
    isPinnedHighlight,
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
    } = useChatStore();
    const { confirm } = useDeleteConfirm();

    const isSaved = useLaterStore((s) => s.savedMessageIds.has(message._id));

    const [showActions, setShowActions] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(message.content);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);

    const messageRef = useRef(null);
    const moreMenuRef = useRef(null);

    // ── Apply pinned-highlight animation when this row is first rendered ────
    // This fires right after the component mounts into the Virtuoso viewport,
    // which is guaranteed to be *after* Virtuoso has finished scrolling the
    // row into view. Using a DOM class + CSS animation means no jank.
    useEffect(() => {
      if (!isPinnedHighlight) return;
      const el = messageRef.current;
      if (!el) return;

      // Remove first in case animation was already playing (shouldn't happen, but safe)
      el.classList.remove("msg-pinned-active");
      // Force reflow so re-adding the class re-triggers the keyframes
      void el.offsetWidth;
      el.classList.add("msg-pinned-active");

      const t = setTimeout(
        () => el.classList.remove("msg-pinned-active"),
        2100,
      );
      return () => clearTimeout(t);
    }, [isPinnedHighlight]);

    // Close reaction picker on outside click / Escape
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

    // Close more-menu on outside click / Escape
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

    const handleEdit = () => {
      if (editContent.trim() && editContent !== message.content)
        editMessage(message._id, editContent);
      setIsEditing(false);
    };

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
                ? { ...ref.fileId, url: ref.fileId.secureUrl || ref.fileId.url }
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

    return (
      <div
        id={`msg-${message._id}`}
        ref={messageRef}
        className={`relative group ${highlightMessageId === message._id ? "message-highlight" : ""}`}
        style={{
          background: showActions ? "var(--bg-hover)" : "transparent",
          transition: "background 150ms ease",
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
            >
              {isDeleted ? (
                <div
                  className="message-content text-[16px] leading-relaxed italic"
                  style={{ color: deletedTextColor }}
                >
                  {deletedText}
                </div>
              ) : isEditing ? (
                <div className="mt-1">
                  <input
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEdit();
                      if (e.key === "Escape") setIsEditing(false);
                    }}
                    className="input-field"
                    style={{ fontSize: 14, padding: "6px 10px" }}
                    autoFocus
                  />
                  <p
                    className="text-[11px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Enter to save · Escape to cancel
                  </p>
                </div>
              ) : message.htmlContent &&
                message.htmlContent !== message.content ? (
                <div
                  className="message-content text-[16px] leading-relaxed"
                  style={{ color: "inherit" }}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(message.htmlContent),
                  }}
                />
              ) : (
                <div
                  className="message-content text-[16px] leading-relaxed"
                  style={{ color: "inherit" }}
                >
                  {message.content}
                </div>
              )}

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
              {/* {!isDeleted && isPending && !isFailed && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 2,
                    display: "inline-block",
                  }}
                >
                  Sending...
                </span>
              )}
              {/* Pinned icon for attachment-only messages */}
              {!isDeleted && !message.content?.trim() && message.isPinned && compact && (
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
                        onClick={() => derivedAttachments.forEach((file) => handleDownload(file))}
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
                      <button
                        key={reaction.emoji}
                        onClick={() => handleReaction(reaction.emoji)}
                        title={`${reaction.emoji} ${count}`}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-all"
                        style={{
                          background: hasReacted
                            ? "color-mix(in srgb, var(--accent-color) 22%, transparent)"
                            : "var(--bg-hover)",
                          border: `1px solid ${hasReacted ? "var(--accent-primary)" : "var(--border-secondary)"}`,
                          color: "var(--text-primary)",
                        }}
                      >
                        {reaction.emoji} {count}
                      </button>
                    );
                  })}
                </div>
              )}

            </div>

            {/* Thread preview — outside bubble so it renders on page bg, always readable */}
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
                <ActionButton
                  icon={Smile}
                  title="Add reaction"
                  onClick={() => setShowReactionPicker(!showReactionPicker)}
                />
                <ActionButton
                  icon={MessageSquare}
                  title="Reply in thread"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenThread?.({
                      rootMessageId: message._id,
                      channelId: message.channelId,
                    })}
                  }
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
                        onClick={() => {
                          setEditContent(message.content);
                          setIsEditing(true);
                        }}
                      />
                    )}
                    <ActionButton
                      icon={Trash2}
                      title="Delete"
                      danger
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Delete message',
                          message: 'This message will be permanently removed for everyone.',
                        })
                        if (ok) deleteMessage(message._id, message.channelId)
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
              <MoreMenuItem
                icon={Copy}
                label="Copy text"
                onClick={async () => {
                  try {
                    if (navigator?.clipboard?.writeText)
                      await navigator.clipboard.writeText(
                        message.content || "",
                      );
                    else {
                      const ta = document.createElement("textarea");
                      ta.value = message.content || "";
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
              <MoreMenuItem
                icon={Link2}
                label="Copy link"
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
              />
              <MoreMenuItem
                icon={Forward}
                label="Forward message"
                onClick={() => {
                  toast.success("Forwarding not yet implemented!");
                  setShowMoreMenu(false);
                  setShowActions(false);
                }}
              />
            </div>
          )}

          {/* Reaction picker */}
          {showReactionPicker && (
            <div className="absolute -top-3 right-5 z-20">
              <EmojiPicker
                onSelect={(emoji) => {
                  handleReaction(emoji);
                  setShowActions(false);
                }}
                onClose={() => {
                  setShowReactionPicker(false);
                  setShowActions(false);
                }}
                position="top"
              />
            </div>
          )}
        </div>
      </div>
    );
  },
  // Memo comparison — include isPinnedHighlight so the component re-renders when it changes
  (prev, next) => {
    return (
      prev.message._id === next.message._id &&
      prev.message.content === next.message.content &&
      prev.message.reactions === next.message.reactions &&
      prev.message.isEdited === next.message.isEdited &&
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
      prev.isPinnedHighlight === next.isPinnedHighlight // ← new
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
  // Show only other users' avatars — exclude the current logged-in user
  const participants = allParticipants.filter(
    (p) => p._id && p._id.toString() !== user?._id?.toString()
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
      {/* time + cta overlap in the same grid cell so there is no layout jump on hover */}
      <span className="thread-preview__meta">
        {lastReplyText && (
          <span className="thread-preview__time">{lastReplyText}</span>
        )}
        <span className="thread-preview__cta">View thread</span>
      </span>
    </button>
  );
}
