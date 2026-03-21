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
  Forward,
  Link2,
  MoreVertical,
} from "lucide-react";
import { Avatar } from "./MemberAvatarGroup";
import EmojiPicker from "./EmojiPicker";
import { sanitizeHtml } from "../../utils/sanitize";
import toast from "react-hot-toast";

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
  let i = 0;
  let size = bytes;
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

const MESSAGE_EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

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
    const [showActions, setShowActions] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(message.content);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const messageRef = useRef(null);

    // Close action bar + reaction picker + more menu when clicking outside the message
    useEffect(() => {
      if (!showReactionPicker && !showMoreMenu) return;
      const handleClickOutside = (e) => {
        if (messageRef.current && !messageRef.current.contains(e.target)) {
          setShowReactionPicker(false);
          setShowMoreMenu(false);
          setShowActions(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, [showReactionPicker, showMoreMenu]);

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
    // Prefer senderSnapshot for display (denormalized), fall back to populated authorId
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
    const deletedText = isOwn ? "You deleted this message" : "This message was deleted";
    const deletedTextColor = isOwn ? "var(--text-muted)" : "rgba(226, 232, 240, 0.92)";

    const handleEdit = () => {
      if (editContent.trim() && editContent !== message.content) {
        editMessage(message._id, editContent);
      }
      setIsEditing(false);
    };

    const handleReaction = (emoji) => {
      const existing = message.reactions?.find(
        (r) =>
          r.emoji === emoji &&
          (r.users?.includes(user?._id) ||
            r.userIds?.some((id) => id?.toString() === user?._id)),
      );
      if (existing) {
        removeReaction(message._id, emoji);
      } else {
        addReaction(message._id, emoji);
      }
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

    // System messages (plain separator style)
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

    // Delivery status indicator for DM messages
    const renderDeliveryStatus = () => {
      if (!isDMChannel || !isOwn || isPending || isFailed) return null;
      const status = message.status || "sent";
      if (status === "seen") {
        return (
          <span title="Seen" className="inline-flex items-center ml-1">
            <CheckCheck size={13} style={{ color: "var(--accent-primary)" }} />
          </span>
        );
      }
      if (status === "delivered") {
        return (
          <span title="Delivered" className="inline-flex items-center ml-1">
            <CheckCheck size={13} style={{ color: "var(--text-muted)" }} />
          </span>
        );
      }
      // sent
      return (
        <span title="Sent" className="inline-flex items-center ml-1">
          <Check size={13} style={{ color: "var(--text-muted)" }} />
        </span>
      );
    };

    // Position within group: solo | first | middle | last
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
        id={`message-${message._id}`}
        ref={messageRef}
        className={`relative group ${highlightMessageId === message._id ? 'message-highlight' : ''}`}
        style={{
          background: showActions ? "var(--bg-hover)" : "transparent",
          transition: "background 150ms ease",
          opacity: isPending ? 0.6 : isFailed ? 0.5 : 1,
          // Group spacing: large gap before first-in-group, tiny gap within
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
          className={`flex items-end gap-2 px-4 pb-0 ${isOwn ? "flex-row-reverse" : ""}`}
        >
          {/* Avatar — only on first/solo message of a group */}
          <div
            className="shrink-0 self-end"
            style={{ width: 34, marginBottom: 2 }}
          >
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
                  size={34}
                  showStatus={false}
                />
              </div>
            ) : (
              // Invisible gutter keeps alignment; show timestamp on hover
              <span
                className="flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-muted)", height: 34, fontSize: 10 }}
              >
                {format(new Date(message.createdAt), "h:mm")}
              </span>
            )}
          </div>

          {/* Column: name header + bubble */}
          <div
            className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
            style={{ maxWidth: "min(65%, 480px)" }}
          >
            {/* Name + time row — only on first/solo message */}
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

              {/* Failed message indicator */}
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

              {/* Pending indicator */}
              {!isDeleted && isPending && !isFailed && (
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

              {/* Attachments */}
              {!isDeleted && derivedAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {derivedAttachments.map((att, idx) =>
                    isImage(att.mimeType) ? (
                      <div
                        key={att._id || idx}
                        className="rounded-lg overflow-hidden cursor-pointer transition-opacity hover:opacity-90"
                        style={{
                          border: "1px solid var(--border-primary)",
                          maxWidth: 320,
                        }}
                        onClick={() =>
                          onOpenFilePreview?.(att, derivedAttachments)
                        }
                      >
                        <img
                          src={att.thumbnailUrl || att.url}
                          alt={att.originalName}
                          className="max-h-60 object-cover"
                          loading="lazy"
                        />
                        <div
                          className="flex items-center gap-2 px-2 py-1 text-xs"
                          style={{
                            background: "var(--bg-secondary)",
                            color: "var(--text-muted)",
                          }}
                        >
                          <span className="truncate flex-1">
                            {att.originalName}
                          </span>
                          <span>{formatFileSize(att.fileSize)}</span>
                        </div>
                      </div>
                    ) : isVideo(att.mimeType) ? (
                      <div
                        key={att._id || idx}
                        className="file-card"
                        onClick={() =>
                          onOpenFilePreview?.(att, derivedAttachments)
                        }
                      >
                        <Film
                          size={24}
                          style={{
                            color: "var(--accent-purple)",
                            flexShrink: 0,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {att.originalName}
                          </p>
                          <p
                            className="text-[11px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {formatFileSize(att.fileSize)}
                          </p>
                        </div>
                        <Download
                          size={14}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                    ) : isAudio(att.mimeType) ? (
                      <div
                        key={att._id || idx}
                        className="file-card"
                        onClick={() =>
                          onOpenFilePreview?.(att, derivedAttachments)
                        }
                      >
                        <Music
                          size={24}
                          style={{
                            color: "var(--accent-green)",
                            flexShrink: 0,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {att.originalName}
                          </p>
                          <p
                            className="text-[11px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {formatFileSize(att.fileSize)}
                          </p>
                        </div>
                        <Download
                          size={14}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                    ) : (
                      <div
                        key={att._id || idx}
                        className="file-card"
                        onClick={() =>
                          onOpenFilePreview?.(att, derivedAttachments)
                        }
                      >
                        {(() => {
                          const FIcon = fileIcon(att.mimeType);
                          return (
                            <FIcon
                              size={24}
                              style={{
                                color: "var(--accent-primary)",
                                flexShrink: 0,
                              }}
                            />
                          );
                        })()}
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {att.originalName}
                          </p>
                          <p
                            className="text-[11px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {formatFileSize(att.fileSize)}
                          </p>
                        </div>
                        <Download
                          size={14}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                    ),
                  )}
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
                    const tooltipParts = [];
                    if (hasReacted) tooltipParts.push("You");
                    if (count > 1 && hasReacted)
                      tooltipParts.push(
                        `and ${count - 1} other${count - 1 > 1 ? "s" : ""}`,
                      );
                    else if (count > 0 && !hasReacted)
                      tooltipParts.push(
                        `${count} ${count === 1 ? "person" : "people"}`,
                      );
                    const tooltip = `${reaction.emoji} ${tooltipParts.join(" ")} reacted`;
                    return (
                      <button
                        key={reaction.emoji}
                        onClick={() => handleReaction(reaction.emoji)}
                        title={tooltip}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-all"
                        style={{
                          background: hasReacted
                            ? "rgba(18, 100, 163, 0.3)"
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
              {/* Thread preview — Slack-style, outside the bubble */}
              {message.replyCount > 0 && (
                <ThreadPreview message={message} onOpenThread={onOpenThread} />
              )}
            </div>
            {/* end column */}
          </div>
          {/* end flex row */}

          {/* Action Bar (hover) */}
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
                  onClick={() =>
                    onOpenThread?.({
                      rootMessageId: message._id,
                      channelId: message.channelId,
                    })
                  }
                />
                <ActionButton
                  icon={Bookmark}
                  title="Save message"
                  onClick={() => {
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
                      onClick={() =>
                        deleteMessage(message._id, message.channelId)
                      }
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

          {/* More Actions Menu */}
          {showMoreMenu && (
            <div
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
                  const textToCopy = message.content || "";
                  try {
                    if (navigator?.clipboard?.writeText) {
                      await navigator.clipboard.writeText(textToCopy);
                    } else {
                      const textarea = document.createElement("textarea");
                      textarea.value = textToCopy;
                      textarea.setAttribute("readonly", "");
                      textarea.style.cssText = "position:fixed;opacity:0";
                      document.body.appendChild(textarea);
                      textarea.select();
                      document.execCommand("copy");
                      document.body.removeChild(textarea);
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
                  const link = `${window.location.origin}/chat/${message.channelId}/${message._id}`;
                  try {
                    await navigator.clipboard.writeText(link);
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
                  // Future: Implement forward modal
                  toast.success("Forwarding not yet implemented!");
                  setShowMoreMenu(false);
                  setShowActions(false);
                }}
              />
            </div>
          )}

          {/* Reaction Picker (extended with EmojiPicker) */}
          {showReactionPicker && (
            <div
              className="absolute -top-3 right-5 z-20"
              style={{ position: "absolute" }}
            >
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
      prev.message.pending === next.message.pending &&
      prev.message.failed === next.message.failed &&
      prev.compact === next.compact &&
      prev.isLastInGroup === next.isLastInGroup &&
      prev.isDMChannel === next.isDMChannel
    );
  },
);

export default MessageItem;

function ActionButton({ icon: Icon, title, onClick, danger, color, size = 16 }) {
  return (
    <button
      className="p-2 rounded-md cursor-pointer transition-colors"
      style={{
        color: color || (danger ? "var(--accent-red)" : "#070534"),
        background: "transparent",
        border: "none",
      }}
      onClick={onClick}
      title={title}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-hover)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon size={size} />
    </button>
  );
}

function MoreMenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] cursor-pointer transition-colors text-left"
      style={{
        color: danger ? "var(--accent-red)" : "var(--text-primary)",
        background: "transparent",
        border: "none",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-hover)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon size={15} style={{ opacity: 0.7 }} />
      <span>{label}</span>
    </button>
  );
}

/* ─── Thread Preview (under the bubble) ─────────────────────────────────── */
function ThreadPreview({ message, onOpenThread }) {
  const participants = Array.isArray(message.threadParticipants)
    ? message.threadParticipants
    : [];
  const count = message.replyCount || 0;

  const formatLastReply = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return `Last reply today at ${format(d, "h:mm a")}`;
    const isYesterday =
      new Date(now - 86400000).toDateString() === d.toDateString();
    if (isYesterday) return `Last reply yesterday at ${format(d, "h:mm a")}`;
    return `Last reply ${format(d, "MMM d")} at ${format(d, "h:mm a")}`;
  };

  const lastReplyText = formatLastReply(message.lastReplyAt);

  return (
    <button
      className="thread-preview"
      onClick={() =>
        onOpenThread?.({
          rootMessageId: message._id,
          channelId: message.channelId,
        })
      }
    >
      {/* Participant avatar stack */}
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
        <MessageSquare
          size={14}
          style={{ color: "var(--accent-primary)", flexShrink: 0 }}
        />
      )}

      {/* Reply count */}
      <span className="thread-preview__count">
        {count} {count === 1 ? "reply" : "replies"}
      </span>

      {/* Last reply time */}
      {lastReplyText && (
        <span className="thread-preview__time">{lastReplyText}</span>
      )}

      {/* CTA — visible on hover */}
      <span className="thread-preview__cta">View thread</span>
    </button>
  );
}
