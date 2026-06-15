import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AtSign,
  Bell,
  CheckCheck,
  Info,
  MessageCircle,
  MessageSquareText,
  UserPlus,
  Settings,
  AlarmClock,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { useNotificationStore } from "../../../stores/notificationStore";
import { Avatar } from "../../chat/MemberAvatarGroup";
import WorkspaceSwitcher from "../../workspace/WorkspaceSwitcher";
import SidebarContainer from "../sidebar/SidebarContainer";
import {
  getNotificationText,
  normalizeNotification,
} from "../../../utils/notificationFormat";

/* ─────────────────────────────────────────────────────────────
   STYLES
   • All colors derive from --sidebar-* vars so the component
     blends into ANY sidebar theme (dark purple, light, custom).
   • NO hardcoded background on the header — it is fully
     transparent so the SidebarContainer bg shows through.
   • The "white line" was caused by a border that used a
     light CSS variable. Fixed: border now uses a fully
     sidebar-relative semi-transparent color.
───────────────────────────────────────────────────────────── */
const STYLES = `

/* ─── Keyframes ─────────────────────────────────────── */
@keyframes acs3-in {
  from { opacity:0; transform:translateY(6px) scale(.98); }
  to   { opacity:1; transform:translateY(0)   scale(1);   }
}
@keyframes acs3-fade {
  from { opacity:0; } to { opacity:1; }
}
@keyframes acs3-pop {
  0%  { transform:scale(.45); opacity:0; }
  65% { transform:scale(1.18); }
  100%{ transform:scale(1);   opacity:1; }
}
@keyframes acs3-rail {
  from { transform:scaleY(0) translateY(-50%); opacity:0; }
  to   { transform:scaleY(1) translateY(-50%); opacity:1; }
}
@keyframes acs3-spin { to { transform:rotate(360deg); } }
@keyframes acs3-shimmer {
  0%  { background-position:-220% center; }
  100%{ background-position: 220% center; }
}
@keyframes acs3-float {
  0%,100% { transform:translateY(0);   }
  50%      { transform:translateY(-5px); }
}

/* ─── Header ───────────────────────────────────────── */
/* "Activity" title bar */
.acs3-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 4px;
  gap: 8px;
}

.acs3-title-left {
  display: flex;
  align-items: center;
  gap: 7px;
}

.acs3-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--sidebar-text, #fff);
  letter-spacing: 0;
  white-space: nowrap;
}

/* Unread count badge (red pill) */
.acs3-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: #e01e5a;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  animation: acs3-pop .3s cubic-bezier(.16,1,.3,1) both;
}

/* Right-side action buttons */
.acs3-title-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.acs3-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border-radius: 7px; border: none;
  background: transparent;
  color: rgba(255,255,255,0.35);
  cursor: pointer;
  padding: 0;
  transition: background 130ms ease, color 130ms ease;
}
.acs3-icon-btn:hover {
  background: rgba(255,255,255,0.09);
  color: rgba(255,255,255,0.85);
}

/* Mark-all-read button */
.acs3-markbtn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.14);
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-size: 11.5px; font-weight: 500;
  cursor: pointer; font-family: inherit;
  white-space: nowrap;
  transition: all 130ms ease;
}
.acs3-markbtn:hover:not(:disabled) {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.28);
  color: rgba(255,255,255,0.9);
}
.acs3-markbtn:disabled { opacity:.4; cursor:not-allowed; }

/* ─── Filter tab pills ───────────────────────────── */
.acs3-tabs {
  display: flex; align-items: center;
  gap: 20px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  margin-bottom: 8px;
  overflow-x: auto;
}
.acs3-tabs::-webkit-scrollbar { display:none; }

.acs3-tab {
  display: inline-flex; align-items: center;
  padding: 8px 4px;
  border-radius: 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-size: 13px; font-weight: 600;
  cursor: pointer; white-space: nowrap; font-family: inherit;
  transition: all 140ms ease;
  margin-bottom: -1px;
}
.acs3-tab:hover {
  background: transparent;
  color: rgba(255,255,255,0.8);
}
.acs3-tab.is-on {
  background: transparent;
  border-bottom-color: var(--accent-primary, #a5b4fc);
  color: #fff;
  font-weight: 600;
  box-shadow: none;
}

/* ─── Scroll container ───────────────────────────── */
.acs3-scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}
.acs3-scroll::-webkit-scrollbar { width:3px; }
.acs3-scroll::-webkit-scrollbar-track { background:transparent; }
.acs3-scroll::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
}

/* ─── Date divider ───────────────────────────────── */
.acs3-divider {
  display: flex; align-items: center; gap:0px;
  padding: 16px 16px 8px;
  animation: acs3-fade .25s ease both;
  justify-content: center;
}
.acs3-divider-line {
  flex:1; height:1px;
  background: rgba(255,255,255,0.08);
}
.acs3-divider-label {
  font-size: 11px; font-weight: 500;
  color: rgba(255,255,255,0.7);
  background: rgba(255,255,255,0.08);
  padding: 4px 12px;
  border-radius: 12px;
  margin: 0 10px;
  letter-spacing: 0; text-transform: none;
  white-space: nowrap;
}

/* ─── Notification row ───────────────────────────── */
.acs3-row {
  position: relative;
  display: flex; align-items: flex-start; gap: 12px;
  width: 100%; padding: 10px 16px;
  background: transparent; border: none;
  text-align: left; cursor: pointer;
  transition: background 120ms ease;
  animation: acs3-in .24s cubic-bezier(.16,1,.3,1) both;
  overflow: hidden;
}

/* Hover: subtle glow film */
.acs3-row::after {
  content:'';
  position:absolute; inset:0;
  background: rgba(255,255,255,0.035);
  opacity:0; transition:opacity 120ms;
  pointer-events:none;
}
.acs3-row:hover::after { opacity:1; }
.acs3-row:focus-visible {
  outline: 2px solid rgba(255,255,255,0.3);
  outline-offset: -2px;
  z-index:1;
}

/* Active (selected) row */
.acs3-row.is-on {
  background: rgba(255,255,255,0.1);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
}
.acs3-row.is-on::after { opacity:0 !important; }

/* Active left accent rail */
.acs3-row.is-on::before {
  content:'';
  position:absolute; left:0; top:50%;
  width:3px; height:65%;
  border-radius:0 3px 3px 0;
  background: var(--sidebar-active-text, #fff);
  transform-origin: center top;
  animation: acs3-rail .22s cubic-bezier(.16,1,.3,1) both;
}

/* ─── Avatar wrapper ─────────────────────────────── */
.acs3-av {
  flex-shrink:0; position:relative; padding-top:2px;
}
/* Small type-icon pip on the avatar corner */
.acs3-pip {
  position:absolute; bottom:-4px; right:-4px;
  width:18px; height:18px; border-radius:6px;
  display:flex; align-items:center; justify-content:center;
  background: #a5b4fc;
  border: 2px solid var(--bg-sidebar, #070534);
}
/* Generic icon box (no avatar) */
.acs3-icon-box {
  width:36px; height:36px; border-radius:10px;
  display:flex; align-items:center; justify-content:center;
  flex-shrink:0;
  transition: transform 140ms ease;
}
.acs3-row:hover .acs3-icon-box { transform:scale(1.07); }

/* ─── Content ────────────────────────────────────── */
.acs3-body {
  flex:1; min-width:0;
  display:flex; flex-direction:column; gap:2px;
}
.acs3-meta {
  display:flex; align-items:baseline;
  justify-content:space-between; gap:6px;
}
/* Sender name */
.acs3-name {
  font-size: 14px; font-weight: 600;
  color: rgba(255,255,255,0.8);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  letter-spacing:0; line-height:1.3;
  transition: color 120ms ease;
}
.acs3-row.is-unread .acs3-name,
.acs3-row.is-on .acs3-name {
  color: #fff;
  font-weight: 700;
}
/* Timestamp */
.acs3-time {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
  white-space:nowrap; flex-shrink:0; line-height:1.4;
}
.acs3-row.is-on .acs3-time { color:rgba(255,255,255,0.5); }

/* Notification body text */
.acs3-text {
  font-size: 13px; line-height: 1.4;
  color: rgba(255,255,255,0.6);
  display:-webkit-box;
  -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden;
  transition: color 120ms ease;
}
.acs3-row.is-unread .acs3-text { color:rgba(255,255,255,0.9); }
.acs3-row.is-on .acs3-text     { color:rgba(255,255,255,0.9); }

/* Sub-label (channel / body) */
.acs3-sub {
  font-size:11.5px;
  color: rgba(255,255,255,0.25);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}

/* ─── Right indicators ───────────────────────────── */
.acs3-right {
  display:flex; flex-direction:column;
  align-items:flex-end; gap:5px;
  flex-shrink:0; padding-top:2px;
}
/* Unread dot */
.acs3-dot {
  width:8px; height:8px; border-radius:50%;
  background: var(--accent-primary, #9394fb);
  flex-shrink:0;
  animation: acs3-pop .28s cubic-bezier(.16,1,.3,1) both;
}
/* Mention pill */
.acs3-at {
  display:inline-flex; align-items:center; justify-content:center;
  min-width:18px; height:18px; padding:0 5px;
  border-radius:4px;
  background: rgba(147,164,252,.22);
  color: rgba(197,203,255,.9);
  font-size:11px; font-weight:800;
}

/* ─── Skeleton loader ────────────────────────────── */
.acs3-skel {
  border-radius:5px;
  background: linear-gradient(90deg,
    rgba(255,255,255,.04) 25%,
    rgba(255,255,255,.10) 50%,
    rgba(255,255,255,.04) 75%);
  background-size:200% 100%;
  animation: acs3-shimmer 1.5s ease infinite;
}

/* ─── Empty state ────────────────────────────────── */
.acs3-empty {
  display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  padding:56px 24px; text-align:center;
  animation: acs3-in .35s ease both;
}
.acs3-empty-orb {
  width:60px; height:60px; border-radius:18px;
  display:flex; align-items:center; justify-content:center;
  margin-bottom:16px;
  background: rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.08);
  animation: acs3-float 3s ease-in-out infinite;
}
.acs3-empty-title {
  font-size:14px; font-weight:700;
  color:rgba(255,255,255,.75);
  margin:0 0 7px; letter-spacing:-.01em;
}
.acs3-empty-sub {
  font-size:12px; line-height:1.65;
  color:rgba(255,255,255,.3);
  margin:0; max-width:185px;
}

/* ─── Spinner / load row ─────────────────────────── */
.acs3-spinner {
  border-radius:50%;
  border:2px solid rgba(255,255,255,.10);
  border-top-color: var(--accent-primary,#9394fb);
  animation: acs3-spin .72s linear infinite;
}
.acs3-load-row {
  display:flex; justify-content:center;
  padding:14px;
  animation: acs3-fade .2s ease both;
}
`;

