import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useChatStore } from "../../stores/chatStore";
import { useChannelStore } from "../../stores/channelStore";
import { useAuthStore } from "../../stores/authStore";
import { useLaterStore } from "../../stores/laterStore";
import MessageInput from "./MessageInput";
import RichTextEditor from "./RichTextEditor";
import FormattingToolbar from "./FormattingToolbar";
import {
  X,
  MessageSquare,
  Download,
  Smile,
  Edit,
  Trash2,
  Copy,
  Bookmark,
  BookmarkCheck,
  Forward,
  Link2,
  MoreVertical,
  Save,
} from "lucide-react";
import { Avatar } from "./MemberAvatarGroup";
import { format } from "date-fns";
import { sanitizeHtml } from "../../utils/sanitize";
import { extractPlainText } from "../../utils/extractPlainText";
import { CHAT_FEATURE_FLAGS } from "../../config/featureFlags";
import SlackFileCard from "./SlackFileCard";
import { handleDownload } from "../../utils/handleDownload";
import { openPreview } from "../../services/previewService";
import EmojiPicker from "./EmojiPicker";
import EmojiPickerPortal from "./EmojiPickerPortal";
import ForwardMessageModal from "./ForwardMessageModal";
import toast from "react-hot-toast";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { getChannelPath, getDMPath } from "../../utils/chatRoutes";
import { ReactionRenderer } from "../shared/EmojiRenderer";

const EMPTY_LIST = [];
const EMPTY_MAP = {};
const MESSAGE_EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// ─── Inject inline-editor styles (once) ──────────────────────────────────────

