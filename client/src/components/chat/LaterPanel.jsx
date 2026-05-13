import { useEffect, useState } from 'react';
import {
  Clock, Plus, Check, Archive, Loader2,
  ChevronRight, BookmarkCheck, Inbox, Trash2,
} from 'lucide-react';
import { useLaterStore } from '../../stores/laterStore';
import { Avatar } from '../chat/MemberAvatarGroup';
import { format, isToday, isYesterday, differenceInHours, isPast } from 'date-fns';
import ReminderModal from './ReminderModal';

/* ─────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'in_progress', label: 'In progress', icon: Clock },
  { id: 'archived',    label: 'Archived',    icon: Archive },
  { id: 'completed',   label: 'Completed',   icon: Check },
];

/* ─────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────── */
function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  if (isToday(d))     return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, h:mm a');
}

/* ─────────────────────────────────────────────────────────────────
   REMINDER PILL
───────────────────────────────────────────────────────────────── */
function ReminderPill({ reminderAt }) {
  const d       = new Date(reminderAt);
  const overdue = isPast(d);
  const soon    = !overdue && differenceInHours(d, new Date()) < 2;

  const styles = overdue
    ? { color: 'var(--accent-red,#e85c63)',    background: 'rgba(232,92,99,.10)',  border: '1px solid rgba(232,92,99,.28)' }
    : soon
    ? { color: 'var(--accent-yellow,#e8a63e)', background: 'rgba(232,166,62,.10)', border: '1px solid rgba(232,166,62,.28)' }
    : { color: 'var(--later-accent,#6e63e8)',  background: 'rgba(110,99,232,.10)', border: '1px solid rgba(110,99,232,.28)' };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
      ...styles,
    }}>
      <Clock size={10} />
      {overdue ? 'Overdue · ' : soon ? 'Soon · ' : ''}
      {format(d, 'MMM d, h:mm a')}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────
   ICON ACTION BUTTON — always visible, compact
───────────────────────────────────────────────────────────────── */
function ActionBtn({ icon: Icon, label, onClick, danger = false }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={label}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 7, padding: 0,
        flexShrink: 0, cursor: 'pointer',
        border: `1px solid ${
          hov
            ? danger ? 'rgba(232,92,99,.32)' : 'rgba(110,99,232,.32)'
            : 'var(--border-primary,rgba(0,0,0,.13))'
        }`,
        background: hov
          ? danger ? 'rgba(232,92,99,.12)' : 'rgba(110,99,232,.12)'
          : 'var(--surface-secondary,var(--bg-card))',
        color: hov
          ? danger ? 'var(--accent-red,#e85c63)' : 'var(--later-accent,#6e63e8)'
          : 'var(--text-muted)',
        transition: 'all 140ms ease',
      }}
    >
      <Icon size={13} />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
   SAVED MESSAGE CARD
