import { useEffect, useState } from "react";
import {
  Clock,
  Plus,
  Check,
  Archive,
  Loader2,
  ChevronRight,
  BookmarkCheck,
  Inbox,
  Trash2,
} from "lucide-react";
import { useLaterStore } from "../../stores/laterStore";
import { Avatar } from "../chat/MemberAvatarGroup";
import {
  format,
  isToday,
  isYesterday,
  differenceInHours,
  isPast,
} from "date-fns";
import ReminderModal from "./ReminderModal";

/* ─────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────── */
const TABS = [
  { id: "in_progress", label: "In progress", icon: Clock },
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

/* ─────────────────────────────────────────────────────────────────
   REMINDER PILL
───────────────────────────────────────────────────────────────── */
function ReminderPill({ reminderAt, recurrence }) {
  const d = new Date(reminderAt);
  const overdue = isPast(d);
  const soon = !overdue && differenceInHours(d, new Date()) < 2;
  const cls = overdue
    ? "lp-pill--overdue"
    : soon
      ? "lp-pill--soon"
      : "lp-pill--normal";

  const repeatLabel =
    recurrence && recurrence !== "none"
      ? recurrence === "daily"
        ? "Daily"
        : recurrence === "weekly"
          ? `Every ${format(d, "EEEE")}`
          : "Monthly"
      : null;

  return (
    <span className={`lp-pill ${cls}`}>
      <Clock size={10} />
      {repeatLabel && <span className="lp-pill__repeat">{repeatLabel} ·</span>}
      {overdue ? "Overdue · " : soon ? "Soon · " : ""}
      {format(d, "MMM d, h:mm a")}
    </span>
  );
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
  const msg = saved.messageId;
  const isStandalone = saved.type === "standalone";
  const author = msg?.senderSnapshot || msg?.authorId || {};
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
      icon: Clock,
      label: "Move to in progress",
      status: "in_progress",
    },
  ].filter(Boolean);

  return (
    <div
      className={`lp-card${isActive ? " lp-card--active" : ""}`}
      onClick={() =>
        !isStandalone && onJump?.({ channelId: msg?.channelId, _id: msg?._id })
      }
      style={{ cursor: isStandalone ? "default" : "pointer" }}
    >
      {/* Left accent stripe */}
      <div className="lp-card__stripe" />

      {/* ── Top row ── */}
      <div className="lp-card__top">
        {!isStandalone && (
          <div className="lp-card__avatar">
            <Avatar
              member={{ name: author.name || "Unknown", avatar: author.avatar }}
              size={34}
              showStatus={false}
            />
          </div>
        )}

        <div className="lp-card__meta">
          {isStandalone ? (
            <div className="lp-card__standalone-title">
              {saved.title || "Untitled reminder"}
            </div>
          ) : (
            <div className="lp-card__author-row">
              <span className="lp-card__author">
                {author.name || "Unknown"}
              </span>
              <span className="lp-card__time">
                {formatTime(msg?.createdAt)}
              </span>
              {channel.name && (
                <span className="lp-card__channel">#{channel.name}</span>
              )}
            </div>
          )}
        </div>

        {/* Always-visible action buttons */}
        <div className="lp-card__actions" onClick={(e) => e.stopPropagation()}>
          <ActionBtn
            icon={Clock}
            label="Set reminder"
            onClick={() => onSetReminder(saved)}
          />
          {statusActions.map((a) => (
            <ActionBtn
              key={a.status}
              icon={a.icon}
              label={a.label}
              onClick={() => onStatusChange(targetId, a.status)}
            />
          ))}
          <ActionBtn
            icon={Trash2}
            label="Delete"
            onClick={() => onDelete(saved._id)}
            danger
          />
        </div>
      </div>

      {/* ── Message preview ── */}
      {!isStandalone && (
        <p className="lp-card__preview">
          {msg?.content || (
            <em className="lp-card__preview--empty">Attachment</em>
          )}
        </p>
      )}

      {/* ── Standalone description ── */}
      {isStandalone && saved.reminderDescription && (
        <p className="lp-card__standalone-desc">{saved.reminderDescription}</p>
      )}

      {/* ── Bottom row ── */}
      <div
        className={`lp-card__bottom${isStandalone ? " lp-card__bottom--standalone" : ""}`}
      >
        {saved.reminderAt && (
          <ReminderPill
            reminderAt={saved.reminderAt}
            recurrence={saved.recurrence}
          />
        )}
        {!isStandalone && (
          <span className="lp-card__jump">
            <ChevronRight size={11} />
            Jump to message
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   LATER PANEL — main export
───────────────────────────────────────────────────────────────── */
export default function LaterPanel({ onJumpToMessage }) {
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

  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedSaved, setSelectedSaved] = useState(null);
  const [isStandaloneReminder, setIsStandaloneReminder] = useState(false);

  /* ── Fetch once on mount ── */
  useEffect(() => {
    fetchSavedMessages();
  }, [fetchSavedMessages]);

  /* Auto-highlight first card and automatically open it in Chat Panel */
  useEffect(() => {
    if (loading) return;
    const filtered = savedMessages.filter((m) => m.status === activeTab);
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

  const filteredMessages = savedMessages.filter((m) => m.status === activeTab);

  const emptyStates = {
    completed: {
      title: "All caught up!",
      sub: "Completed items will appear here.",
      Icon: BookmarkCheck,
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
            <div className="lp-header__icon-wrap">
              <Clock size={16} />
            </div>
            <h2 className="lp-header__title">Later</h2>
          </div>
          <button
            className="lp-header__add-btn"
            onClick={handleCreateStandalone}
            title="Create reminder"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="lp-tabs">
          {TABS.map((tab) => {
            const count = savedMessages.filter(
              (m) => m.status === tab.id,
            ).length;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`lp-tab${isActive ? " lp-tab--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon size={13} />
                {tab.label}
                {count > 0 && (
                  <span
                    className={`lp-tab__badge${isActive ? " lp-tab__badge--active" : ""}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="lp-content">
        {loading ? (
          <div className="lp-loading">
            <Loader2 size={28} className="lp-spinner" />
            <p className="lp-loading__text">Loading…</p>
          </div>
        ) : filteredMessages.length === 0 ? (
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
            {filteredMessages.map((saved, i) => (
              <div
                key={saved._id}
                className="lp-list__item"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <SavedMessageCard
                  saved={saved}
                  onJump={handleJumpToMessage}
                  onStatusChange={updateStatus}
                  onSetReminder={handleSetReminder}
                  onDelete={deleteReminder}
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
