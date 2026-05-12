import { useEffect, useState } from 'react';
import { Clock, Plus, Filter, Check, Archive, Loader2, ChevronRight, MoreVertical, BookmarkCheck, Inbox } from 'lucide-react';
import { useLaterStore } from '../../stores/laterStore';
import { Avatar } from '../chat/MemberAvatarGroup';
import { format, isToday, isYesterday, differenceInHours, isPast } from 'date-fns';
import ReminderModal from './ReminderModal';
import toast from 'react-hot-toast';

const TABS = [
  { id: 'in_progress', label: 'In progress', icon: Clock },
  { id: 'archived',    label: 'Archived',    icon: Archive },
  { id: 'completed',   label: 'Completed',   icon: Check },
];

function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  if (isToday(d))     return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, h:mm a');
}

function ReminderPill({ reminderAt }) {
  const d = new Date(reminderAt);
  const overdue = isPast(d);
  const soon    = !overdue && differenceInHours(d, new Date()) < 2;

  const color = overdue ? 'var(--accent-red)' : soon ? 'var(--accent-yellow)' : 'var(--accent-primary)';
  const bg    = overdue
    ? 'color-mix(in srgb, var(--accent-red) 12%, transparent)'
    : soon
    ? 'color-mix(in srgb, var(--accent-yellow) 12%, transparent)'
    : 'color-mix(in srgb, var(--accent-primary) 10%, transparent)';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        color,
        background: bg,
        border: `1px solid ${color}`,
        opacity: 0.9,
      }}
    >
      <Clock size={10} />
      {overdue ? 'Overdue · ' : soon ? 'Soon · ' : ''}
      {format(d, 'MMM d, h:mm a')}
    </span>
  );
}