───────────────────────────────────────────────────────────────── */
function SavedMessageCard({ saved, onJump, onStatusChange, onSetReminder, onDelete }) {
  const msg          = saved.messageId;
  const [hov, setHov] = useState(false);
  const isStandalone  = saved.type === 'standalone';
  const author        = msg?.senderSnapshot || msg?.authorId || {};
  const channel       = saved.channelId || {};
  const targetId      = isStandalone ? saved._id : msg?._id;

  /* Status actions — only show transitions that make sense */
  const statusActions = [
    saved.status !== 'completed'   && { icon: Check,   label: 'Mark complete',       status: 'completed'   },
    saved.status !== 'archived'    && { icon: Archive,  label: 'Archive',             status: 'archived'    },
    saved.status !== 'in_progress' && { icon: Clock,    label: 'Move to in progress', status: 'in_progress' },
  ].filter(Boolean);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => !isStandalone && onJump?.({ channelId: msg?.channelId, _id: msg?._id })}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 14px 10px',
        borderRadius: 14,
        border: `1px solid ${hov ? 'rgba(110,99,232,.35)' : 'var(--border-primary,var(--sidebar-border-color))'}`,
        background: hov
          ? 'var(--surface-hover,var(--bg-hover))'
          : 'var(--surface-secondary,var(--bg-card))',
        cursor: isStandalone ? 'default' : 'pointer',
        transition: 'all 180ms cubic-bezier(0.34,1.2,0.64,1)',
        transform: hov ? 'translateY(-1px) translateX(2px)' : 'none',
        boxShadow: hov ? '0 6px 24px rgba(110,99,232,.09)' : 'none',
        overflow: 'hidden',
      }}
    >
      {/* Left accent stripe */}
      <div style={{
        position: 'absolute', left: 0, top: '14%', bottom: '14%',
        width: 3, borderRadius: '0 3px 3px 0',
        background: 'var(--later-accent,#6e63e8)',
        opacity: hov ? 1 : 0,
        transform: hov ? 'scaleY(1)' : 'scaleY(0.3)',
        transition: 'all 220ms cubic-bezier(0.34,1.56,0.64,1)',
      }} />

      {/* ── Top row: avatar · meta · action buttons ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>

        {/* Avatar */}
        {!isStandalone && (
          <div style={{ flexShrink: 0, paddingTop: 1 }}>
            <Avatar
              member={{ name: author.name || 'Unknown', avatar: author.avatar }}
              size={34}
              showStatus={false}
            />
          </div>
        )}

        {/* Meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isStandalone ? (
            <div style={{
              borderLeft: '3px solid var(--later-accent,#6e63e8)',
              paddingLeft: 8, marginBottom: 4,
            }}>
              <h4 style={{
                margin: 0, fontWeight: 700, fontSize: 13.5,
                color: 'var(--sidebar-text,var(--text-primary))',
                letterSpacing: '-0.01em',
              }}>
                {saved.title || 'Untitled reminder'}
              </h4>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--sidebar-text,var(--text-primary))' }}>
                {author.name || 'Unknown'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--sidebar-text-dim,var(--text-muted))' }}>
                {formatTime(msg?.createdAt)}
              </span>
              {channel.name && (
                <span style={{
                  fontSize: 10.5, fontWeight: 600,
                  color: 'var(--later-accent,#6e63e8)',
                  background: 'rgba(110,99,232,.10)',
                  padding: '2px 7px', borderRadius: 999,
                }}>
                  #{channel.name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Always-visible action buttons ── */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Set reminder */}
          <ActionBtn
            icon={Clock}
            label="Set reminder"
            onClick={() => onSetReminder(saved)}
          />

          {/* Dynamic status transitions */}
          {statusActions.map(a => (
            <ActionBtn
              key={a.status}
              icon={a.icon}
              label={a.label}
              onClick={() => onStatusChange(targetId, a.status)}
            />
          ))}

          {/* Delete */}
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
        <p style={{
          fontSize: 12.5, lineHeight: 1.55, margin: '6px 0 6px 44px',
          color: 'var(--sidebar-text-dim,var(--text-secondary))',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {msg?.content || <em style={{ opacity: 0.5 }}>Attachment</em>}
        </p>
      )}

      {/* ── Standalone description ── */}
      {isStandalone && saved.reminderDescription && (
        <p style={{
          fontSize: 12, lineHeight: 1.55, margin: '2px 0 6px 11px',
          color: 'var(--sidebar-text-dim,var(--text-secondary))',
        }}>
          {saved.reminderDescription}
        </p>
      )}

      {/* ── Bottom row: reminder pill + jump CTA ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 6,
        paddingLeft: isStandalone ? 11 : 44,
        gap: 8,
      }}>
        <div>
          {saved.reminderAt && <ReminderPill reminderAt={saved.reminderAt} />}
        </div>

        {!isStandalone && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 11, fontWeight: 600,
            color: 'var(--later-accent,#6e63e8)',
            opacity: hov ? 1 : 0,
            transform: hov ? 'translateY(0)' : 'translateY(4px)',
            transition: 'all 160ms ease',
            whiteSpace: 'nowrap',
          }}>
            <ChevronRight size={11} />
            Jump to message
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   LATER PANEL (main export)
───────────────────────────────────────────────────────────────── */
export default function LaterPanel({ onJumpToMessage }) {
  const {
    savedMessages, loading, activeTab,
    fetchSavedMessages, updateStatus, deleteReminder, setActiveTab,
  } = useLaterStore();

  const [showReminderModal, setShowReminderModal]       = useState(false);
  const [selectedSaved, setSelectedSaved]               = useState(null);
  const [isStandaloneReminder, setIsStandaloneReminder] = useState(false);

  useEffect(() => {
    fetchSavedMessages(activeTab);
  }, [activeTab, fetchSavedMessages]);

  const handleSetReminder = saved => {
    setSelectedSaved(saved);
    setIsStandaloneReminder(false);
    setShowReminderModal(true);
  };

  const handleCreateStandalone = () => {
    setSelectedSaved(null);
    setIsStandaloneReminder(true);
    setShowReminderModal(true);
  };

  const filteredMessages = savedMessages.filter(m => m.status === activeTab);

  const emptyStates = {
    completed:   { title: 'All caught up!',    sub: 'Completed items will appear here.',       Icon: BookmarkCheck },
    archived:    { title: 'Nothing archived',  sub: 'Archive items to revisit them here.',     Icon: Archive       },
    in_progress: { title: 'Nothing saved yet', sub: 'Bookmark messages to review them later.', Icon: Inbox         },
  };
  const empty = emptyStates[activeTab];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--sidebar-bg-inner,var(--bg-sidebar))',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* ── Header ── */}
      <div style={{
        flexShrink: 0,
        padding: '16px 16px 0',
        borderBottom: '1px solid var(--sidebar-border-color,var(--border-primary))',
        background: 'var(--sidebar-bg-dark,var(--sidebar-bg))',
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(110,99,232,.14)',
              border: '1px solid rgba(110,99,232,.28)',
            }}>
              <Clock size={16} style={{ color: 'var(--later-accent,#6e63e8)' }} />
            </div>
            <h2 style={{
              margin: 0, fontSize: 15, fontWeight: 800,
              color: 'var(--sidebar-text,var(--text-white))',
              letterSpacing: '-0.02em',
            }}>
              Later
            </h2>
          </div>

          <button
            onClick={handleCreateStandalone}
            title="Create reminder"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8,
              border: '1px solid var(--sidebar-border-color,var(--border-primary))',
              background: 'transparent',
              color: 'var(--sidebar-text-dim,var(--text-muted))',
              cursor: 'pointer', transition: 'all 140ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--sidebar-icon-hover,var(--bg-hover))';
              e.currentTarget.style.color      = 'var(--sidebar-text,var(--text-white))';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color      = 'var(--sidebar-text-dim,var(--text-muted))';
            }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(tab => {
            const count    = savedMessages.filter(m => m.status === tab.id).length;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '8px 12px',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive
                    ? 'var(--later-accent,#6e63e8)'
                    : 'var(--sidebar-text-dim,var(--text-muted))',
                  borderBottom: `2px solid ${isActive ? 'var(--later-accent,#6e63e8)' : 'transparent'}`,
                  marginBottom: -1,
                  transition: 'color 160ms ease, border-color 160ms ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--sidebar-text,var(--text-primary))'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--sidebar-text-dim,var(--text-muted))'; }}
              >
                <tab.icon size={13} />
                {tab.label}
                {count > 0 && (
                  <span style={{
                    minWidth: 17, height: 17, padding: '0 4px',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 999,
                    background: isActive
                      ? 'var(--later-accent,#6e63e8)'
                      : 'color-mix(in srgb, var(--sidebar-text-dim,var(--text-muted)) 20%, transparent)',
                    color: isActive ? '#fff' : 'var(--sidebar-text-dim,var(--text-muted))',
                    fontSize: 10, fontWeight: 700, transition: 'all 160ms ease',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 16px' }}>
        {loading ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '56px 24px', gap: 10,
          }}>
            <Loader2
              size={28}
              style={{ color: 'var(--later-accent,#6e63e8)', animation: 'later-spin 700ms linear infinite' }}
            />
            <p style={{ fontSize: 12.5, color: 'var(--sidebar-text-dim,var(--text-muted))', margin: 0 }}>
              Loading…
            </p>
          </div>

        ) : filteredMessages.length === 0 ? (
          /* ── Empty state ── */
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '52px 24px', textAlign: 'center', gap: 10,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(110,99,232,.10)',
              border: '1px solid rgba(110,99,232,.22)',
              marginBottom: 4,
            }}>
              <empty.Icon size={26} style={{ color: 'var(--later-accent,#6e63e8)' }} />
            </div>
            <h3 style={{
              margin: 0, fontSize: 14, fontWeight: 700,
              color: 'var(--sidebar-text,var(--text-white))',
              letterSpacing: '-0.01em',
            }}>
              {empty.title}
            </h3>
            <p style={{
              margin: 0, fontSize: 12.5,
              color: 'var(--sidebar-text-dim,var(--text-muted))',
              lineHeight: 1.6, maxWidth: 210,
            }}>
              {empty.sub}
            </p>
            {activeTab === 'in_progress' && (
              <button
                onClick={handleCreateStandalone}
                style={{
                  marginTop: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 9,
                  border: 'none',
                  background: 'var(--later-accent,#6e63e8)', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  boxShadow: '0 2px 12px rgba(110,99,232,.30)',
                  transition: 'filter 140ms ease, transform 140ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'none';            e.currentTarget.style.transform = 'none'; }}
              >
                <Plus size={14} /> Create Reminder
              </button>
            )}
          </div>

        ) : (
          /* ── Card list ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredMessages.map((saved, i) => (
              <div
                key={saved._id}
                style={{ animation: `later-card-in 280ms ${i * 45}ms ease both` }}
              >
                <SavedMessageCard
                  saved={saved}
                  onJump={onJumpToMessage}
                  onStatusChange={updateStatus}
                  onSetReminder={handleSetReminder}
                  onDelete={deleteReminder}
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

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes later-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes later-card-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}