const TP_STYLE_ID = "thread-panel-inline-editor-styles";
if (typeof document !== "undefined" && !document.getElementById(TP_STYLE_ID)) {
  const s = document.createElement("style");
  s.id = TP_STYLE_ID;
  s.textContent = `
    /* ── Inline Editor ── */
    .tp-inline-editor-wrap {
      width: 100%;
      border-radius: 10px;
      overflow: hidden;
      border: 1.5px solid var(--accent-primary, #1264a3);
      background: var(--bg-primary, #1a1d21);
      box-shadow: 0 2px 12px rgba(0,0,0,0.18);
      animation: tpInlineEditorIn 140ms cubic-bezier(0.2, 0, 0.13, 1.3) both;
    }
    @keyframes tpInlineEditorIn {
      from { opacity: 0; transform: scaleY(0.94); transform-origin: top; }
      to   { opacity: 1; transform: scaleY(1); }
    }

    .tp-inline-editor-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 5px 8px;
      border-bottom: 1px solid var(--border-primary, rgba(255,255,255,0.1));
      background: var(--bg-secondary, #222529);
      flex-wrap: wrap;
    }

    .tp-inline-editor-content {
      min-height: 60px;
      max-height: 200px;
      overflow-y: auto;
    }

    .tp-inline-editor-content .ProseMirror {
      padding: 10px 14px;
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-primary, #d1d2d3);
      outline: none;
      min-height: 60px;
    }
    .tp-inline-editor-content .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      color: var(--text-muted, #666);
      pointer-events: none;
      float: left;
      height: 0;
    }

    .tp-inline-editor-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px 8px;
      border-top: 1px solid var(--border-primary, rgba(255,255,255,0.08));
      background: var(--bg-secondary, #222529);
      gap: 8px;
    }
    .tp-inline-editor-hint {
      font-size: 11px;
      color: var(--text-muted, #666);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: 0.01em;
      flex-shrink: 1;
      min-width: 0;
    }
    .tp-inline-editor-hint kbd {
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
    .tp-inline-editor-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .tp-inline-editor-cancel-btn {
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
    .tp-inline-editor-cancel-btn:hover {
      background: var(--bg-hover, rgba(255,255,255,0.07));
      color: var(--text-primary, #d1d2d3);
      border-color: var(--border-primary, rgba(255,255,255,0.2));
    }
    .tp-inline-editor-save-btn {
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
    .tp-inline-editor-save-btn:hover {
      background: color-mix(in srgb, var(--accent-primary, #1264a3) 85%, white 15%);
    }
    .tp-inline-editor-save-btn:active {
      transform: scale(0.96);
    }
    .tp-inline-editor-save-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(s);
}

/* ─── InlineEditor ────────────────────────────────────────────────────────── */

/**
 * Inline rich-text editor for thread message editing.
 * Uses RichTextEditor (TipTap) + shared FormattingToolbar.
 * Calls onSave(html, text) so the store can persist both htmlContent and content.
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
    if (!text?.trim()) return;
    onSave(html, text);
  }, [onSave]);

  const handleEditorInput = useCallback(() => {
    syncFormatState();
  }, [syncFormatState]);

  return (
    <div className="tp-inline-editor-wrap">
      {/* Toolbar — compact variant */}
      <div className="tp-inline-editor-toolbar">
        <FormattingToolbar
          editorRef={editorRef}
          formatState={formatState}
          onFormatChange={syncFormatState}
          variant="compact"
        />
      </div>

      {/* TipTap editor */}
      <div className="tp-inline-editor-content">
        <RichTextEditor
          ref={editorRef}
          placeholder="Edit message…"
          onInput={handleEditorInput}
          onSubmit={handleSave}
        />
      </div>

      {/* Footer */}
      <div className="tp-inline-editor-footer">
        <span className="tp-inline-editor-hint">
          <kbd>Shift+Enter</kbd> new line · <kbd>Escape</kbd> cancel
        </span>
        <div className="tp-inline-editor-actions">
          <button className="tp-inline-editor-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="tp-inline-editor-save-btn" onClick={handleSave}>
            <Save size={12} />
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── ActionButton ────────────────────────────────────────────────────────── */
function ActionButton({
  icon: Icon,
  title,
  onClick,
  danger,
  color,
  size = 15,
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

/* ─── MoreMenuItem ────────────────────────────────────────────────────────── */
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

/* ─── Thread Message Item ─────────────────────────────────────────────────── */
function ThreadMessage({ message, isRoot = false, onForwardMessage }) {
  const { user } = useAuthStore();
  const {
    addReaction,
    removeReaction,
    editThreadReply,
    deleteThreadReply,
    messageIdToDelete,
    setMessageIdToDelete,
    clearMessageIdToDelete,
    editingMessageId,
    setEditingMessageId,
    clearEditingMessageId,
  } = useChatStore();
  const { toggleSaveMessage } = useLaterStore();
  const isSaved = useLaterStore((s) => s.savedMessageIds.has(message._id));
  const { confirm } = useDeleteConfirm();

  const [showActions, setShowActions] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const containerRef = useRef(null);
  const moreMenuRef = useRef(null);
  const emojiButtonRef = useRef(null);

  const authorName =
    message.senderSnapshot?.name || message.authorId?.name || "FlowTask Bot";
  const authorAvatar =
    message.senderSnapshot?.avatar ||
    (typeof message.authorId === "object" ? message.authorId?.avatar : null);
  const time = format(new Date(message.createdAt), "h:mm a");
  const isDeleted = message.isDeleted === true;
  const isPending = message.pending === true;
  const isFailed = message.failed === true;

  const isOwn =
    message.authorId?._id === user?._id || message.authorId === user?._id;
  const canEdit =
    isOwn &&
    !isDeleted &&
    !isRoot && // Root message edits go through main channel; suppress in thread view
    Date.now() - new Date(message.createdAt).getTime() < MESSAGE_EDIT_WINDOW_MS;

  const isEditing = editingMessageId === message._id;

  // Derive attachments
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

  /**
   * Called by InlineEditor when the user saves.
   * html  — TipTap HTML (bold, lists, code, etc.) — stored as htmlContent
   * text  — plain-text equivalent                 — stored as content
   */
  const handleEdit = useCallback(
    (html, text) => {
      if (text?.trim()) {
        editThreadReply(message._id, { content: text, htmlContent: html });
      }
      clearEditingMessageId();
    },
    [editThreadReply, message._id, clearEditingMessageId],
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

  const handleCopyText = async () => {
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
  };

  const handleCopyLink = async () => {
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
  };

  // Action bar visibility: show if hovered OR a sub-menu is open
  const actionBarVisible =
    (showActions || showReactionPicker || showMoreMenu) &&
    !isDeleted &&
    !isEditing &&
    !isPending &&
    !isFailed;

  const isDeleteTarget = messageIdToDelete === message._id;

  return (
    <div
      ref={containerRef}
      className={`thread-message thread-message--interactive${isRoot ? " thread-message--root" : ""}`}
      style={{
        background: isDeleteTarget
          ? "var(--bg-danger, rgba(239, 68, 68, 0.08))"
          : showActions
            ? "var(--bg-hover)"
            : "transparent",
        border: isDeleteTarget
          ? "1px solid var(--border-danger, rgba(239, 68, 68, 0.25))"
          : "1px solid transparent",
        transition: "background 150ms ease, border-color 150ms ease",
      }}
      onMouseEnter={() => {
        if (!isDeleted && !isRoot) setShowActions(true);
      }}
      onMouseLeave={() => {
        if (!showReactionPicker && !showMoreMenu) setShowActions(false);
      }}
    >
      <div className="thread-message__avatar">
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
      <div className="thread-message__body">
        <div className="thread-message__meta">
          <span className="thread-message__name">{authorName}</span>
          {message.contentType === "bot" && (
            <span className="thread-message__bot-badge">BOT</span>
          )}
          <span className="thread-message__time">{time}</span>
          {message.isEdited && (
            <span className="thread-message__edited">(edited)</span>
          )}
          {isPending && (
            <span className="thread-message__pending">Sending…</span>
          )}
        </div>

        {isDeleted ? (
          <p className="thread-message__deleted">This message was deleted</p>
        ) : isEditing ? (
          /* ── Rich inline editor ── */
          <div style={{ marginTop: 6 }}>
            <InlineEditor
              initialHtml={message.htmlContent || ""}
              initialText={message.content}
              onSave={handleEdit}
              onCancel={clearEditingMessageId}
            />
          </div>
        ) : (() => {
          // Prefer explicit htmlContent; fall back to content if it carries HTML
          // tags (e.g. store persisted HTML in content before htmlContent existed).
          const raw = message.htmlContent || message.content || "";
          const looksLikeHtml = /<[a-z][\s\S]*>/i.test(raw);
          return looksLikeHtml ? (
            <div
              className="rich-message-content thread-message__content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(raw) }}
            />
          ) : (
            <p className="thread-message__content">{raw}</p>
          );
        })()}

        {/* GIF Rendering */}
        {!isDeleted && message.contentType === 'gif' && message.gifMeta && (
          <div style={{ marginTop: 8 }}>
            <img
              src={message.gifUrl || message.gifMeta.gifUrl || message.gifMeta.previewUrl}
              alt={message.gifMeta.title || 'GIF'}
              style={{
                maxWidth: '100%',
                maxHeight: 320,
                borderRadius: 8,
                objectFit: 'contain',
                display: 'block'
              }}
              loading="lazy"
            />
          </div>
        )}

        {/* Attachments */}
        {!isDeleted && derivedAttachments.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {derivedAttachments.length > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  opacity: 0.85,
                }}
              >
                <span>{derivedAttachments.length} files</span>
                <span style={{ opacity: 0.4 }}>|</span>
                <button
                  type="button"
                  onClick={() =>
                    derivedAttachments.forEach((file) => handleDownload(file))
                  }
                  disabled={derivedAttachments.length === 0}
                  aria-label="Download all attachments"
                  style={{
                    cursor:
                      derivedAttachments.length === 0
                        ? "not-allowed"
                        : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    color: "inherit",
                  }}
                >
                  <Download size={12} style={{ opacity: 0.7 }} /> Download all
                </button>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {derivedAttachments.map((att, idx) => (
                <SlackFileCard
                  key={att._id || att.referenceId || idx}
                  file={att}
                  onOpen={(f) => openPreview(f, derivedAttachments)}
                  onDownload={handleDownload}
                  isSingle={derivedAttachments.length === 1}
                />
              ))}
            </div>
          </div>
        )}

        {/* Reactions */}
        {message.reactions?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.reactions.map((reaction) => {
              const hasReacted =
                reaction.users?.includes(user?._id) ||
                reaction.userIds?.some((id) => id?.toString() === user?._id);
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

      {/* ── Action bar (appears on hover, top-right of message) ─────────────── */}
      {actionBarVisible && (
        <div
          className="thread-msg-actions animate-fade-in-scale"
          style={{
            position: "absolute",
            top: -14,
            right: 12,
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            borderRadius: 8,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-md, 0 4px 16px rgba(0,0,0,0.22))",
            zIndex: 20,
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
            icon={isSaved ? BookmarkCheck : Bookmark}
            title={isSaved ? "Unsave message" : "Save for later"}
            color={isSaved ? "var(--accent-primary)" : undefined}
            onClick={(e) => {
              e.preventDefault();
              toggleSaveMessage(message._id);
              setShowActions(false);
            }}
          />
          {isOwn && (
            <>
              {canEdit && (
                <ActionButton
                  icon={Edit}
                  title="Edit message"
                  onClick={() => {
                    setEditingMessageId(message._id);
                    setShowActions(false);
                  }}
                />
              )}
              <ActionButton
                icon={Trash2}
                title="Delete message"
                danger
                onClick={async () => {
                  setMessageIdToDelete(message._id);
                  const ok = await confirm({
                    title: "Delete reply",
                    message: "This reply will be permanently removed.",
                  });
                  clearMessageIdToDelete();
                  if (ok) deleteThreadReply(message._id);
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

      {/* ── More menu dropdown ───────────────────────────────────────────────── */}
      {showMoreMenu && (
        <div
          ref={moreMenuRef}
          style={{
            position: "absolute",
            top: -40,
            right: 48,
            zIndex: 30,
            width: 192,
            borderRadius: 8,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-md, 0 4px 16px rgba(0,0,0,0.28))",
            padding: "4px 0",
          }}
        >
          <MoreMenuItem
            icon={Copy}
            label="Copy text"
            onClick={handleCopyText}
          />
          <MoreMenuItem
            icon={Link2}
            label="Copy link"
            onClick={handleCopyLink}
          />
          <MoreMenuItem
            icon={Forward}
            label="Forward message"
            onClick={() => {
              setShowMoreMenu(false);
              setShowActions(false);
              onForwardMessage?.(message);
            }}
          />
        </div>
      )}

      {/* ── Emoji Reaction Picker (Portal-based to prevent clipping) ───────── */}
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
  );
}

/* ─── Loading Skeleton ────────────────────────────────────────────────────── */
function ThreadSkeleton() {
  return (
    <div style={{ padding: "12px 16px" }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0" }}>
          <div
            className="skeleton"
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-lg)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 7 }}>
              <div className="skeleton" style={{ width: 100, height: 13 }} />
              <div className="skeleton" style={{ width: 50, height: 13 }} />
            </div>
            <div
              className="skeleton"
              style={{ width: "78%", height: 13, marginBottom: 5 }}
            />
            <div className="skeleton" style={{ width: "52%", height: 13 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Panel ──────────────────────────────────────────────────────────── */
export default function ThreadPanel({ thread, onClose }) {
  // forwardTarget is { message, attachmentFileIds } (single) or { messages } (multi)
  const [forwardTarget, setForwardTarget] = useState(null);
  const handleForwardMessage = useCallback((msg, options = {}) => {
    setForwardTarget({ message: msg, attachmentFileIds: options.attachmentFileIds });
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const fetchThreadReplies = useChatStore((s) => s.fetchThreadReplies);
  const isLoadingThread = useChatStore((s) => s.isLoadingThread);
  const legacyReplies = useChatStore(
    (s) => s.threadRepliesByRoot?.[thread.rootMessageId] || EMPTY_LIST,
  );
  const threadReplyIds = useChatStore(
    (s) => s.threadReplyIdsByRoot?.[thread.rootMessageId] || EMPTY_LIST,
  );
  const threadRepliesById = useChatStore((s) => s.threadRepliesById || EMPTY_MAP);
  const threadHasMore = useChatStore(
    (s) => s.threadHasMore?.[thread.rootMessageId] ?? false,
  );
  const channelMessages = useChatStore(
    (s) => s.messagesByChannel?.[thread.channelId] || EMPTY_LIST,
  );
  const messagesById = useChatStore((s) => s.messagesById || EMPTY_MAP);
  const threadParentMessages = useChatStore((s) => s.threadParentMessages || EMPTY_MAP);
  const setScrollAndHighlightMessage = useChatStore((s) => s.setScrollAndHighlightMessage);
  const editingMessageId = useChatStore((s) => s.editingMessageId);

  const replies = useMemo(() => {
    if (!CHAT_FEATURE_FLAGS.normalizedMessageStore) return legacyReplies;
    if (!threadReplyIds.length) return EMPTY_LIST;
    return threadReplyIds.map((id) => threadRepliesById[id]).filter(Boolean);
  }, [legacyReplies, threadReplyIds, threadRepliesById]);

  const hasMore = threadHasMore;

  const rootMessage = useMemo(() => {
    if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
      return messagesById[thread.rootMessageId] || threadParentMessages[thread.rootMessageId] || null;
    }
    return channelMessages.find((m) => m._id === thread.rootMessageId) || threadParentMessages[thread.rootMessageId] || null;
  }, [messagesById, thread.rootMessageId, channelMessages, threadParentMessages]);

  const isEditingInThread = useMemo(() => {
    return editingMessageId && (rootMessage?._id === editingMessageId || replies.some(r => r._id === editingMessageId));
  }, [editingMessageId, rootMessage?._id, replies]);

  const bottomRef = useRef(null);
  const prevReplyCountRef = useRef(replies.length);

  useEffect(() => {
    fetchThreadReplies(thread.rootMessageId);
  }, [thread.rootMessageId, fetchThreadReplies]);

  useEffect(() => {
    if (replies.length > prevReplyCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevReplyCountRef.current = replies.length;
  }, [replies.length]);

  const loadMoreReplies = useCallback(async () => {
    if (!hasMore || isLoadingThread || replies.length === 0) return;
    const cursor = replies[replies.length - 1]?._id;
    fetchThreadReplies(thread.rootMessageId, { cursor, limit: 30 });
  }, [
    hasMore,
    isLoadingThread,
    replies,
    thread.rootMessageId,
    fetchThreadReplies,
  ]);

  const replyCount = replies.filter((r) => !r.pending).length;

  // Scroll to top when thread opens to show the parent message
  const contentRef = useRef(null);
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [thread.rootMessageId]);

  return (
    <div className="thread-panel">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="thread-panel__header">
        <div className="thread-panel__header-left">
          <MessageSquare size={15} style={{ color: "var(--text-secondary)" }} />
          <span className="thread-panel__title">Thread</span>
        </div>
        <div className="thread-panel__header-actions">
          <button
            className="thread-panel__icon-btn thread-panel__close-btn"
            onClick={onClose}
            title="Close thread"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Scrollable Content ─────────────────────────────────────────── */}
      <div className="thread-panel__content" ref={contentRef}>
        {isLoadingThread && replies.length === 0 ? (
          <ThreadSkeleton />
        ) : (
          <>
            {/* Root message — parent message always shown at top */}
            {rootMessage && (
              <div className="thread-panel__root">
                <ThreadMessage message={rootMessage} isRoot onForwardMessage={handleForwardMessage} />
              </div>
            )}

            {/* Reply count divider — uses "replies" label not badge style */}
            {replyCount > 0 && (
              <div className="thread-panel__divider">
                <div className="thread-panel__divider-line" />
                <span className="thread-panel__divider-text">
                  {replyCount} {replyCount === 1 ? "reply" : "replies"}
                </span>
                <div className="thread-panel__divider-line" />
              </div>
            )}

            {/* Replies */}
            <div className="thread-panel__replies">
              {replies.map((reply) => (
                <ThreadMessage key={reply._id} message={reply} onForwardMessage={handleForwardMessage} />
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-3">
                <button
                  onClick={loadMoreReplies}
                  disabled={isLoadingThread}
                  className="text-xs cursor-pointer px-4 py-1.5 rounded-md transition-colors"
                  style={{
                    color: "var(--text-link)",
                    background: "var(--bg-hover)",
                    border: "1px solid var(--border-secondary)",
                    opacity: isLoadingThread ? 0.5 : 1,
                  }}
                >
                  {isLoadingThread ? "Loading…" : "Load earlier replies"}
                </button>
              </div>
            )}

            {/* Empty state */}
            {replies.length === 0 && !isLoadingThread && (
              <div className="thread-panel__empty">
                <MessageSquare
                  size={32}
                  style={{ color: "var(--text-muted)", opacity: 0.45 }}
                />
                <p
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color: "var(--text-secondary)",
                  }}
                >
                  No replies yet
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Be the first to reply to this thread.
                </p>
              </div>
            )}

            <div ref={bottomRef} style={{ height: 8 }} />
          </>
        )}
      </div>

      {/* ── Reply Composer ─────────────────────────────────────────────── */}
      {!isEditingInThread && (
        <div className="thread-panel__composer">
          <MessageInput
            channelId={thread.channelId}
            threadId={thread.rootMessageId}
            placeholder="Reply in thread…"
          />
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardTarget && (
        <ForwardMessageModal
          message={forwardTarget.message || null}
          messages={forwardTarget.messages || null}
          attachmentFileIds={forwardTarget.attachmentFileIds || null}
          onClose={() => setForwardTarget(null)}
          onForwardComplete={(destinationId) => {
            // Single destination: navigate to that conversation
            const parts = location.pathname.split('/');
            const wsIdx = parts.indexOf('workspace');
            const wsId = wsIdx !== -1 && wsIdx + 1 < parts.length ? parts[wsIdx + 1] : null;
            const channels = useChannelStore.getState().channels;
            const destChannel = channels.find(c => c._id === destinationId);
            const path = destChannel?.type === 'dm'
              ? getDMPath(wsId, destinationId)
              : getChannelPath(wsId, destinationId);
            useChannelStore.getState().setActiveChannel(destinationId);
            navigate(path);
            setForwardTarget(null);
          }}
        />
      )}
    </div>
  );
}