function SavedMessageCard({ saved, onJump, onStatusChange, onSetReminder, onDelete }) {
  const msg = saved.messageId;
  const [showMenu, setShowMenu] = useState(false);
  const [hovered, setHovered]   = useState(false);

  const isStandalone = saved.type === 'standalone';
  const author  = msg?.senderSnapshot || msg?.authorId || {};
  const channel = saved.channelId || {};

  return (
    <div
      className="saved-card"
      style={{
        position: 'relative',
        display: 'flex',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 14,
        border: `1px solid ${hovered ? 'var(--accent-primary)' : 'var(--sidebar-border-color, var(--border-primary))'}`,
        background: hovered
          ? 'var(--sidebar-icon-hover, var(--surface-hover))'
          : 'var(--sidebar-bg-inner, var(--surface-secondary))',
        cursor: 'pointer',
        transition: 'all 160ms cubic-bezier(0.34,1.2,0.64,1)',
        transform: hovered ? 'translateY(-1px) translateX(2px)' : 'none',
        boxShadow: hovered
          ? '0 6px 20px color-mix(in srgb, var(--accent-primary) 12%, transparent)'
          : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !isStandalone && onJump?.({ channelId: msg.channelId, _id: msg._id })}
    >
      {/* Left accent stripe */}
      <div style={{
        position: 'absolute',
        left: 0, top: '15%', bottom: '15%',
        width: 3,
        borderRadius: '0 3px 3px 0',
        background: 'var(--accent-primary)',
        opacity: hovered ? 1 : 0,
        transform: hovered ? 'scaleY(1)' : 'scaleY(0.3)',
        transition: 'all 220ms cubic-bezier(0.34,1.56,0.64,1)',
      }} />

      {!isStandalone && <Avatar member={{ name: author.name || 'Unknown', avatar: author.avatar }} size={34} showStatus={false} />}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Meta row */}
        {isStandalone ? (
          <div style={{ marginBottom: 6 }}>
            <h4 style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--sidebar-text, var(--text-white))' }}>
              {saved.title || 'Untitled reminder'}
            </h4>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--sidebar-text, var(--text-white))' }}>
              {author.name || 'Unknown'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--sidebar-text-dim, var(--text-muted))' }}>
              {formatTime(msg.createdAt)}
            </span>
            {channel.name && (
              <span style={{
                fontSize: 11, color: 'var(--accent-primary)',
                background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                padding: '1px 7px', borderRadius: 999, fontWeight: 600,
              }}>
                #{channel.name}
              </span>
            )}
          </div>
        )}

        {/* Message preview */}
        {!isStandalone && (
          <p style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--sidebar-text-dim, var(--text-secondary))',
            margin: '0 0 6px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {msg.content || <em style={{ opacity: 0.5 }}>Attachment</em>}
          </p>
        )}

        {/* Description for standalone */}
        {isStandalone && saved.reminderDescription && (
          <p style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--sidebar-text-dim, var(--text-muted))',
            margin: '0 0 6px',
          }}>
            {saved.reminderDescription}
          </p>
        )}

        {/* Reminder pill */}
        {saved.reminderAt && <ReminderPill reminderAt={saved.reminderAt} />}

        {/* Jump CTA */}
        {!isStandalone && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, marginTop: 6,
            fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)',
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translateY(0)' : 'translateY(4px)',
            transition: 'all 160ms ease',
          }}>
            <ChevronRight size={12} />
            Jump to message
          </div>
        )}
      </div>

      {/* Actions menu */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 7,
            border: 'none', background: 'transparent',
            color: 'var(--sidebar-text-dim, var(--text-muted))',
            cursor: 'pointer',
            opacity: hovered || showMenu ? 1 : 0,
            transition: 'opacity 160ms ease',
          }}
        >
          <MoreVertical size={15} />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div style={{
              position: 'absolute', right: 0, top: 32, zIndex: 20,
              width: 190,
              background: 'var(--surface-primary, var(--bg-modal))',
              border: '1px solid var(--border-primary)',
              borderRadius: 12,
              boxShadow: 'var(--shadow-modal)',
              padding: '4px 0',
              overflow: 'hidden',
            }}>
              {[
                { label: 'Set reminder',       icon: Clock,    action: () => { onSetReminder(saved); setShowMenu(false); }, show: true },
                { label: 'Mark complete',      icon: Check,    action: () => { onStatusChange(isStandalone ? saved._id : msg._id, 'completed'); setShowMenu(false); }, show: saved.status !== 'completed' },
                { label: 'Archive',            icon: Archive,  action: () => { onStatusChange(isStandalone ? saved._id : msg._id, 'archived'); setShowMenu(false); },  show: saved.status !== 'archived' },
                { label: 'Move to in progress',icon: Clock,    action: () => { onStatusChange(isStandalone ? saved._id : msg._id, 'in_progress'); setShowMenu(false); }, show: saved.status !== 'in_progress' },
                { label: 'Delete',             icon: Archive,  action: () => { onDelete(saved._id); setShowMenu(false); }, show: true },
              ].filter(i => i.show).map((item) => (
                <button
                  key={item.label}
                  onClick={(e) => { e.stopPropagation(); item.action(); }}
                  style={{
                    width: '100%', padding: '9px 14px',
                    display: 'flex', alignItems: 'center', gap: 9,
                    background: 'transparent', border: 'none',
                    color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
                    textAlign: 'left', fontFamily: 'inherit',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <item.icon size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LaterPanel({ onJumpToMessage }) {
  const { savedMessages, loading, activeTab, fetchSavedMessages, updateStatus, deleteReminder, setActiveTab } = useLaterStore();
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedSaved, setSelectedSaved]         = useState(null);
  const [isStandaloneReminder, setIsStandaloneReminder] = useState(false);

  useEffect(() => {
    fetchSavedMessages(activeTab);
  }, [activeTab, fetchSavedMessages]);

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

  const emptyMessages = {
    completed: { title: 'All caught up!', sub: 'Completed items will appear here.' },
    archived:  { title: 'Nothing archived', sub: 'Archive items to revisit them here.' },
    in_progress: { title: 'Nothing saved yet', sub: 'Bookmark messages to review them later.' },
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--sidebar-bg-inner, var(--bg-sidebar))',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* ── Header ── */}
      <div style={{
        flexShrink: 0,
        padding: '16px 16px 0',
        borderBottom: '1px solid var(--sidebar-border-color, var(--border-primary))',
        background: 'var(--sidebar-bg-dark, var(--sidebar-bg))',
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)',
            }}>
              <Clock size={16} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <h2 style={{
              margin: 0, fontSize: 15, fontWeight: 800,
              color: 'var(--sidebar-text, var(--text-white))',
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
              border: '1px solid var(--sidebar-border-color, var(--border-primary))',
              background: 'transparent',
              color: 'var(--sidebar-text-dim, var(--text-muted))',
              cursor: 'pointer',
              transition: 'all 140ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--sidebar-icon-hover, var(--bg-hover))';
              e.currentTarget.style.color = 'var(--sidebar-text, var(--text-white))';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--sidebar-text-dim, var(--text-muted))';
            }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, position: 'relative' }}>
          {TABS.map((tab) => {
            const count   = savedMessages.filter((m) => m.status === tab.id).length;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '8px 12px',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', position: 'relative',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13, fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--accent-primary)' : 'var(--sidebar-text-dim, var(--text-muted))',
                  transition: 'color 160ms ease',
                  borderBottom: `2px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`,
                  marginBottom: -1,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--sidebar-text, var(--text-primary))'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--sidebar-text-dim, var(--text-muted))'; }}
              >
                <tab.icon size={13} />
                {tab.label}
                {count > 0 && (
                  <span style={{
                    minWidth: 17, height: 17, padding: '0 4px',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 999,
                    background: isActive ? 'var(--accent-primary)' : 'color-mix(in srgb, var(--sidebar-text-dim, var(--text-muted)) 20%, transparent)',
                    color: isActive ? '#fff' : 'var(--sidebar-text-dim, var(--text-muted))',
                    fontSize: 10, fontWeight: 700,
                    transition: 'all 160ms ease',
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px', gap: 10 }}>
            <Loader2 size={28} style={{ color: 'var(--accent-primary)', animation: 'spin 700ms linear infinite' }} />
            <p style={{ fontSize: 12.5, color: 'var(--sidebar-text-dim, var(--text-muted))', margin: 0 }}>Loading…</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          /* Empty state */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '52px 24px', textAlign: 'center', gap: 10 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
              marginBottom: 4,
            }}>
              {activeTab === 'completed'
                ? <BookmarkCheck size={26} style={{ color: 'var(--accent-primary)' }} />
                : activeTab === 'archived'
                ? <Archive size={26} style={{ color: 'var(--accent-primary)' }} />
                : <Inbox size={26} style={{ color: 'var(--accent-primary)' }} />
              }
            </div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sidebar-text, var(--text-white))', letterSpacing: '-0.01em' }}>
              {emptyMessages[activeTab]?.title}
            </h3>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--sidebar-text-dim, var(--text-muted))', lineHeight: 1.6, maxWidth: 210 }}>
              {emptyMessages[activeTab]?.sub}
            </p>
            {activeTab === 'in_progress' && (
              <button
                onClick={handleCreateStandalone}
                style={{
                  marginTop: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 9,
                  border: 'none',
                  background: 'var(--accent-primary)', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  boxShadow: '0 2px 10px color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                  transition: 'filter 140ms ease, transform 140ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none'; }}
              >
                <Plus size={14} /> Create Reminder
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredMessages.map((saved, i) => (
              <div key={saved._id} style={{ animation: `atp-card-in 280ms ${i * 40}ms ease both` }}>
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
          onClose={() => { setShowReminderModal(false); setSelectedSaved(null); setIsStandaloneReminder(false); }}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes atp-card-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}