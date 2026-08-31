import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChannelStore } from "../../stores/channelStore";
import { useScheduledStore } from "../../stores/scheduledStore";
import { scheduledMessageAPI } from "../../services/api";
import { getChannelPath, getDMPath } from "../../utils/chatRoutes";
import { Clock, Trash2, Send, Edit3, Search, AlertCircle, Paperclip, X, CheckCircle, Hash, Lock, ClockFading, CalendarClock } from 'lucide-react';
import Loader from '../shared/Loader';
import { toast } from "react-hot-toast";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function formatScheduledTime(date) {
  const d = new Date(date);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isToday = d.toDateString() === now.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

function timeUntil(date) {
  const diff = new Date(date) - new Date();
  if (diff <= 0) return "Overdue";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `in ${days}d ${hrs % 24}h`;
  if (hrs > 0) return `in ${hrs}h ${mins % 60}m`;
  return `in ${mins}m`;
}

function truncatePreview(text, max = 90) {
  if (!text) return "";
  const stripped = text.replace(/<[^>]*>/g, "").trim();
  return stripped.length > max ? stripped.slice(0, max) + "…" : stripped;
}

/* ─── Avatar helpers (mirrors DraftsSidebar pattern) ─────────────────────── */

const AVATAR_COLORS = [
  "#1264a3",
  "#059669",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#d97706",
  "#db2777",
  "#65a30d",
];

function getInitials(name = "") {
  return name
    .replace(/^#/, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function avatarBg(name = "") {
  const idx =
    name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) %
    AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

/* ─── Channel Badge ──────────────────────────────────────────────────────── */
/* Dynamic: DM → initials avatar + name | private → lock icon | public → hash */

function ChannelBadge({ channel, channelName, isDM }) {
  if (isDM) {
    const displayName = channelName.replace(/^#/, "");
    const initials = getInitials(displayName);
    const bg = avatarBg(displayName);

    return (
      <span className="sml-channel-badge sml-channel-badge--dm">
        <span
          className="sml-dm-avatar"
          style={{ background: bg }}
          aria-hidden="true"
        >
          {initials}
        </span>
        <span className="sml-channel-name">{displayName}</span>
      </span>
    );
  }

  const isPrivate =
    channel?.isPrivate ??
    channel?.private ??
    channel?.visibility === "private" ??
    false;

  return (
    <span className="sml-channel-badge">
      {isPrivate ? (
        <Lock size={10} strokeWidth={2.3} />
      ) : (
        <Hash size={10} strokeWidth={2.3} />
      )}
      <span className="sml-channel-name">{channelName.replace(/^#/, "")}</span>
    </span>
  );
}

/* ─── Skeleton Card ──────────────────────────────────────────────────────── */

function SkeletonCard({ delay = 0 }) {
  return (
    <div className="sml-skeleton-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="sml-skeleton-row">
        <div
          className="sml-skeleton-line"
          style={{ width: "36%", height: 12 }}
        />
        <div
          className="sml-skeleton-line"
          style={{ width: "22%", height: 10, marginBottom: 0 }}
        />
      </div>
      <div className="sml-skeleton-line" style={{ width: "88%", height: 11 }} />
      <div
        className="sml-skeleton-line"
        style={{ width: "62%", height: 11, marginBottom: 0 }}
      />
    </div>
  );
}

/* ─── Reschedule Form ────────────────────────────────────────────────────── */

function RescheduleForm({
  rescheduleDate,
  setRescheduleDate,
  handleReschedule,
  setRescheduleId,
  isLoading,
}) {
  return (
    <div className="sml-reschedule" onClick={(e) => e.stopPropagation()}>
      {/* Label row */}
      <div className="sml-reschedule-label">
        <CalendarClock size={11} />
        Pick a new date &amp; time
      </div>

      {/* Controls row */}
      <div className="sml-reschedule-controls">
        <div className="sml-reschedule-input-wrap">
          <Clock size={12} className="sml-reschedule-input-icon" />
          <input
            type="datetime-local"
            value={rescheduleDate}
            min={new Date().toISOString().slice(0, 16)}
            onChange={(e) => setRescheduleDate(e.target.value)}
            className="sml-reschedule-input"
            autoFocus
          />
        </div>

        <div className="sml-reschedule-btns">
          <button
            className="sml-reschedule-cancel"
            onClick={(e) => {
              e.stopPropagation();
              setRescheduleId(null);
            }}
            title="Cancel"
          >
            <X size={12} />
          </button>
          <button
            className="sml-reschedule-save"
            onClick={handleReschedule}
            disabled={isLoading || !rescheduleDate}
          >
            {isLoading ? (
              <Loader size={11} />
            ) : (
              <CheckCircle size={11} />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Message Card ───────────────────────────────────────────────────────── */

function MessageCard({
  msg,
  channel,
  channelName,
  isDM,
  isPast,
  rescheduleId,
  rescheduleDate,
  setRescheduleDate,
  openReschedule,
  handleReschedule,
  setRescheduleId,
  handleSendNow,
  handleCancel,
  actionLoading,
  handleNavigate,
  removing,
}) {
  const isRescheduling = rescheduleId === msg._id;
  const isLoading = actionLoading === msg._id;
  const preview = truncatePreview(msg.content || msg.htmlContent);

  return (
    <div
      className={[
        "sml-card",
        isPast ? "overdue" : "",
        removing ? "removing" : "",
        isRescheduling ? "rescheduling" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => !isRescheduling && handleNavigate(msg)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) =>
        e.key === "Enter" && !isRescheduling && handleNavigate(msg)
      }
    >
      {/* Top row */}
      <div className="sml-card-top">
        <ChannelBadge channel={channel} channelName={channelName} isDM={isDM} />

        <div className="sml-time-group">
          <span className={`sml-until-badge${isPast ? " overdue" : ""}`}>
            {timeUntil(msg.scheduledAt)}
          </span>
          <span className={`sml-time-badge${isPast ? " overdue" : ""}`}>
            {isPast && <AlertCircle size={9} />}
            <Clock size={9} />
            {formatScheduledTime(msg.scheduledAt)}
          </span>
        </div>
      </div>

      {/* Preview */}
      <p className={`sml-preview${!preview ? " empty" : ""}`}>
        {preview || "No message content"}
      </p>

      {/* Footer indicators */}
      {(msg.attachments?.length > 0 || isPast) && (
        <div className="sml-card-footer">
          {msg.attachments?.length > 0 && (
            <span className="sml-indicator">
              <Paperclip size={10} />
              {msg.attachments.length} attachment
              {msg.attachments.length !== 1 ? "s" : ""}
            </span>
          )}
          {isPast && (
            <span
              className="sml-indicator"
              style={{ color: "var(--accent-red, #e5534b)" }}
            >
              <AlertCircle size={10} />
              Awaiting send
            </span>
          )}
        </div>
      )}

      {/* Enhanced reschedule form */}
      {isRescheduling && (
        <RescheduleForm
          rescheduleDate={rescheduleDate}
          setRescheduleDate={setRescheduleDate}
          handleReschedule={handleReschedule}
          setRescheduleId={setRescheduleId}
          isLoading={isLoading}
        />
      )}

      {/* Hover actions */}
      <div className="sml-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="sml-action-btn send"
          onClick={(e) => handleSendNow(e, msg._id)}
          disabled={isLoading}
          title="Send now"
        >
          {isLoading ? (
            <Loader size={13} />
          ) : (
            <Send size={13} />
          )}
        </button>
        <button
          className="sml-action-btn edit"
          onClick={(e) => openReschedule(e, msg)}
          disabled={isLoading}
          title="Reschedule"
        >
          <Edit3 size={13} />
        </button>
        <button
          className="sml-action-btn delete"
          onClick={(e) => handleCancel(e, msg._id)}
          disabled={isLoading}
          title="Cancel"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function ScheduledMessagesList({ onCountChange } = {}) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const channels = useChannelStore((s) => s.channels);
  const setScheduledCount = useScheduledStore((s) => s.setScheduledCount);
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [rescheduleId, setRescheduleId] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [removingIds, setRemovingIds] = useState(new Set());
  const searchRef = useRef(null);
  const { confirm } = useDeleteConfirm();

  /* ── Fetch ── */
  const fetchMessages = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      setLoading(true);
      const { data } = await scheduledMessageAPI.list();
      const items = data?.data?.messages || [];
      const arr = Array.isArray(items) ? items : [];
      setMessages(arr);
      setScheduledCount(arr.length);
      onCountChange?.(arr.length);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, onCountChange]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  /* ── Socket: Remove sent scheduled messages in real-time ── */
  useEffect(() => {
    const socket = window.socketInstance;
    if (!socket) return;

    const handleScheduledSent = ({ scheduledMessageId }) => {
      if (!scheduledMessageId) return;
      animateRemove(scheduledMessageId, () => {
        setMessages((prev) => {
          const next = prev.filter((m) => m._id !== scheduledMessageId);
          setScheduledCount(next.length);
          onCountChange?.(next.length);
          return next;
        });
      });
    };

    socket.on("scheduledMessage:sent", handleScheduledSent);
    return () => {
      socket.off("scheduledMessage:sent", handleScheduledSent);
    };
  }, [onCountChange]);

  /* ── Animated remove ── */
  const animateRemove = (id, cb) => {
    setRemovingIds((prev) => new Set([...prev, id]));
    setTimeout(() => {
      cb();
      setRemovingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 240);
  };

  /* ── Actions ── */
  const handleCancel = async (e, id) => {
    e.stopPropagation();
    const ok = await confirm({
      title: "Cancel scheduled message",
      message:
        "This scheduled message will be permanently cancelled and not sent.",
      confirmLabel: "Cancel message",
    });
    if (!ok) return;
    setActionLoading(id);
    try {
      await scheduledMessageAPI.cancel(id);
      animateRemove(id, () => {
        setMessages((prev) => {
          const next = prev.filter((m) => m._id !== id);
          setScheduledCount(next.length);
          onCountChange?.(next.length);
          return next;
        });
      });
      toast.success("Scheduled message cancelled");
    } catch {
      toast.error("Failed to cancel");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendNow = async (e, id) => {
    e.stopPropagation();
    setActionLoading(id);

    try {
      await scheduledMessageAPI.sendNow(id);

      animateRemove(id, () => {
        setMessages((prev) => {
          const next = prev.filter((m) => m._id !== id);
          setScheduledCount(next.length);
          onCountChange?.(next.length);
          return next;
        });
      });

      toast.success("Message sent successfully!");
    } catch (error) {
      toast.error("Failed to send message!");
    } finally {
      setActionLoading(null);
    }
  };

  const openReschedule = (e, msg) => {
    e.stopPropagation();
    setRescheduleId(msg._id);
    setRescheduleDate(new Date(msg.scheduledAt).toISOString().slice(0, 16));
  };

  const handleReschedule = async (e) => {
    e.stopPropagation();
    if (!rescheduleDate) {
      toast.error("Pick a date and time");
      return;
    }
    const date = new Date(rescheduleDate);
    if (date <= new Date()) {
      toast.error("Must be in the future");
      return;
    }
    setActionLoading(rescheduleId);
    try {
      await scheduledMessageAPI.reschedule(rescheduleId, date.toISOString());
      setMessages((prev) =>
        prev.map((m) =>
          m._id === rescheduleId
            ? { ...m, scheduledAt: date.toISOString() }
            : m,
        ),
      );
      setRescheduleId(null);
      toast.success("Rescheduled!");
    } catch {
      toast.error("Failed to reschedule");
    } finally {
      setActionLoading(null);
    }
  };

  const handleNavigate = (msg) => {
    const channelId =
      typeof msg.channelId === "object" ? msg.channelId._id : msg.channelId;
    const channel = channels.find((c) => c._id === channelId);
    if (!channel) return;
    navigate(
      channel.type === "dm"
        ? getDMPath(activeWorkspaceId, channelId)
        : getChannelPath(activeWorkspaceId, channelId),
    );
  };

  /* ── Channel helpers ── */
  const getChannel = (channelId) => {
    const id = typeof channelId === "object" ? channelId._id : channelId;
    return channels.find((c) => c._id === id);
  };

  const getChannelName = (channelId) => {
    const ch = getChannel(channelId);
    if (!ch) return "Unknown";
    if (ch.type === "dm")
      return ch.dmRecipientName || ch.name || "Direct Message";
    return `#${ch.name}`;
  };

  /* ── Filtering ── */
  const now = new Date();
  const todayStr = now.toDateString();

  const overdueMessages = messages.filter((m) => new Date(m.scheduledAt) < now);
  const todayMessages = messages.filter((m) => {
    const d = new Date(m.scheduledAt);
    return d >= now && d.toDateString() === todayStr;
  });

  const filtered = messages.filter((m) => {
    const channelId =
      typeof m.channelId === "object" ? m.channelId._id : m.channelId;
    const name = getChannelName(channelId).toLowerCase();
    const content = (m.content || "").toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || content.includes(q) || name.includes(q);
    const isPast = new Date(m.scheduledAt) < now;
    const isToday = new Date(m.scheduledAt).toDateString() === todayStr;
    const matchesFilter =
      filter === "all" ||
      (filter === "overdue" && isPast) ||
      (filter === "today" && isToday && !isPast);
    return matchesSearch && matchesFilter;
  });

  /* ── Group by date ── */
  const grouped = filtered.reduce((acc, msg) => {
    const d = new Date(msg.scheduledAt);
    const isPast = d < now;
    const key = isPast
      ? "__overdue__"
      : d.toDateString() === todayStr
        ? "Today"
        : d.toDateString() ===
            new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate() + 1,
            ).toDateString()
          ? "Tomorrow"
          : d.toLocaleDateString([], {
              weekday: "long",
              month: "short",
              day: "numeric",
            });
    if (!acc[key]) acc[key] = [];
    acc[key].push(msg);
    return acc;
  }, {});

  const groupOrder = Object.keys(grouped).sort((a, b) => {
    if (a === "__overdue__") return -1;
    if (b === "__overdue__") return 1;
    if (a === "Today") return -1;
    if (b === "Today") return 1;
    if (a === "Tomorrow") return -1;
    if (b === "Tomorrow") return 1;
    return 0;
  });

  /* ── Chip data ── */
  const chips = [
    { key: "all", label: "All", count: messages.length },
    { key: "today", label: "Today", count: todayMessages.length },
    { key: "overdue", label: "Overdue", count: overdueMessages.length },
  ];

  /* ─────────────────────────────────────────── Render ─────────────────── */
  return (
    <div className="sml-root ds-root">
      {/* Header */}
      <div className="sml-header ds-header">
        <div className="sml-search ds-search">
          <Search size={13} className="sml-search-icon ds-search__icon" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scheduled…"
            className="sml-search-input ds-search__input"
            aria-label="Search scheduled messages"
          />
          {searchQuery && (
            <button
              className="sml-search-clear ds-search__clear"
              onClick={() => {
                setSearchQuery("");
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <X size={10} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      {!loading && messages.length > 0 && (
        <div className="sml-filters">
          {chips.map(({ key, label, count }) => (
            <button
              key={key}
              className={`sml-chip${filter === key ? " active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
              {count > 0 && (
                <span
                  className="sml-chip-count"
                  style={
                    key === "overdue" && count > 0 && filter !== key
                      ? {
                          background:
                            "color-mix(in srgb, var(--accent-red, #e5534b) 16%, transparent)",
                          color: "var(--accent-red, #e5534b)",
                        }
                      : {}
                  }
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="sml-body">
        {loading ? (
          <>
            <SkeletonCard delay={0} />
            <SkeletonCard delay={90} />
            <SkeletonCard delay={180} />
          </>
        ) : filtered.length === 0 ? (
          <div className="sml-empty ds-empty">
            <div className="sml-empty-icon ds-empty__icon-wrap">
              <ClockFading size={28} />
            </div>
            <h3 className="sml-empty-title ds-empty__title">
              {searchQuery
                ? "No matching messages"
                : "No scheduled messages yet"}
            </h3>
            <p className="sml-empty-desc ds-empty__desc">
              {searchQuery
                ? "Try a different search term."
                : "Compose a message and schedule it — it'll appear here automatically."}
            </p>
          </div>
        ) : (
          groupOrder.map((group) => (
            <div key={group}>
              {/* Group header */}
              <div className="sml-group-header">
                <div className="sml-group-line" />
                <span
                  className={`sml-group-label${group === "__overdue__" ? " overdue" : ""}`}
                >
                  {group === "__overdue__" ? "⚠ Overdue" : group}
                </span>
                <div className="sml-group-line" />
              </div>

              {grouped[group].map((msg) => {
                const channelId =
                  typeof msg.channelId === "object"
                    ? msg.channelId._id
                    : msg.channelId;
                const ch = getChannel(channelId);
                const channelName = getChannelName(channelId);
                const isPast = new Date(msg.scheduledAt) < now;

                return (
                  <MessageCard
                    key={msg._id}
                    msg={msg}
                    channel={ch}
                    channelName={channelName}
                    isDM={ch?.type === "dm"}
                    isPast={isPast}
                    rescheduleId={rescheduleId}
                    rescheduleDate={rescheduleDate}
                    setRescheduleDate={setRescheduleDate}
                    openReschedule={openReschedule}
                    handleReschedule={handleReschedule}
                    setRescheduleId={setRescheduleId}
                    handleSendNow={handleSendNow}
                    handleCancel={handleCancel}
                    actionLoading={actionLoading}
                    handleNavigate={handleNavigate}
                    removing={removingIds.has(msg._id)}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer stats */}
      {!loading && messages.length > 0 && (
        <div className="sml-footer">
          <Send size={11} />
          {messages.length} scheduled
          {overdueMessages.length > 0 && (
            <>
              <span className="sml-footer-dot" />
              <span
                style={{ color: "var(--accent-red, #e5534b)", fontWeight: 600 }}
              >
                {overdueMessages.length} overdue
              </span>
            </>
          )}
          {todayMessages.length > 0 && (
            <>
              <span className="sml-footer-dot" />
              <span
                style={{
                  color: "var(--accent-green, #2eb67d)",
                  fontWeight: 600,
                }}
              >
                {todayMessages.length} today
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
