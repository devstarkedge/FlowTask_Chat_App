import React, { useEffect, useState } from 'react';
import { Clock, Calendar, Zap, Repeat, MoreHorizontal, BellOff } from 'lucide-react';
import { useLaterStore } from '../../stores/laterStore';
import toast from 'react-hot-toast';

export default function ReminderCenter() {
  const fetchSaved = useLaterStore((s) => s.fetchSavedMessages);
  const savedMessages = useLaterStore((s) => s.savedMessages || []);
  const snoozeReminder = useLaterStore((s) => s.snoozeReminder);
  const updateReminder = useLaterStore((s) => s.updateReminder);
  const updateStatus = useLaterStore((s) => s.updateStatus);

  const [view, setView] = useState('today');

  useEffect(() => {
    fetchSaved().catch(() => {});
  }, [fetchSaved]);

  const now = new Date();

  const lists = {
    today: savedMessages.filter(m => m.reminderAt && new Date(m.reminderAt).toDateString() === new Date().toDateString() && m.status === 'in_progress'),
    upcoming: savedMessages.filter(m => m.reminderAt && new Date(m.reminderAt) > new Date() && m.status === 'in_progress'),
    overdue: savedMessages.filter(m => m.reminderAt && new Date(m.reminderAt) <= new Date() && m.status === 'in_progress'),
    completed: savedMessages.filter(m => m.status === 'completed'),
    recurring: savedMessages.filter(m => (m.recurrence && m.recurrence !== 'none') || m.recurrenceRule, )
  };

  const quickSnooze = async (item, label) => {
    // label: '15m','1h','2h','tomorrow9'
    let until = new Date();
    switch(label) {
      case '15m': until = new Date(Date.now() + 15*60*1000); break;
      case '1h': until = new Date(Date.now() + 60*60*1000); break;
      case '2h': until = new Date(Date.now() + 2*60*60*1000); break;
      case 'tomorrow9': {
        const t = new Date(); t.setDate(t.getDate()+1); t.setHours(9,0,0,0); until = t;
        break;
      }
      default: until = new Date(Date.now() + 60*60*1000);
    }
    try {
      await snoozeReminder(item._id || item.messageId?._id, until.toISOString());
      toast.success('Snoozed');
    } catch (err) {
      toast.error('Failed to snooze');
    }
  };

  const markComplete = async (item) => {
    try {
      await updateStatus(item._id || item.messageId?._id, 'completed');
      toast.success('Marked complete');
    } catch (err) {
      toast.error('Failed to mark complete');
    }
  };

  const dismiss = async (item) => {
    try {
      await updateStatus(item._id || item.messageId?._id, 'dismissed');
      toast('Dismissed');
    } catch (err) {
      toast.error('Failed to dismiss');
    }
  };

  const reschedule = async (item) => {
    const input = prompt('Enter new date/time (ISO or natural language)');
    if (!input) return;
    const date = new Date(input);
    if (isNaN(date.getTime())) return toast.error('Invalid date');
    try {
      await updateReminder(item._id || item.messageId?._id, { reminderAt: date.toISOString() });
      toast.success('Rescheduled');
    } catch (err) {
      toast.error('Failed to reschedule');
    }
  };

  const renderCard = (item) => (
    <div key={item._id} className="saved-card">
      <div className="saved-card__meta">
        <div className="saved-card__title">{item.title || item.reminderDescription || 'Reminder'}</div>
        <div className="saved-card__when">{item.reminderAt ? new Date(item.reminderAt).toLocaleString() : 'No time'}</div>
      </div>
      <div className="saved-card__actions">
        <button onClick={() => quickSnooze(item, '15m')} title="Snooze 15m">15m</button>
        <button onClick={() => quickSnooze(item, '1h')} title="Snooze 1h">1h</button>
        <button onClick={() => quickSnooze(item, 'tomorrow9')} title="Snooze until tomorrow 9am">Tomorrow</button>
        <button onClick={() => reschedule(item)} title="Reschedule">Reschedule</button>
        <button onClick={() => markComplete(item)} title="Mark complete">Done</button>
        <button onClick={() => dismiss(item)} title="Dismiss">Dismiss</button>
      </div>
    </div>
  );

  return (
    <div className="reminder-center">
      <div className="reminder-center__tabs">
        <button className={view==='today'? 'active':''} onClick={() => setView('today')}><Clock size={14}/> Today</button>
        <button className={view==='upcoming'? 'active':''} onClick={() => setView('upcoming')}><Calendar size={14}/> Upcoming</button>
        <button className={view==='overdue'? 'active':''} onClick={() => setView('overdue')}><Zap size={14}/> Overdue</button>
        <button className={view==='completed'? 'active':''} onClick={() => setView('completed')}><MoreHorizontal size={14}/> Completed</button>
        <button className={view==='recurring'? 'active':''} onClick={() => setView('recurring')}><Repeat size={14}/> Recurring</button>
      </div>

      <div className="reminder-center__list">
        {lists[view] && lists[view].length > 0 ? lists[view].map(renderCard) : (
          <div className="empty-state">No reminders in this view</div>
        )}
      </div>
    </div>
  );
}
