import { useLiveMentionRenderer } from '../../hooks/useLiveMentionRenderer';
import { useLiveProfileData } from '../../hooks/useLiveProfileData';
import { useEffect, useState } from "react";
import {
  Clock,
  Plus,
  Check,
  Archive,
  ListFilter,
  Inbox,
  Trash2,
  CircleDot,
  FileText,
} from "lucide-react";
import Loader from "../shared/Loader";
import { useLaterStore } from "../../stores/laterStore";
import { useCanvasStore } from "../../stores/canvasStore";
import { Avatar } from "../chat/MemberAvatarGroup";
import {
  format,
  isToday,
  isYesterday,
  differenceInHours,
  isPast,
  formatDistanceToNow,
} from "date-fns";
import ReminderModal from "./ReminderModal";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { sanitizeHtml } from "../../utils/sanitize";
import { KindIcon, getFileKind } from "./SlackFileCard";

import { openPreview } from "../../services/previewService";

/* ─────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────── */
const TABS = [
  { id: "in_progress", label: "In progress", icon: CircleDot  },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "completed", label: "Completed", icon: Check },
];

/* ─────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────── */
function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function deriveAttachments(msg) {
  if (!msg) return [];
  if (msg.fileReferences?.length > 0) {
    return msg.fileReferences
      .map((ref) => {
        if (!ref) return null;
        if (ref.fileId && typeof ref.fileId === 'object') {
          if (ref.fileId.status === 'deleted') return null;
          return {
            ...ref.fileId,
            url: ref.fileId.secureUrl || ref.fileId.url,
            thumbnailUrl: ref.fileId.thumbnailUrl || ref.fileId.secureUrl || ref.fileId.url,
            originalName: ref.fileId.originalName || ref.fileId.fileName || 'File'
          };
        }
        return ref;
      })
      .filter(Boolean);
  }
  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    return msg.attachments.filter((a) => a && a.status !== 'deleted');
  }
  if (Array.isArray(msg.files) && msg.files.length > 0) {
    return msg.files.filter((f) => f && f.status !== 'deleted');
  }
  return [];
}

