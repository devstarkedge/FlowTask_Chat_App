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

/* ─────────────────────────────────────────────
   THEME TOKENS
   The host sets [data-theme="light"] or
   [data-theme="dark"] on <html>/<body>.
   prefers-color-scheme is the automatic fallback.
───────────────────────────────────────────── */
const STYLES = `
/* ── Dark (default) ── */
:root,
[data-theme="dark"],
.theme-dark {
  --acs-bg-row-hover:      rgba(255,255,255,0.045);
  --acs-bg-row-active:     rgba(88,101,242,0.13);
  --acs-bg-icon:           rgba(255,255,255,0.07);
  --acs-bg-empty-ring:     rgba(255,255,255,0.04);
  --acs-border-empty-ring: rgba(255,255,255,0.07);
  --acs-border-divider:    rgba(255,255,255,0.055);
  --acs-bg-markbtn-hover:  rgba(88,101,242,0.12);
  --acs-border-markbtn:    rgba(88,101,242,0.28);
  --acs-text-title:        #f1f1f1;
  --acs-text-label:        #b0b0b8;
  --acs-text-label-unread: #f1f1f1;
  --acs-text-sublabel:     #6e6e7a;
  --acs-text-time:         #5a5a68;
  --acs-text-time-active:  rgba(255,255,255,0.5);
  --acs-text-divider:      #4e4e5e;
  --acs-text-empty-sub:    #5a5a68;
  --acs-text-bell:         #4e4e5e;
  --acs-skeleton-a:        rgba(255,255,255,0.04);
  --acs-skeleton-b:        rgba(255,255,255,0.09);
  --acs-rail-active:       rgba(88,101,242,0.7);
  --acs-scrollbar:         rgba(255,255,255,0.09);
  --acs-focus-ring:        rgba(88,101,242,0.55);
  --acs-dot-pulse:         rgba(88,101,242,0.5);
  --acs-badge-bg:          var(--accent-primary, #5865f2);
  --acs-badge-border:      var(--bg-secondary, #1e1f24);
}

/* ── Light ── */
[data-theme="light"],
.theme-light {
  --acs-bg-row-hover:      rgba(0,0,0,0.035);
  --acs-bg-row-active:     rgba(88,101,242,0.07);
  --acs-bg-icon:           rgba(0,0,0,0.05);
  --acs-bg-empty-ring:     rgba(0,0,0,0.03);
  --acs-border-empty-ring: rgba(0,0,0,0.08);
  --acs-border-divider:    rgba(0,0,0,0.07);
  --acs-bg-markbtn-hover:  rgba(88,101,242,0.07);
  --acs-border-markbtn:    rgba(88,101,242,0.2);
  --acs-text-title:        #12121a;
  --acs-text-label:        #4a4a5a;
  --acs-text-label-unread: #12121a;
  --acs-text-sublabel:     #9090a2;
  --acs-text-time:         #a8a8b8;
  --acs-text-time-active:  rgba(88,101,242,0.75);
  --acs-text-divider:      #b0b0c2;
  --acs-text-empty-sub:    #a0a0b2;
  --acs-text-bell:         #c8c8d8;
  --acs-skeleton-a:        rgba(0,0,0,0.04);
  --acs-skeleton-b:        rgba(0,0,0,0.085);
  --acs-rail-active:       rgba(88,101,242,0.55);
  --acs-scrollbar:         rgba(0,0,0,0.1);
  --acs-focus-ring:        rgba(88,101,242,0.3);
  --acs-dot-pulse:         rgba(88,101,242,0.35);
  --acs-badge-bg:          var(--accent-primary, #5865f2);
  --acs-badge-border:      var(--bg-secondary, #fff);
}

/* ── System preference fallback ── */
@media (prefers-color-scheme: light) {
  :root:not([data-theme]):not(.theme-dark):not(.theme-light) {
    --acs-bg-row-hover:      rgba(0,0,0,0.035);
    --acs-bg-row-active:     rgba(88,101,242,0.07);
    --acs-bg-icon:           rgba(0,0,0,0.05);
    --acs-bg-empty-ring:     rgba(0,0,0,0.03);
    --acs-border-empty-ring: rgba(0,0,0,0.08);
    --acs-border-divider:    rgba(0, 0, 0, 0);
    --acs-bg-markbtn-hover:  rgba(88,101,242,0.07);
    --acs-border-markbtn:    rgba(88,101,242,0.2);
    --acs-text-title:        #12121a;
    --acs-text-label:        #4a4a5a;
    --acs-text-label-unread: #12121a;
    --acs-text-sublabel:     #9090a2;
    --acs-text-time:         #a8a8b8;
    --acs-text-time-active:  rgba(88,101,242,0.75);
    --acs-text-divider:      #ffffff02;
    --acs-text-empty-sub:    #a0a0b2;
    --acs-text-bell:         #c8c8d8;
    --acs-skeleton-a:        rgba(0,0,0,0.04);
    --acs-skeleton-b:        rgba(0,0,0,0.085);
    --acs-rail-active:       rgba(88,101,242,0.55);
    --acs-scrollbar:         rgba(0,0,0,0.1);
    --acs-focus-ring:        rgba(88,101,242,0.3);
    --acs-dot-pulse:         rgba(88,101,242,0.35);
    --acs-badge-bg:          var(--accent-primary, #5865f2);
    --acs-badge-border:      var(--bg-secondary, #fff);
  }
}

/* ── Keyframes ── */
@keyframes acs-fade-slide {
  from { opacity:0; transform:translateY(7px); }
  to   { opacity:1; transform:translateY(0);   }
}
@keyframes acs-fade-in {
  from { opacity:0; }
  to   { opacity:1; }
}
@keyframes acs-scale-in {
  from { opacity:0; transform:scale(0.82); }
  to   { opacity:1; transform:scale(1);    }
}
@keyframes acs-badge-pop {
  0%   { transform:scale(0.4); opacity:0; }
  65%  { transform:scale(1.18); }
  100% { transform:scale(1);   opacity:1; }
}
@keyframes acs-pulse-dot {
  0%,100% { box-shadow:0 0 0 0   var(--acs-dot-pulse); }
  50%     { box-shadow:0 0 0 4px transparent; }
}
@keyframes acs-spin { to { transform:rotate(360deg); } }
@keyframes acs-shimmer {
  0%   { background-position:-200% center; }
  100% { background-position: 200% center; }
}
@keyframes acs-rail-grow {
  from { transform:translateY(-50%) scaleY(0); opacity:0; }
  to   { transform:translateY(-50%) scaleY(1); opacity:1; }
}

/* ── Row ── */
.acs-row {
  display:flex; align-items:flex-start; gap:10px;
  width:100%; padding:8px 10px;
  background:transparent; border:none; text-align:left; cursor:pointer;
  border-radius:10px; position:relative; overflow:hidden;
  transition:background 0.15s ease;
  animation:acs-fade-slide 0.26s cubic-bezier(0.16,1,0.3,1) both;
}
/* hover film */
.acs-row::after {
  content:''; position:absolute; inset:0; border-radius:10px;
  background:var(--acs-bg-row-hover);
  opacity:0; transition:opacity 0.15s; pointer-events:none;
}
.acs-row:hover::after { opacity:1; }
.acs-row:focus-visible { outline:2px solid var(--acs-focus-ring); outline-offset:-2px; }

/* active state */
.acs-row.is-active { background:var(--acs-bg-row-active); }
.acs-row.is-active::after { opacity:0 !important; }
/* left accent rail */
.acs-row.is-active::before {
  content:'';
  position:absolute; left:0; top:50%; width:3px; height:58%;
  transform:translateY(-50%);
  background:var(--acs-rail-active);
  border-radius:0 3px 3px 0;
  animation:acs-rail-grow 0.22s cubic-bezier(0.16,1,0.3,1) both;
}

/* ── Text ── */
.acs-label {
  font-size:12.5px; font-weight:400; line-height:1.45;
  color:var(--acs-text-label);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  transition:color 0.15s;
}
.acs-row.is-unread .acs-label { font-weight:600; color:var(--acs-text-label-unread); }
.acs-sublabel {
  font-size:11px; margin-top:2px;
  color:var(--acs-text-sublabel);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.acs-time {
  font-size:10.5px; white-space:nowrap; flex-shrink:0; margin-top:1px;
  color:var(--acs-text-time); transition:color 0.15s;
}
.acs-row.is-active .acs-time { color:var(--acs-text-time-active); }

/* ── Icons ── */
.acs-icon-wrap  { flex-shrink:0; position:relative; animation:acs-scale-in 0.2s cubic-bezier(0.16,1,0.3,1) both; }
.acs-icon-box   {
  display:flex; align-items:center; justify-content:center;
  width:32px; height:32px; border-radius:10px; flex-shrink:0;
  transition:transform 0.15s;
}
.acs-row:hover .acs-icon-box { transform:scale(1.07); }
.acs-type-badge {
  position:absolute; bottom:-2px; right:-2px;
  width:14px; height:14px; border-radius:50%;
  background:var(--acs-badge-border);
  border:1.5px solid var(--acs-badge-border);
  display:flex; align-items:center; justify-content:center;
}

/* ── Unread dot ── */
.acs-dot {
  width:7px; height:7px; border-radius:50%; flex-shrink:0;
  background:var(--acs-badge-bg);
  animation:acs-badge-pop 0.28s cubic-bezier(0.16,1,0.3,1) both,
            acs-pulse-dot 2.8s ease 1.2s infinite;
}

/* ── Header badge ── */
.acs-hbadge {
  font-size:10px; font-weight:700; line-height:1.5;
  padding:2px 7px; border-radius:20px;
  background:var(--acs-badge-bg); color:#fff;
  animation:acs-badge-pop 0.28s cubic-bezier(0.16,1,0.3,1) both;
}

/* ── Mark-all button ── */
.acs-markbtn {
  display:flex; align-items:center; gap:4px;
  padding:4px 9px; border-radius:7px; cursor:pointer;
  font-size:11px; font-weight:500;
  color:var(--accent-primary, #5865f2);
  background:transparent; border:1px solid transparent;
  transition:background 0.15s, border-color 0.15s;
}
.acs-markbtn:hover:not(:disabled) {
  background:var(--acs-bg-markbtn-hover);
  border-color:var(--acs-border-markbtn);
}
.acs-markbtn:disabled { opacity:0.55; cursor:not-allowed; }

/* ── Section divider ── */
.acs-divider {
  display:flex; align-items:center; gap:8px;
  padding:10px 10px 4px;
  font-size:9.5px; font-weight:700;
  letter-spacing:0.09em; text-transform:uppercase;
  color:var(--acs-text-divider);
  animation:acs-fade-in 0.3s ease both;
}
.acs-divider::after {
  content:''; flex:1; height:1px;
  background:var(--acs-border-divider);
}

/* ── Skeleton ── */
.acs-skel {
  border-radius:6px;
  background:linear-gradient(90deg,
    var(--acs-skeleton-a) 25%,
    var(--acs-skeleton-b) 50%,
    var(--acs-skeleton-a) 75%
  );
  background-size:200% 100%;
  animation:acs-shimmer 1.5s ease infinite;
}

/* ── Empty ── */
.acs-empty {
  display:flex; flex-direction:column; align-items:center;
  justify-content:center; padding:52px 24px; text-align:center;
  animation:acs-fade-slide 0.35s cubic-bezier(0.16,1,0.3,1) both;
}
.acs-empty-ring {
  width:58px; height:58px; border-radius:18px;
  background:var(--acs-bg-empty-ring);
  border:1px solid var(--acs-border-empty-ring);
  display:flex; align-items:center; justify-content:center;
  margin-bottom:14px;
  animation:acs-scale-in 0.3s cubic-bezier(0.16,1,0.3,1) both;
}

/* ── Scrollbar ── */
.acs-scroll::-webkit-scrollbar       { width:4px; }
.acs-scroll::-webkit-scrollbar-track { background:transparent; }
.acs-scroll::-webkit-scrollbar-thumb { background:var(--acs-scrollbar); border-radius:4px; }

/* ── Spinner ── */
.acs-spinner {
  border-radius:50%;
  border:2px solid var(--acs-border-divider);
  border-top-color:var(--accent-primary, #5865f2);
  animation:acs-spin 0.72s linear infinite;
}

/* ── Header icon ── */
.acs-header-icon {
  width:26px; height:26px; border-radius:8px;
  background:var(--acs-bg-icon);
  display:flex; align-items:center; justify-content:center;
}
`;

