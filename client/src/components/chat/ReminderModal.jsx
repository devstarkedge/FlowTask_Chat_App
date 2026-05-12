import { useState } from 'react';
import {
  X, Clock, Calendar, Bold, Italic, Underline,
  Strikethrough, Link as LinkIcon, List, Code, Zap,
} from 'lucide-react';
import { useLaterStore } from '../../stores/laterStore';
import toast from 'react-hot-toast';

const QUICK_OPTIONS = [
  { label: '20 min',    minutes: 20 },
  { label: '1 hour',   minutes: 60 },
  { label: '3 hours',  minutes: 180 },
  {
    label: 'Tomorrow 9 AM',
    custom: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'Next week',
    custom: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

export default function ReminderModal({ saved, onClose, isStandalone = false }) {
  const { updateReminder, createStandaloneReminder } = useLaterStore();

  const [title, setTitle]               = useState(saved?.title || '');
  const [date, setDate]                 = useState(saved?.reminderAt ? new Date(saved.reminderAt).toISOString().split('T')[0] : '');
  const [time, setTime]                 = useState(saved?.reminderAt ? new Date(saved.reminderAt).toTimeString().slice(0, 5) : '');
  const [description, setDescription]   = useState(saved?.reminderDescription || '');
  const [saving, setSaving]             = useState(false);
  const [activeQuick, setActiveQuick]   = useState(null);

  const handleQuickSelect = (option, idx) => {
    let target;
    if (option.custom) {
      target = option.custom();
    } else {
      target = new Date();
      target.setMinutes(target.getMinutes() + option.minutes);
    }
    setDate(target.toISOString().split('T')[0]);
    setTime(target.toTimeString().slice(0, 5));
    setActiveQuick(idx);
  };

  const handleSave = async () => {
    if (!date || !time) {
      toast.error('Please select date and time');
      return;
    }

    if (isStandalone && !title?.trim()) {
      toast.error('Please enter a title');
      return;
    }
    
    if (!isStandalone && !saved?.messageId?._id && !saved?._id) {
      toast.error('No message selected for reminder');
      return;
    }

    setSaving(true);
    try {
      const reminderAt = new Date(`${date}T${time}`);
      
      if (isNaN(reminderAt.getTime())) {
        toast.error('Invalid date/time');
        setSaving(false);
        return;
      }

      if (isStandalone) {
        await createStandaloneReminder({
          title: title.trim(),
          reminderAt: reminderAt.toISOString(),
          reminderDescription: description,
        });
      } else {
        // Use saved._id for standalone reminders, messageId._id for saved messages
        const id = saved.type === 'standalone' ? saved._id : saved.messageId._id;
        await updateReminder(id, {
          reminderAt: reminderAt.toISOString(),
          reminderDescription: description,
        });
      }
      onClose();
    } catch (error) {
      console.error('Reminder save error:', error);
      setSaving(false);
    }
  };

  /* ── Shared input style ── */
  const inputStyle = {
    width: '100%',
    padding: '9px 12px 9px 38px',
    borderRadius: 9,
    border: '1px solid var(--border-primary)',
    background: 'var(--surface-secondary, var(--bg-secondary))',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    transition: 'border-color 160ms ease, box-shadow 160ms ease, background 140ms ease',
    boxSizing: 'border-box',
  };

  const focusInput = (e) => {
    e.target.style.borderColor = 'var(--accent-primary)';
    e.target.style.boxShadow   = '0 0 0 3px color-mix(in srgb, var(--accent-primary) 14%, transparent)';
    e.target.style.background  = 'var(--surface-primary, var(--bg-primary))';
  };
  const blurInput = (e) => {
    e.target.style.borderColor = 'var(--border-primary)';
    e.target.style.boxShadow   = 'none';
    e.target.style.background  = 'var(--surface-secondary, var(--bg-secondary))';
  };

  const toolbarBtns = [
    { icon: Bold,          title: 'Bold' },
    { icon: Italic,        title: 'Italic' },
    { icon: Underline,     title: 'Underline' },
    { icon: Strikethrough, title: 'Strikethrough' },
    null, // divider
    { icon: LinkIcon,      title: 'Link' },
    { icon: List,          title: 'List' },
    { icon: Code,          title: 'Code' },
  ];

  return (
    /* Backdrop */
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--overlay-bg, rgba(0,0,0,0.55))',
        backdropFilter: 'blur(6px)',
        animation: 'rm-fade-in 150ms ease',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card */}
      <div style={{
        width: '100%', maxWidth: 440,
        borderRadius: 18,
        background: 'var(--surface-primary, var(--bg-modal))',
        border: '1px solid var(--border-primary)',
        boxShadow: 'var(--shadow-modal)',
        overflow: 'hidden',
        animation: 'rm-scale-in 200ms cubic-bezier(0.34,1.56,0.64,1)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px',
          borderBottom: '1px solid var(--border-primary)',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 8%, var(--surface-primary, var(--bg-modal))), var(--surface-primary, var(--bg-modal)))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, var(--accent-primary) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 24%, transparent)',
            }}>
              <Clock size={16} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 1 }}>
                Reminder
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-white, var(--text-primary))', letterSpacing: '-0.02em' }}>
                Set a reminder
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 7,
              border: 'none', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer',
              transition: 'background 130ms ease, color 130ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '18px 18px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Title (standalone only) */}
          {isStandalone && (
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '-0.01em' }}>
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What do you need to remember?"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 9,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--surface-secondary, var(--bg-secondary))',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontFamily: 'var(--font-sans)',
                  outline: 'none',
                  transition: 'border-color 160ms ease, box-shadow 160ms ease',
                  boxSizing: 'border-box',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'var(--accent-primary)';
                  e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent-primary) 14%, transparent)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'var(--border-primary)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
          )}

          {/* Quick options */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Zap size={12} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                Quick select
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_OPTIONS.map((opt, i) => {
                const active = activeQuick === i;
                return (
                  <button
                    key={opt.label}
                    onClick={() => handleQuickSelect(opt, i)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      background: active
                        ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)'
                        : 'transparent',
                      color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                      fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      transition: 'all 160ms cubic-bezier(0.34,1.2,0.64,1)',
                    }}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.background = 'var(--surface-hover, var(--bg-hover))';
                        e.currentTarget.style.color      = 'var(--text-primary)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color      = 'var(--text-muted)';
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date + Time row */}
          <div style={{ display: 'flex', gap: 10 }}>
            {/* Date */}
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '-0.01em' }}>
                Date
              </label>
              <div style={{ position: 'relative' }}>
                <Calendar size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  type="date"
                  value={date}
                  onChange={e => { setDate(e.target.value); setActiveQuick(null); }}
                  style={inputStyle}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </div>
            </div>

            {/* Time */}
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '-0.01em' }}>
                Time
              </label>
              <div style={{ position: 'relative' }}>
                <Clock size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  type="time"
                  value={time}
                  onChange={e => { setTime(e.target.value); setActiveQuick(null); }}
                  style={inputStyle}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '-0.01em' }}>
              Note <span style={{ fontWeight: 400, opacity: 0.55 }}>(optional)</span>
            </label>
            <div style={{
              borderRadius: 10,
              border: '1px solid var(--border-primary)',
              overflow: 'hidden',
              transition: 'border-color 160ms ease',
            }}
              onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
              onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border-primary)'}
            >
              {/* Toolbar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 1, padding: '5px 8px',
                borderBottom: '1px solid var(--border-primary)',
                background: 'var(--surface-secondary, var(--bg-secondary))',
              }}>
                {toolbarBtns.map((btn, i) =>
                  btn === null ? (
                    <div key={i} style={{ width: 1, height: 14, background: 'var(--border-primary)', margin: '0 4px' }} />
                  ) : (
                    <button
                      key={btn.title}
                      title={btn.title}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 26, height: 26, borderRadius: 5,
                        border: 'none', background: 'transparent',
                        color: 'var(--text-muted)', cursor: 'pointer',
                        transition: 'background 120ms ease, color 120ms ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      <btn.icon size={13} />
                    </button>
                  )
                )}
              </div>

              {/* Textarea */}
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Remind me to…"
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'var(--surface-primary, var(--bg-primary))',
                  border: 'none', outline: 'none', resize: 'none',
                  color: 'var(--text-primary)', fontSize: 13,
                  fontFamily: 'var(--font-sans)', lineHeight: 1.55,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          padding: '14px 18px',
          borderTop: '1px solid var(--border-primary)',
          marginTop: 18,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 9,
              border: '1px solid var(--border-primary)',
              background: 'transparent', color: 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'background 130ms ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !date || !time}
            style={{
              padding: '8px 20px', borderRadius: 9, border: 'none',
              background: (!date || !time || saving) ? 'color-mix(in srgb, var(--accent-primary) 50%, transparent)' : 'var(--accent-primary)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: (!date || !time || saving) ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)',
              boxShadow: '0 2px 8px color-mix(in srgb, var(--accent-primary) 28%, transparent)',
              transition: 'filter 140ms ease, transform 140ms ease',
              opacity: (!date || !time || saving) ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (date && time && !saving) { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none'; }}
          >
            {saving ? 'Saving…' : 'Save reminder'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes rm-fade-in  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rm-scale-in {
          from { opacity: 0; transform: scale(0.94) translateY(10px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator {
          filter: opacity(0.5);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}