/* ── Icon map ── */
const ICONS = {
  mention:          { Icon: AtSign,            color: "var(--accent-primary)" },
  dm:               { Icon: MessageCircle,     color: "var(--accent-green)" },
  thread_reply:     { Icon: MessageSquareText, color: "var(--accent-primary)" },
  channel_invite:   { Icon: UserPlus,          color: "var(--accent-purple)" },
  task_update:      { Icon: Activity,          color: "var(--accent-yellow)" },
  reminder_overdue: { Icon: AlarmClock,        color: "var(--accent-red)" },
  system:           { Icon: Info,              color: "var(--text-muted)" },
};

/* ── Group by date ── */
function groupByDate(list) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const groups = {};
  for (const n of list) {
    if (!n.createdAt) {
      if (!groups["Earlier"]) groups["Earlier"] = [];
      groups["Earlier"].push(n);
      continue;
    }
    const d = new Date(n.createdAt);
    const dateObj = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - dateObj) / (1000 * 60 * 60 * 24));
    
    let label;
    if (diffDays === 0) label = "Today";
    else if (diffDays === 1) label = "Yesterday";
    else if (diffDays < 7) {
      label = d.toLocaleDateString('en-US', { weekday: 'long' });
    } else {
      label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }
  
  const orderedGroups = {};
  if (groups["Today"]) orderedGroups["Today"] = groups["Today"];
  if (groups["Yesterday"]) orderedGroups["Yesterday"] = groups["Yesterday"];
  
  const remainingLabels = Object.keys(groups).filter(k => k !== "Today" && k !== "Yesterday" && k !== "Earlier");
  remainingLabels.sort((a, b) => new Date(groups[b][0].createdAt) - new Date(groups[a][0].createdAt));
  
  for (const label of remainingLabels) {
    orderedGroups[label] = groups[label];
  }
  if (groups["Earlier"]) orderedGroups["Earlier"] = groups["Earlier"];
  
  return orderedGroups;
}