/* ── Icon map ── */
const ICONS = {
  mention:        { Icon: AtSign,            color: "var(--accent-primary,  #5865f2)" },
  dm:             { Icon: MessageCircle,     color: "var(--accent-green,    #3ba55d)" },
  thread_reply:   { Icon: MessageSquareText, color: "var(--accent-blue,     #4a9eff)" },
  channel_invite: { Icon: UserPlus,          color: "var(--accent-purple,   #9b59b6)" },
  task_update:    { Icon: Activity,          color: "var(--accent-yellow,   #f5a623)" },
  system:         { Icon: Info,              color: "var(--acs-text-divider)"          },
};

/* ── Group by date ── */
function groupByDate(list) {
  const today = new Date();
  const yest  = new Date(today); yest.setDate(today.getDate() - 1);
  const g = { Today: [], Yesterday: [], Earlier: [] };
  for (const n of list) {
    const d = n.createdAt ? new Date(n.createdAt) : null;
    if (!d)                                               g.Earlier.push(n);
    else if (d.toDateString() === today.toDateString())   g.Today.push(n);
    else if (d.toDateString() === yest.toDateString())    g.Yesterday.push(n);
    else                                                  g.Earlier.push(n);
  }
  return g;
}

/* ── Sub-components ── */

function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: STYLES }} />;
}

