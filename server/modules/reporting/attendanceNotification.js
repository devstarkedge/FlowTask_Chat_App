export function isAttendanceNotificationEvent(eventType) {
  return eventType === 'attendance.checked_in' || eventType === 'attendance.checked_out';
}