/* ── Format Time ── */
function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateObj = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - dateObj) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

/* ── Sub-components ── */
function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: STYLES }} />;
}

function ActivitySkeleton({ delay = 0 }) {
  return (
    <div style={{
      display:"flex", alignItems:"flex-start", gap:10,
      padding:"8px 12px",
      animation:`acs3-fade .3s ease ${delay}ms both`,
    }}>
      <div className="acs3-skel"
        style={{ width:36, height:36, borderRadius:10, flexShrink:0 }} />
      <div style={{ flex:1, display:"flex", flexDirection:"column", gap:7, paddingTop:3 }}>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <div className="acs3-skel" style={{ height:13, width:"40%", borderRadius:4 }} />
          <div className="acs3-skel" style={{ height:11, width:"18%", borderRadius:4 }} />
        </div>
        <div className="acs3-skel" style={{ height:12, width:"78%", borderRadius:4 }} />
        <div className="acs3-skel" style={{ height:12, width:"55%", borderRadius:4 }} />
      </div>
    </div>
  );
}

function NotifIcon({ notification }) {
  const data  = normalizeNotification(notification);
  const entry = ICONS[notification.type] || ICONS.system;
  const { Icon, color } = entry;

  if (data?.senderName) {
    return (
      <div className="acs3-av">
        <Avatar member={{ name: data.senderName, avatar: data.senderAvatar }} size={36} />
        <div className="acs3-pip" style={{ background: color }}>
          <Icon size={11} style={{ color: "var(--bg-sidebar, #070534)" }} strokeWidth={2.5} />
        </div>
      </div>
    );
  }

  return (
    <div className="acs3-av">
      <div
        className="acs3-icon-box"
        style={{ background:`color-mix(in srgb, ${color} 18%, rgba(0,0,0,0.15))` }}
      >
        <Icon size={15} style={{ color }} />
      </div>
    </div>
  );
}