/* ─────────────────────────────────────────────────────────────────
   SAVED MESSAGE ATTACHMENTS
───────────────────────────────────────────────────────────────── */
function SavedMessageAttachments({ attachments = [] }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div
      className="lp-item__attachments"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginTop: 8,
        width: '100%',
        maxWidth: '100%'
      }}
    >
      {attachments.map((file, idx) => {
        const mime = file.mimeType || file.type || '';
        const name = file.originalName || file.fileName || file.name || 'File';
        const isImg = mime.startsWith('image/');
        const thumb = file.thumbnailUrl || file.secureUrl || file.url;
        const kind = getFileKind(mime, name);
        const sizeStr = formatFileSize(file.fileSize || file.size || file.fileSizeBytes);

        if (isImg && thumb && thumb !== '/placeholder-loading') {
          return (
            <div
              key={file._id || file.url || idx}
              className="lp-attachment-card lp-attachment-card--image"
              onClick={(e) => {
                e.stopPropagation();
                openPreview(file, attachments);
              }}
              style={{
                borderRadius: 8,
                border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.16))',
                overflow: 'hidden',
                maxWidth: '100%',
                background: 'var(--surface-tertiary, var(--bg-tertiary, rgba(0, 0, 0, 0.2)))',
                cursor: 'pointer',
                transition: 'all 160ms ease',
                position: 'relative'
              }}
              title={name}
            >
              <img
                src={thumb}
                alt={name}
                style={{
                  width: '100%',
                  maxHeight: 160,
                  objectFit: 'cover',
                  display: 'block'
                }}
                loading="lazy"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextSibling) {
                    e.target.nextSibling.style.display = 'flex';
                  }
                }}
              />
              <div
                style={{
                  display: 'none',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  background: 'var(--surface-tertiary, var(--bg-tertiary, rgba(255, 255, 255, 0.09)))',
                  color: 'var(--sidebar-text, var(--text-primary, #ffffff))'
                }}
              >
                <KindIcon kind={kind} size={18} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{name}</span>
              </div>
            </div>
          );
        }

        return (
          <div
            key={file._id || file.url || idx}
            className="lp-attachment-card lp-attachment-card--file"
            onClick={(e) => {
              e.stopPropagation();
              openPreview(file, attachments);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--surface-tertiary, var(--bg-tertiary, rgba(255, 255, 255, 0.09)))',
              border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.16))',
              maxWidth: '100%',
              cursor: 'pointer',
              transition: 'all 160ms ease',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)'
            }}
            title={name}
          >
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              <KindIcon kind={kind} size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--sidebar-text, var(--text-primary, #ffffff))',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.3
              }}>
                {name}
              </span>
              {sizeStr && (
                <span style={{
                  fontSize: 10.5,
                  color: 'var(--sidebar-text-dim, var(--text-muted, rgba(255, 255, 255, 0.65)))',
                  lineHeight: 1.2
                }}>
                  {sizeStr}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   DUE FORMATTER
───────────────────────────────────────────────────────────────── */
function formatDue(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  
  // Format as "Due in 5 days", "Due 5 days ago", etc.
  const dist = formatDistanceToNow(d, { addSuffix: true });
  return `Due ${dist}`;
}

/* ─────────────────────────────────────────────────────────────────
   ACTION BUTTON
───────────────────────────────────────────────────────────────── */
function ActionBtn({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button
      title={label}
      className={`lp-action-btn${danger ? " lp-action-btn--danger" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon size={13} />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
   SAVED MESSAGE CARD
───────────────────────────────────────────────────────────────── */
function SavedMessageCard({
  saved,
  onJump,
  onStatusChange,
  onSetReminder,
  onDelete,
  isActive,
}) {
  saved = useLiveProfileData(saved);
  const renderMentions = useLiveMentionRenderer();
  const msg = saved.messageId;
  const isStandalone = saved.type === "standalone";
  const author = (msg?.authorId?.name ? msg.authorId : msg?.senderSnapshot) || {};
  const channel = saved.channelId || {};
  const targetId = isStandalone ? saved._id : msg?._id;

  const statusActions = [
    saved.status !== "completed" && {
      icon: Check,
      label: "Mark complete",
      status: "completed",
    },
    saved.status !== "archived" && {
      icon: Archive,
      label: "Archive",
      status: "archived",
    },
    saved.status !== "in_progress" && {
      icon: CircleDot,
      label: "Move to in progress",
      status: "in_progress",
    },
  ].filter(Boolean);

  const attachments = deriveAttachments(msg);

  return (
    <div
      className={`lp-item${isActive ? " lp-item--active" : ""}`}
      onClick={() =>
        !isStandalone && onJump?.({ channelId: msg?.channelId, _id: msg?._id })
      }
      style={{ cursor: isStandalone ? "default" : "pointer" }}
    >
      {/* ── Content ── */}
      <div className="lp-item__content">
        {isStandalone ? (
          <>
            <div className="lp-item__channel-row">
              {saved.reminderAt && (
                <span className="lp-item__due">{formatDue(saved.reminderAt)}</span>
              )}
              <span className="lp-item__channel">{saved.title || "Untitled reminder"}</span>
            </div>
            {saved.reminderDescription && (
              <div className="lp-item__body">
                <div className="lp-item__details">
                  <div className="lp-item__desc">{saved.reminderDescription}</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="lp-item__channel-row">
              {saved.reminderAt && (
                <span className="lp-item__due">{formatDue(saved.reminderAt)}</span>
              )}
              <span className="lp-item__channel">
                {channel.name ? channel.name : author.name || "Unknown"}
              </span>
            </div>
            <div className="lp-item__body">
              <div className="lp-item__avatar">
                <Avatar
                  member={{ name: author.name || "Unknown", avatar: author.avatar }}
                  size={36}
                  showStatus={true}
                />
              </div>
              <div className="lp-item__details">
                <div className="lp-item__author-row">
                  <span className="lp-item__author">{author.name || "Unknown"}</span>
                  <span className="lp-item__time">{formatTime(msg?.createdAt)}</span>
                </div>
                <div className="lp-item__preview">
                  {msg?.htmlContent ? (
                    <div 
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMentions(msg.htmlContent)) }}
                      className="lp-item__rich-text"
                      style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', color: 'var(--sidebar-text, var(--text-primary, #ffffff))' }}
                    />
                  ) : (
                    msg?.content ? (
                      <span style={{ color: 'var(--sidebar-text, var(--text-primary, #ffffff))' }}>{msg.content}</span>
                    ) : (
                      attachments.length === 0 && msg?.contentType !== 'gif' && <em className="lp-item__preview--empty">Attachment</em>
                    )
                  )}
                  {msg?.contentType === 'gif' && msg?.gifMeta && (
                    <div style={{ marginTop: 6 }}>
                      <img
                        src={msg.gifUrl || msg.gifMeta.gifUrl || msg.gifMeta.previewUrl}
                        alt={msg.gifMeta.title || 'GIF'}
                        style={{
                          maxWidth: '100%',
                          maxHeight: 140,
                          borderRadius: 8,
                          objectFit: 'contain',
                          display: 'block'
                        }}
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>
                {/* Render attachments with full theme contrast and image thumbnails */}
                <SavedMessageAttachments attachments={attachments} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Hover actions */}
      <div className="lp-item__actions" onClick={(e) => e.stopPropagation()}>
        <ActionBtn icon={Clock} label="Set reminder" onClick={() => onSetReminder(saved)} />
        {statusActions.map((a) => (
          <ActionBtn key={a.status} icon={a.icon} label={a.label} onClick={() => onStatusChange(targetId, a.status)} />
        ))}
        <ActionBtn icon={Trash2} label="Delete" onClick={() => onDelete(saved._id)} danger />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   SAVED CANVAS CARD
───────────────────────────────────────────────────────────────── */
function SavedCanvasCard({ canvas, onStatusChange, onJump, onSetReminder }) {
  const statusActions = [
    canvas.savedForLaterStatus !== "completed" && {
      icon: Check,
      label: "Mark complete",
      status: "completed",
    },
    canvas.savedForLaterStatus !== "archived" && {
      icon: Archive,
      label: "Archive",
      status: "archived",
    },
    canvas.savedForLaterStatus !== "in_progress" && {
      icon: CircleDot,
      label: "Move to in progress",
      status: "in_progress",
    },
  ].filter(Boolean);

  return (
    <div
      className="lp-item"
      onClick={() => onJump?.(canvas)}
      style={{ cursor: "pointer" }}
    >
      <div className="lp-item__content">
        <div className="lp-item__channel-row">
          {canvas.reminderAt && (
            <span className="lp-item__due">{formatDue(canvas.reminderAt)}</span>
          )}
          <span className="lp-item__channel">
            <FileText size={14} style={{ marginRight: 6, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {canvas.title || "Untitled canvas"}
            </span>
          </span>
        </div>
        <div className="lp-item__body">
          <div className="lp-item__details">
            <div className="lp-item__preview">
              Canvas • {formatTime(canvas.updatedAt)}
            </div>
          </div>
        </div>
      </div>

      {/* Hover actions */}
      <div className="lp-item__actions" onClick={(e) => e.stopPropagation()}>
        <ActionBtn icon={Clock} label="Set reminder" onClick={() => onSetReminder(canvas)} />
        {statusActions.map((a) => (
          <ActionBtn
            key={a.status}
            icon={a.icon}
            label={a.label}
            onClick={() => onStatusChange(canvas._id, a.status)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   LATER PANEL — main export
───────────────────────────────────────────────────────────────── */
export default function LaterPanel({ onJumpToMessage, onJumpToCanvas }) {
  const {
    savedMessages,
    loading,
    activeTab,
    activeSavedMessageId,
    fetchSavedMessages,
    updateStatus,
    deleteReminder,
    setActiveTab,
    setActiveSavedMessageId,
  } = useLaterStore();

  const fetchSavedCanvases = useCanvasStore((s) => s.fetchSavedCanvases);
  const updateSavedCanvasStatus = useCanvasStore((s) => s.updateSavedCanvasStatus);
  const savedCanvases = useCanvasStore((s) => s.savedCanvases);
  const [canvasesLoading, setCanvasesLoading] = useState(false);

  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedSaved, setSelectedSaved] = useState(null);
  const [isStandaloneReminder, setIsStandaloneReminder] = useState(false);
  const { confirm } = useDeleteConfirm();

  const handleDeleteConfirmed = async (id) => {
    const ok = await confirm({
      title: 'Remove item',
      message: 'This saved item and its reminder will be permanently removed.',
    })
    if (ok) deleteReminder(id)
  }

  /* ── Fetch once on mount ── */
  useEffect(() => {
    fetchSavedMessages();
  }, [fetchSavedMessages]);

  /* ── Fetch saved canvases on mount ── */
  useEffect(() => {
    setCanvasesLoading(true);
    fetchSavedCanvases()
      .finally(() => setCanvasesLoading(false));
  }, [fetchSavedCanvases]);

  /* Auto-highlight first card and automatically open it in Chat Panel */
  useEffect(() => {
    if (loading) return;
    const filtered = savedMessages.filter((m) => m.status === activeTab && !(m.type === "standalone" && m.canvasRef));
    if (filtered.length > 0 && !activeSavedMessageId) {
      const first = filtered[0];
      setActiveSavedMessageId(first._id);
      if (first.type !== "standalone") {
        onJumpToMessage?.(first);
      }
    }
  }, [loading, savedMessages, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Reset active card when tab changes */
  useEffect(() => {
    setActiveSavedMessageId(null);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJumpToMessage = (card) => {
    /* Only called on explicit user click */
    setActiveSavedMessageId(card._id);
    onJumpToMessage?.(card);
  };

  const handleSetReminder = (saved) => {
    setSelectedSaved(saved);
    setIsStandaloneReminder(false);
    setShowReminderModal(true);
  };

  const handleCreateStandalone = () => {
    setSelectedSaved(null);
    setIsStandaloneReminder(true);
    setShowReminderModal(true);
  };

  const handleSetReminderForCanvas = (canvas) => {
    const existing = savedMessages.find(m => m.type === "standalone" && m.canvasRef === canvas._id);
    if (existing) {
      setSelectedSaved(existing);
      setIsStandaloneReminder(false);
    } else {
      setSelectedSaved({
        type: 'standalone',
        title: `Canvas: ${canvas.title || 'Untitled canvas'}`,
        canvasRef: canvas._id,
        channelId: canvas.channelId,
      });
      setIsStandaloneReminder(true);
    }
    setShowReminderModal(true);
  };

  const handleCanvasStatusChange = async (canvasId, status) => {
    await updateSavedCanvasStatus(canvasId, status);
    const standaloneReminder = savedMessages.find(m => m.type === "standalone" && m.canvasRef === canvasId);
    if (standaloneReminder) {
      await updateStatus(standaloneReminder._id, status);
    }
  };

  const handleCanvasJump = (canvas) => {
    onJumpToCanvas?.(canvas);
  };

  const filteredMessages = savedMessages.filter((m) => m.status === activeTab && !(m.type === "standalone" && m.canvasRef));
  const filteredCanvases = savedCanvases.filter(
    (c) => c.savedForLaterStatus === activeTab
  );
  const isEmpty = filteredMessages.length === 0 && filteredCanvases.length === 0;

  const emptyStates = {
    completed: {
      title: "All caught up!",
      sub: "Completed items will appear here.",
      Icon: Check,
    },
    archived: {
      title: "Nothing archived",
      sub: "Archive items to revisit them here.",
      Icon: Archive,
    },
    in_progress: {
      title: "Nothing saved yet",
      sub: "Bookmark messages to review them later.",
      Icon: Inbox,
    },
  };
  const empty = emptyStates[activeTab];

  return (
    <div className="lp-root" data-panel="later">
      {/* ── Header ── */}
      <div className="lp-header">
        <div className="lp-header__title-row">
          <div className="lp-header__title-left">
            <h2 className="lp-header__title">Later</h2>
          </div>
          <div className="lp-header__actions">
            <button
              className="lp-header__action-btn"
              onClick={handleCreateStandalone}
              title="Create reminder"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="lp-tabs">
          {TABS.map((tab) => {
            const count = savedMessages.filter((m) => m.status === tab.id && !(m.type === "standalone" && m.canvasRef)).length
                        + savedCanvases.filter((c) => c.savedForLaterStatus === tab.id).length;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`lp-tab${isActive ? " lp-tab--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}{count > 0 ? ` ${count}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="lp-content">
        {loading || canvasesLoading ? (
          <Loader center size="lg" label="Loading…" />
        ) : isEmpty ? (
          <div className="lp-empty">
            <div className="lp-empty__icon-wrap">
              <empty.Icon size={26} />
            </div>
            <h3 className="lp-empty__title">{empty.title}</h3>
            <p className="lp-empty__sub">{empty.sub}</p>
            {activeTab === "in_progress" && (
              <button
                className="lp-empty__btn"
                onClick={handleCreateStandalone}
              >
                <Plus size={14} /> Create Reminder
              </button>
            )}
          </div>
        ) : (
          <div className="lp-list">
            {/* Canvas cards */}
            {filteredCanvases.map((canvas, i) => {
              const standaloneReminder = savedMessages.find(m => m.type === "standalone" && m.canvasRef === canvas._id);
              return (
              <div
                key={`canvas-${canvas._id}`}
                className="lp-list__item"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <SavedCanvasCard
                  canvas={{ ...canvas, reminderAt: standaloneReminder?.reminderAt }}
                  onStatusChange={handleCanvasStatusChange}
                  onJump={handleCanvasJump}
                  onSetReminder={handleSetReminderForCanvas}
                />
              </div>
            )})}
            {/* Message cards */}
            {filteredMessages.map((saved, i) => (
              <div
                key={saved._id}
                className="lp-list__item"
                style={{ animationDelay: `${(filteredCanvases.length + i) * 45}ms` }}
              >
                <SavedMessageCard
                  saved={saved}
                  onJump={handleJumpToMessage}
                  onStatusChange={updateStatus}
                  onSetReminder={handleSetReminder}
                  onDelete={handleDeleteConfirmed}
                  isActive={saved._id === activeSavedMessageId}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Reminder modal ── */}
      {showReminderModal && (
        <ReminderModal
          saved={selectedSaved}
          isStandalone={isStandaloneReminder}
          onClose={() => {
            setShowReminderModal(false);
            setSelectedSaved(null);
            setIsStandaloneReminder(false);
          }}
        />
      )}
    </div>
  );
}