function ActivitySkeleton({ delay = 0 }) {
  return (
    <div style={{
      display:"flex", alignItems:"flex-start", gap:10,
      padding:"8px 10px",
      animation:`acs-fade-in 0.3s ease ${delay}ms both`,
    }}>
      <div className="acs-skel" style={{ width:32, height:32, borderRadius:10, flexShrink:0 }} />
      <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
        <div className="acs-skel" style={{ height:12, width:"75%", borderRadius:4 }} />
        <div className="acs-skel" style={{ height:10, width:"48%", borderRadius:4 }} />
      </div>
      <div className="acs-skel" style={{ width:26, height:10, borderRadius:4, flexShrink:0 }} />
    </div>
  );
}

function NotifIcon({ notification }) {
  const data  = normalizeNotification(notification);
  const entry = ICONS[notification.type] || ICONS.system;
  const { Icon, color } = entry;

  if (data?.senderName) {
    return (
      <div className="acs-icon-wrap">
        <Avatar member={{ name: data.senderName, avatar: data.senderAvatar }} size={32} />
        <div className="acs-type-badge">
          <Icon size={8} style={{ color }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="acs-icon-box"
      style={{ background:`color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <Icon size={15} style={{ color }} />
    </div>
  );
}

function NotifRow({ notification, isSelected, animDelay, onSelect, onKeyDown }) {
  const timeAgo = notification.createdAt
    ? formatDistanceToNowStrict(new Date(notification.createdAt), { addSuffix: true })
    : "";

  return (
    <button
      className={[
        "acs-row",
        isSelected           ? "is-active" : "",
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

      <div style={{ flex:1, minWidth:0 }}>
        <span className="acs-label">{getNotificationText(notification)}</span>
        {notification.body && <p className="acs-sublabel">{notification.body}</p>}
      </div>

      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
        {timeAgo && <span className="acs-time">{timeAgo}</span>}
        {!notification.isRead && <span className="acs-dot" />}
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

  const scrollRef = useRef(null);
  const [marking, setMarking] = useState(false);

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

  const groups = groupByDate(notifications);
  const flat   = [...groups.Today, ...groups.Yesterday, ...groups.Earlier];

  /* ── Header ── */
  const header = (
    <div>
      <div className="w-full flex items-center justify-between" style={{ minHeight:32 }}>
        <WorkspaceSwitcher />
      </div>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <div className="acs-header-icon">
            <Activity size={14} style={{ color:"white" }} />
          </div>
          <span style={{
            fontSize:13, fontWeight:700, letterSpacing:"-0.01em",
            color:"white",
          }}>
            Activity
          </span>
          {unreadCount > 0 && (
            <span className="acs-hbadge">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button className="acs-markbtn" onClick={handleMarkAll} disabled={marking}>
            {marking
              ? <div className="acs-spinner" style={{ width:12, height:12 }} />
              : <CheckCheck size={12} />
            }
            Mark all read
          </button>
        )}
      </div>
    </div>
  );

  return (
    <SidebarContainer header={header} aria-label="Activity notifications">
      <StyleInjector />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="acs-scroll"
        style={{ height:"100%", overflowY:"auto" }}
        role="listbox"
        aria-label="Activity notifications"
      >
        {/* Skeletons */}
        {isLoading && notifications.length === 0 && (
          <div style={{ padding:"6px 2px" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <ActivitySkeleton key={i} delay={i * 55} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && notifications.length === 0 && (
          <div className="acs-empty">
            <div className="acs-empty-ring">
              <Bell size={22} style={{ color:"var(--acs-text-bell)" }} />
            </div>
            <p style={{
              fontSize:13, fontWeight:700, margin:"0 0 6px",
              color:"var(--acs-text-title)",
            }}>
              All caught up
            </p>
            <p style={{
              fontSize:12, lineHeight:1.6, margin:0, maxWidth:195,
              color:"var(--acs-text-empty-sub)",
            }}>
              Mentions, replies, and reactions appear here in real-time.
            </p>
          </div>
        )}

        {/* Groups */}
        {notifications.length > 0 && (
          <div style={{ padding:"4px 2px 16px" }}>
            {Object.entries(groups).map(([label, items]) => {
              if (!items.length) return null;
              return (
                <div key={label}>
                  <div className="acs-divider">{label}</div>
                  {items.map(n => (
                    <NotifRow
                      key={n._id}
                      notification={n}
                      isSelected={n._id === selectedNotificationId}
                      animDelay={Math.min(flat.indexOf(n) * 32, 280)}
                      onSelect={handleSelect}
                      onKeyDown={e => {
                        if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(e, "next"); }
                        if (e.key === "ArrowUp")   { e.preventDefault(); moveFocus(e, "prev"); }
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {isLoading && notifications.length > 0 && (
          <div style={{
            display:"flex", justifyContent:"center", padding:12,
            animation:"acs-fade-in 0.2s ease both",
          }}>
            <div className="acs-spinner" style={{ width:16, height:16 }} />
          </div>
        )}
      </div>
    </SidebarContainer>
  );
}