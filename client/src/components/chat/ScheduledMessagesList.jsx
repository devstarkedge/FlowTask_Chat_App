import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChannelStore } from "../../stores/channelStore";
import { scheduledMessageAPI } from "../../services/api";
import { getChannelPath, getDMPath } from "../../utils/chatRoutes";
import {
  Clock,
  Trash2,
  Send,
  Edit3,
  Loader2,
  Search,
  Calendar,
  AlertCircle,
  Paperclip,
  X,
  CheckCircle,
  Hash,
  MessageSquare,
  ChevronRight,
  Zap,
  ClockFading ,
} from "lucide-react";
import toast from "react-hot-toast";

/* ─── Helpers ──────────────────────────────────────────────────────────── */

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

/* ─── Styles ───────────────────────────────────────────────────────────── */

const styles = `
  @keyframes sml-fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes sml-fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes sml-slideDown {
    from { opacity: 0; transform: translateY(-6px) scaleY(0.96); }
    to   { opacity: 1; transform: translateY(0) scaleY(1); }
  }
  @keyframes sml-pop {
    0%   { transform: scale(1); }
    45%  { transform: scale(0.88); }
    100% { transform: scale(1); }
  }
  @keyframes sml-pulse-ring {
    0%   { box-shadow: 0 0 0 0 rgba(220,38,38,.4); }
    70%  { box-shadow: 0 0 0 6px rgba(220,38,38,0); }
    100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
  }
  @keyframes sml-shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  .sml-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
    overflow: hidden;
  }

  /* ── Header ── */
  .sml-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--border-secondary);
    flex-shrink: 0;
    background: var(--bg-primary);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .sml-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .sml-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -.01em;
  }
  .sml-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    background: var(--accent-primary);
    color: #fff;
    animation: sml-pop 300ms ease;
  }
  .sml-count-badge.overdue {
    background: var(--accent-red);
    animation: sml-pulse-ring 1.8s ease infinite;
  }

  /* ── Search ── */
  .sml-search-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
    max-width: 260px;
  }
  .sml-search-icon {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
  }
  .sml-search-input {
    width: 100%;
    padding: 7px 28px 7px 30px;
    border-radius: 8px;
    border: 1px solid var(--border-secondary);
    background: var(--bg-input, var(--bg-secondary));
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-sans);
    outline: none;
    transition: border-color 150ms, box-shadow 150ms;
  }
  .sml-search-input::placeholder { color: var(--text-muted); }
  .sml-search-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(78,124,255,.15);
  }
  .sml-search-clear {
    position: absolute;
    right: 7px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: var(--text-muted);
    color: var(--bg-primary);
    cursor: pointer;
    padding: 0;
    opacity: 0.6;
    transition: opacity 120ms;
  }
  .sml-search-clear:hover { opacity: 1; }

  /* ── Sort / Filter bar ── */
  .sml-filter-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px 6px;
    border-bottom: 1px solid var(--border-secondary);
    flex-shrink: 0;
    overflow-x: auto;
  }
  .sml-filter-bar::-webkit-scrollbar { display: none; }
  .sml-filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 20px;
    border: 1px solid transparent;
    background: var(--bg-secondary);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 140ms ease;
  }
  .sml-filter-chip:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }
  .sml-filter-chip.active {
    background: var(--bg-active);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }
  .sml-filter-chip-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--accent-primary);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
  }

  /* ── List body ── */
  .sml-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 10px 12px;
  }

  /* ── Empty ── */
  .sml-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 10px;
    text-align: center;
    animation: sml-fadeIn 300ms ease;
  }
  .sml-empty-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .sml-empty-sub {
    font-size: 12px;
    color: var(--text-muted);
    max-width: 200px;
    line-height: 1.5;
  }

  /* ── Skeleton loader ── */
  .sml-skeleton-item {
    padding: 12px;
    border-radius: 10px;
    margin-bottom: 6px;
    border: 1px solid var(--border-secondary);
    background: var(--bg-secondary);
  }
  .sml-skeleton-line {
    height: 10px;
    border-radius: 5px;
    background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-active) 50%, var(--bg-hover) 75%);
    background-size: 200% 100%;
    animation: sml-shimmer 1.4s linear infinite;
    margin-bottom: 8px;
  }

  /* ── Message card ── */
  .sml-card {
    position: relative;
    padding: 11px 12px;
    border-radius: 10px;
    border: 1px solid var(--border-secondary);
    background: var(--bg-secondary);
    margin-bottom: 6px;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease, transform 200ms ease, box-shadow 200ms ease;
    overflow: hidden;
    animation: sml-fadeUp 250ms ease both;
  }
  .sml-card::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    border-radius: 10px 0 0 10px;
    background: var(--accent-primary);
    opacity: 0;
    transition: opacity 160ms ease;
  }
  .sml-card.overdue::before { background: var(--accent-red); opacity: 1; }
  .sml-card:hover {
    background: var(--bg-hover);
    border-color: var(--border-primary);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(0,0,0,0.1);
  }
  .sml-card:hover::before { opacity: 1; }
  .sml-card:active { transform: translateY(0); box-shadow: none; }
  .sml-card.removing {
    animation: sml-fadeUp 200ms ease reverse both;
    pointer-events: none;
  }

  /* ── Card top row ── */
  .sml-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
  }
  .sml-channel-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    background: var(--bg-active);
    padding: 2px 7px;
    border-radius: 20px;
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sml-time-group {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .sml-time-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--bg-tertiary, var(--bg-secondary));
    border: 1px solid var(--border-secondary);
    transition: color 150ms;
  }
  .sml-time-badge.overdue {
    color: var(--accent-red);
    border-color: rgba(220,38,38,.25);
    background: rgba(220,38,38,.07);
  }
  .sml-until-badge {
    font-size: 10px;
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .sml-until-badge.overdue { color: var(--accent-red); font-weight: 700; }

  /* ── Card content ── */
  .sml-card-body { margin-bottom: 4px; }
  .sml-preview {
    font-size: 13px;
    line-height: 1.45;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }
  .sml-preview.empty { color: var(--text-muted); font-style: italic; }

  /* ── Card footer indicators ── */
  .sml-card-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }
  .sml-indicator {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: var(--text-muted);
  }

  /* ── Reschedule form ── */
  .sml-reschedule-form {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--bg-active);
    border: 1px solid var(--accent-primary);
    animation: sml-slideDown 180ms ease;
  }
  .sml-reschedule-input {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid var(--border-primary);
    background: var(--bg-input, var(--bg-secondary));
    color: var(--text-primary);
    font-size: 12px;
    font-family: var(--font-sans);
    outline: none;
    transition: border-color 140ms;
    color-scheme: dark;
  }
  .sml-reschedule-input:focus { border-color: var(--accent-primary); }
  .sml-reschedule-save {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 11px;
    border-radius: 6px;
    border: none;
    background: var(--accent-primary);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: filter 140ms, transform 120ms;
  }
  .sml-reschedule-save:hover { filter: brightness(1.1); }
  .sml-reschedule-save:active { transform: scale(.96); }
  .sml-reschedule-save:disabled { opacity: .55; cursor: not-allowed; }
  .sml-reschedule-cancel {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: none;
    background: var(--bg-hover);
    color: var(--text-muted);
    cursor: pointer;
    transition: background 120ms, color 120ms;
    padding: 0;
    flex-shrink: 0;
  }
  .sml-reschedule-cancel:hover { background: var(--accent-red); color: #fff; }

  /* ── Hover actions ── */
  .sml-actions {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: flex;
    align-items: center;
    gap: 3px;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 160ms ease, transform 160ms ease;
    pointer-events: none;
    z-index: 5;
  }
  .sml-card:hover .sml-actions {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .sml-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid var(--border-secondary);
    background: var(--bg-secondary);
    cursor: pointer;
    transition: background 120ms, border-color 120ms, color 120ms, transform 120ms;
    padding: 0;
    color: var(--text-muted);
  }
  .sml-action-btn:hover { transform: translateY(-1px); border-color: var(--border-primary); }
  .sml-action-btn:active { transform: scale(.9); }
  .sml-action-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; }
  .sml-action-btn.send:hover    { background: rgba(5,150,105,.12); border-color: var(--accent-green); color: var(--accent-green); }
  .sml-action-btn.edit:hover    { background: var(--bg-active); border-color: var(--accent-primary); color: var(--accent-primary); }
  .sml-action-btn.delete:hover  { background: rgba(220,38,38,.1); border-color: var(--accent-red); color: var(--accent-red); }
  .sml-action-btn.loading { animation: none; }

  /* ── Footer summary ── */
  .sml-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 14px 12px;
    border-top: 1px solid var(--border-secondary);
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
    animation: sml-fadeIn 300ms ease;
  }
  .sml-footer-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--border-primary);
  }

  /* ── Date group header ── */
  .sml-date-group {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 4px 6px;
  }
  .sml-date-group-line {
    flex: 1;
    height: 1px;
    background: var(--border-secondary);
  }
  .sml-date-group-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--text-muted);
    white-space: nowrap;
  }

  /* ── Stagger animation delays ── */
  .sml-card:nth-child(1)  { animation-delay: 30ms; }
  .sml-card:nth-child(2)  { animation-delay: 60ms; }
  .sml-card:nth-child(3)  { animation-delay: 90ms; }
  .sml-card:nth-child(4)  { animation-delay: 120ms; }
  .sml-card:nth-child(5)  { animation-delay: 150ms; }
  .sml-card:nth-child(6)  { animation-delay: 180ms; }
  .sml-card:nth-child(7)  { animation-delay: 210ms; }
  .sml-card:nth-child(8)  { animation-delay: 240ms; }
`;

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function SkeletonCard({ delay = 0 }) {
  return (
    <div className="sml-skeleton-item" style={{ animationDelay: `${delay}ms` }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          className="sml-skeleton-line"
          style={{ width: "35%", marginBottom: 0 }}
        />
        <div
          className="sml-skeleton-line"
          style={{ width: "22%", marginBottom: 0 }}
        />
      </div>
      <div className="sml-skeleton-line" style={{ width: "88%" }} />
      <div
        className="sml-skeleton-line"
        style={{ width: "60%", marginBottom: 0 }}
      />
    </div>
  );
}

/* ─── Message Card ───────────────────────────────────────────────────────── */
function MessageCard({
  msg,
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

  return (
    <div
      className={`sml-card${isPast ? " overdue" : ""}${removing ? " removing" : ""}`}
      onClick={() => handleNavigate(msg)}
    >
      {/* Top row */}
      <div className="sml-card-top">
        <span className="sml-channel-badge">
          {isDM ? <MessageSquare size={10} /> : <Hash size={10} />}
          {channelName.replace(/^#/, "")}
        </span>

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
      <div className="sml-card-body">
        <p
          className={`sml-preview${!truncatePreview(msg.content || msg.htmlContent) ? " empty" : ""}`}
        >
          {truncatePreview(msg.content || msg.htmlContent) ||
            "No message content"}
        </p>
      </div>

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
              style={{ color: "var(--accent-red)" }}
            >
              <AlertCircle size={10} />
              Awaiting send
            </span>
          )}
        </div>
      )}

      {/* Reschedule form */}
      {isRescheduling && (
        <div
          className="sml-reschedule-form"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="datetime-local"
            value={rescheduleDate}
            min={new Date().toISOString().slice(0, 16)}
            onChange={(e) => setRescheduleDate(e.target.value)}
            className="sml-reschedule-input"
            autoFocus
          />
          <button
            className="sml-reschedule-save"
            onClick={handleReschedule}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <CheckCircle size={11} />
            )}
            Save
          </button>
          <button
            className="sml-reschedule-cancel"
            onClick={(e) => {
              e.stopPropagation();
              setRescheduleId(null);
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Hover action buttons */}
      <div className="sml-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="sml-action-btn send"
          onClick={(e) => handleSendNow(e, msg._id)}
          disabled={isLoading}
          title="Send now"
        >
          {isLoading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Zap size={13} />
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

/* ─── Main Component ──────────────────────────────────────────────────────── */
export default function ScheduledMessagesList({ onCountChange } = {}) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const channels = useChannelStore((s) => s.channels);
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | today | overdue
  const [rescheduleId, setRescheduleId] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [removingIds, setRemovingIds] = useState(new Set());
  const searchRef = useRef(null);

  /* ── Inject styles once ── */
  useEffect(() => {
    const id = "sml-styles";
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = styles;
      document.head.appendChild(el);
    }
  }, []);

  /* ── Fetch ── */
  const fetchMessages = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      setLoading(true);
      const { data } = await scheduledMessageAPI.list();
      const items = data?.data?.scheduledMessages || data?.data || [];
      const arr = Array.isArray(items) ? items : [];
      setMessages(arr);
      onCountChange?.(arr.length);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

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
    }, 200);
  };

  /* ── Actions ── */
  const handleCancel = async (e, id) => {
    e.stopPropagation();
    setActionLoading(id);
    try {
      await scheduledMessageAPI.cancel(id);
      animateRemove(id, () => {
        setMessages((prev) => {
          const next = prev.filter((m) => m._id !== id);
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
          onCountChange?.(next.length);
          return next;
        });
      });
      toast.success("Message sent!");
    } catch {
      toast.error("Failed to send");
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
      toast.success("Rescheduled");
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
    if (ch.type === "dm") return ch.dmRecipientName || "Direct Message";
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

  // Sort groups: overdue first, then chronological
  const groupOrder = Object.keys(grouped).sort((a, b) => {
    if (a === "__overdue__") return -1;
    if (b === "__overdue__") return 1;
    if (a === "Today") return -1;
    if (b === "Today") return 1;
    if (a === "Tomorrow") return -1;
    if (b === "Tomorrow") return 1;
    return 0;
  });

  return (
    <div className="sml-panel">
      {/* ── Header ── */}
      <div className="sml-header">
        {/* <div className="sml-header-left">
          <Clock size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span className="sml-title">Scheduled</span>
          {messages.length > 0 && (
            <span className={`sml-count-badge${overdueMessages.length > 0 ? ' overdue' : ''}`}>
              {messages.length}
            </span>
          )}
        </div> */}

        <div className="panel-search mt-3">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scheduled..."
            className="panel-search-input"
          />
        </div>
      </div>

      {/* ── Filter chips ── */}
      {!loading && messages.length > 0 && (
        <div className="sml-filter-bar">
          {[
            { key: "all", label: "All", count: messages.length },
            { key: "today", label: "Today", count: todayMessages.length },
            { key: "overdue", label: "Overdue", count: overdueMessages.length },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              className={`sml-filter-chip${filter === key ? " active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
              {count > 0 && (
                <span
                  className="sml-filter-chip-count"
                  style={
                    key === "overdue" && count > 0
                      ? { background: "var(--accent-red)" }
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

      {/* ── Body ── */}
      <div className="sml-body">
        {loading ? (
          <>
            <SkeletonCard delay={0} />
            <SkeletonCard delay={80} />
            <SkeletonCard delay={160} />
          </>
        ) : filtered.length === 0 ? (
          <div className="draft-empty">
            <ClockFading  size={100} className="empty-icon" />
            <p className="empty-title">
              {searchQuery ? "No results found" : "Write now, send later"}
            </p>
            <p className="empty-text">
              Schedule messages to be sent at a later time, or another day
            </p>
            <p className="empty-text">
              altogether. They’ll wait here until they’re delivered.
            </p>
          </div>
        ) : (
          groupOrder.map((group) => (
            <div key={group}>
              {/* Group header */}
              <div className="sml-date-group">
                <div className="sml-date-group-line" />
                <span
                  className="sml-date-group-label"
                  style={
                    group === "__overdue__"
                      ? { color: "var(--accent-red)" }
                      : {}
                  }
                >
                  {group === "__overdue__" ? "⚠ Overdue" : group}
                </span>
                <div className="sml-date-group-line" />
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

      {/* ── Footer summary ── */}
      {!loading && messages.length > 0 && (
        <div className="sml-footer">
          <Send size={11} />
          {messages.length} scheduled
          {overdueMessages.length > 0 && (
            <>
              <span className="sml-footer-dot" />
              <span style={{ color: "var(--accent-red)", fontWeight: 600 }}>
                {overdueMessages.length} overdue
              </span>
            </>
          )}
          {todayMessages.length > 0 && (
            <>
              <span className="sml-footer-dot" />
              <span style={{ color: "var(--accent-green)" }}>
                {todayMessages.length} today
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