function NotifRow({ notification, isSelected, animDelay, onSelect, onKeyDown }) {
  const timeStr    = formatTime(notification.createdAt);
  const data       = normalizeNotification(notification);
  const senderName = data?.senderName || "System";

  return (
    <button
      className={[
        "acs3-row",
        isSelected           ? "is-on"     : "",
        !notification.isRead ? "is-unread" : "",
      ].filter(Boolean).join(" ")}
      style={{ animationDelay:`${animDelay}ms` }}
      onClick={() => onSelect(notification)}
      onKeyDown={onKeyDown}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
    >
      <NotifIcon notification={notification} />

      <div className="acs3-body">
        <div className="acs3-meta">
          <span className="acs3-name">{senderName}</span>
          {timeStr && <span className="acs3-time">{timeStr}</span>}
        </div>
        <span className="acs3-text">{getNotificationText(notification)}</span>
        {notification.body && (
          <span className="acs3-sub">{notification.body}</span>
        )}
      </div>

      <div className="acs3-right">
        {!notification.isRead && <span className="acs3-dot" />}
        {notification.type === "mention" && (
          <span className="acs3-at">@</span>
        )}
      </div>
    </button>
  );
}

/* ── Main export ── */
export default function ActivityContextSidebar({
  selectedNotificationId,
  onSelectNotification,
  onAutoSelect,
}) {
  const {
    notifications, unreadCount, isLoading, hasMore,
    fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead,
  } = useNotificationStore();

  const scrollRef                   = useRef(null);
  const [marking, setMarking]       = useState(false);
  const [activeTab, setActiveTab]   = useState("all");

  useEffect(() => {
    fetchNotifications(true);
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  const selected = useMemo(
    () => notifications.find(n => n._id === selectedNotificationId) || null,
    [notifications, selectedNotificationId],
  );

  useEffect(() => {
    if (selected || notifications.length === 0) return;
    onAutoSelect?.(notifications.find(n => !!n.channelId) || notifications[0]);
  }, [notifications, selected, onAutoSelect]);

  const handleSelect = useCallback(async (n) => {
    if (!n) return;
    if (!n.isRead) await markAsRead(n._id);
    onSelectNotification?.(n);
  }, [markAsRead, onSelectNotification]);

  const handleMarkAll = useCallback(async () => {
    setMarking(true);
    try { await markAllAsRead(); } finally { setMarking(false); }
  }, [markAllAsRead]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isLoading || !hasMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) fetchNotifications(false);
  }, [fetchNotifications, hasMore, isLoading]);

  function moveFocus(e, dir) {
    const sib = dir === "next"
      ? e.currentTarget.nextElementSibling
      : e.currentTarget.previousElementSibling;
    if (sib?.tagName === "BUTTON") sib.focus();
  }

  /* Tab filter */
  const filtered = useMemo(() => {
    if (activeTab === "unreads") return notifications.filter(n => !n.isRead);
    if (activeTab === "dms")     return notifications.filter(n => n.type === "dm");
    return notifications;
  }, [notifications, activeTab]);

  const groups = groupByDate(filtered);
  const flat   = Object.values(groups).flat();

  const TABS = [
    { id:"all",     label:"All"     },
    { id:"unreads", label:"Unreads" },
    { id:"dms",     label:"DMs"     },
  ];

  /* ── Header: just WorkspaceSwitcher (dark band) ── */
  const header = (
    <WorkspaceSwitcher />
  );

  /* ── Sub-header: Activity title + tabs (section-specific controls) ── */
  const subHeader = (
    <>
      {/* Title + actions */}
      <div className="acs3-titlebar">
        <div className="acs3-title-left">
          <span className="acs3-title">Activity</span>
          {unreadCount > 0 && (
            <span className="acs3-count">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>

        <div className="acs3-title-actions">
          {unreadCount > 0 && (
            <button className="acs3-markbtn" onClick={handleMarkAll} disabled={marking}>
              {marking
                ? <div className="acs3-spinner" style={{ width:12, height:12 }} />
                : <CheckCheck size={12} />
              }
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="acs3-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`acs3-tab${activeTab === tab.id ? " is-on" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <SidebarContainer header={header} subHeader={subHeader} aria-label="Activity notifications">
      <StyleInjector />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="acs3-scroll"
        role="listbox"
        aria-label="Activity notifications"
      >
        {/* Skeletons */}
        {isLoading && filtered.length === 0 && (
          <div style={{ paddingTop:4 }}>
            {Array.from({ length:7 }).map((_, i) => (
              <ActivitySkeleton key={i} delay={i * 50} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filtered.length === 0 && (
          <div className="acs3-empty">
            <div className="acs3-empty-orb">
              <Bell size={24} style={{ color:"rgba(255,255,255,.35)" }} />
            </div>
            <p className="acs3-empty-title">All caught up</p>
            <p className="acs3-empty-sub">
              Mentions, replies, and reactions appear here in real-time.
            </p>
          </div>
        )}

        {/* Grouped rows */}
        {filtered.length > 0 && (
          <div style={{ paddingBottom:16 }}>
            {Object.entries(groups).map(([label, items]) => {
              if (!items.length) return null;
              return (
                <div key={label}>
                  <div className="acs3-divider">
                    <div className="acs3-divider-line" />
                    <span className="acs3-divider-label">{label}</span>
                    <div className="acs3-divider-line" />
                  </div>
                  {items.map(n => (
                    <NotifRow
                      key={n._id}
                      notification={n}
                      isSelected={n._id === selectedNotificationId}
                      animDelay={Math.min(flat.indexOf(n) * 25, 200)}
                      onSelect={handleSelect}
                      onKeyDown={e => {
                        if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(e,"next"); }
                        if (e.key === "ArrowUp")   { e.preventDefault(); moveFocus(e,"prev"); }
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {isLoading && filtered.length > 0 && (
          <div className="acs3-load-row">
            <div className="acs3-spinner" style={{ width:16, height:16 }} />
          </div>
        )}
      </div>
    </SidebarContainer>
  );
}