/**
 * Shared date formatting utilities used across all screens.
 * Eliminates duplication of formatDate across ThreadsScreen,
 * LaterScreen, DraftsScreen, ScheduledScreen, and FilesScreen.
 */

import { usePreferencesStore } from '../stores/preferencesStore';

/**
 * Format a date/timestamp as a relative time string (e.g., "5m ago", "2h ago", "3d ago").
 * Falls back to locale date string for dates older than 7 days.
 *
 * @param {string|number|Date} value - Date string, timestamp, or Date object
 * @returns {string} Formatted relative time string
 */
export const formatRelativeTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';

  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

export const formatRelativeTimeLong = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';

  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
};

/**
 * Format a date for scheduled message display (e.g., "Today at 3:00 PM", "Tomorrow at 9:30 AM").
 *
 * @param {string|number|Date} value - Date string, timestamp, or Date object
 * @returns {string} Formatted scheduled date string
 */
export const formatScheduledDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const { time24Hour } = usePreferencesStore.getState();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !time24Hour,
  });

  if (isToday) return `Today at ${timeStr}`;
  if (isTomorrow) return `Tomorrow at ${timeStr}`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: !time24Hour,
  });
};

/**
 * Format a date for locale display.
 *
 * @param {string|number|Date} value - Date string, timestamp, or Date object
 * @returns {string} Formatted locale date string
 */
export const formatLocaleDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleString();
};

/**
 * Format time for message timestamps (e.g., "3:45 PM").
 *
 * @param {string|number|Date} value - Date string, timestamp, or Date object
 * @returns {string} Formatted time string
 */
export const formatMessageTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const { time24Hour } = usePreferencesStore.getState();
  return date.toLocaleTimeString([], { hour: time24Hour ? '2-digit' : 'numeric', minute: '2-digit', hour12: !time24Hour });
};

export const formatTime = formatMessageTime;

export const isSameDay = (d1, d2) => {
  const a = new Date(d1);
  const b = new Date(d2);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};
