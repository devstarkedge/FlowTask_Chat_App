/**
 * Application-wide constants.
 * Single source of truth for enums, event names, limits, and defaults.
 */

// ─── FlowTask Domain Events ─────────────────────────────────────────────────
// Browser API headers that must be accepted by the CORS preflight. Keep this
// list in sync with client/src/services/api.js request interceptors and auth.
export const CORS_ALLOWED_HEADERS = Object.freeze([
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'X-Workspace-Id',
  'X-FlowTask-Token',
  'X-Auth-Attempt-Id',
  'X-Request-Id',
]);

export const FLOWTASK_EVENTS = Object.freeze({
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',
  PROJECT_MEMBER_ASSIGNED: 'PROJECT_MEMBER_ASSIGNED',
  PROJECT_MEMBER_ADDED: 'PROJECT_MEMBER_ADDED',
  PROJECT_MEMBER_REMOVED: 'PROJECT_MEMBER_REMOVED',
  PROJECT_MEMBERSHIP_SYNCED: 'PROJECT_MEMBERSHIP_SYNCED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_DELETED: 'TASK_DELETED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_UNASSIGNED: 'TASK_UNASSIGNED',
  TASK_COMMENTED: 'TASK_COMMENTED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  TASK_DUE_DATE_CHANGED: 'TASK_DUE_DATE_CHANGED',
  TIME_ENTRY_ADDED: 'TIME_ENTRY_ADDED',
  TIME_ENTRY_UPDATED: 'TIME_ENTRY_UPDATED',
  TIME_ENTRY_DELETED: 'TIME_ENTRY_DELETED',
  LOGGED_TIME_ADDED: 'LOGGED_TIME_ADDED',
  LOGGED_TIME_UPDATED: 'LOGGED_TIME_UPDATED',
  LOGGED_TIME_DELETED: 'LOGGED_TIME_DELETED',
  ESTIMATED_TIME_ADDED: 'ESTIMATED_TIME_ADDED',
  ESTIMATED_TIME_UPDATED: 'ESTIMATED_TIME_UPDATED',
  ESTIMATED_TIME_DELETED: 'ESTIMATED_TIME_DELETED',
  BILLED_TIME_ADDED: 'BILLED_TIME_ADDED',
  BILLED_TIME_UPDATED: 'BILLED_TIME_UPDATED',
  BILLED_TIME_DELETED: 'BILLED_TIME_DELETED',
  USER_REGISTERED: 'USER_REGISTERED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_VERIFIED: 'USER_VERIFIED',
  ANNOUNCEMENT_CREATED: 'ANNOUNCEMENT_CREATED',
  ANNOUNCEMENT_DELETED: 'ANNOUNCEMENT_DELETED',
  ANNOUNCEMENT_UPDATED: 'ANNOUNCEMENT_UPDATED',
  DEPARTMENT_CREATED: 'DEPARTMENT_CREATED',
  DEPARTMENT_UPDATED: 'DEPARTMENT_UPDATED',
  DEPARTMENT_DELETED: 'DEPARTMENT_DELETED',
  DEPARTMENT_MEMBER_ADDED: 'DEPARTMENT_MEMBER_ADDED',
  DEPARTMENT_MEMBER_REMOVED: 'DEPARTMENT_MEMBER_REMOVED',
  TEAM_CREATED: 'TEAM_CREATED',
  TEAM_UPDATED: 'TEAM_UPDATED',
  TEAM_DELETED: 'TEAM_DELETED',
  TEAM_MEMBER_ADDED: 'TEAM_MEMBER_ADDED',
  TEAM_MEMBER_REMOVED: 'TEAM_MEMBER_REMOVED',
  COMMENT_UPDATED: 'COMMENT_UPDATED',
  COMMENT_DELETED: 'COMMENT_DELETED',
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED',
  ATTACHMENT_DELETED: 'ATTACHMENT_DELETED',
  SUBTASK_CREATED: 'SUBTASK_CREATED',
  SUBTASK_UPDATED: 'SUBTASK_UPDATED',
  SUBTASK_COMPLETED: 'SUBTASK_COMPLETED',
  SUBTASK_DELETED: 'SUBTASK_DELETED',
  NANO_CREATED: 'NANO_CREATED',
  NANO_COMPLETED: 'NANO_COMPLETED',
  NANO_DELETED: 'NANO_DELETED',
  SUBTASK_ASSIGNED: 'SUBTASK_ASSIGNED',
  NANO_ASSIGNED: 'NANO_ASSIGNED',
});

// ─── Channel Types ───────────────────────────────────────────────────────────
export const CHANNEL_TYPES = Object.freeze({
  PROJECT: 'project',
  DEPARTMENT: 'department',
  TEAM: 'team',
  DM: 'dm',
  SYSTEM: 'system',
  PUBLIC: 'public',
  PRIVATE: 'private',
});

// ─── Channel Visibility ──────────────────────────────────────────────────────
export const CHANNEL_VISIBILITY = Object.freeze({
  PUBLIC: 'public',
  PRIVATE: 'private',
});

// ─── Channel Member Roles ────────────────────────────────────────────────────
export const CHANNEL_MEMBER_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
});

export const MESSAGE_CONTENT_TYPES = Object.freeze({
  TEXT: 'text',
  SYSTEM: 'system',
  BOT: 'bot',
  FILE: 'file',
  GIF: 'gif',
  TASK_UPDATE: 'task_update',
  ACTIVITY: 'activity',
});

// ─── Attachment Sources ──────────────────────────────────────────────────────
export const ATTACHMENT_SOURCES = Object.freeze({
  CHAT_UPLOAD: 'chat_upload',
  FLOWTASK_LINK: 'flowtask_link',
});

// ─── FlowTask Ref Entity Types ───────────────────────────────────────────────
export const FLOWTASK_REF_TYPES = Object.freeze({
  BOARD: 'board',
  DEPARTMENT: 'department',
  TEAM: 'team',
  CARD: 'card',
  COMMENT: 'comment',
  ANNOUNCEMENT: 'announcement',
});

// ─── Mention Types ───────────────────────────────────────────────────────────
export const MENTION_TYPES = Object.freeze({
  USER: 'user',
  ROLE: 'role',
  TEAM: 'team',
  CHANNEL: 'channel',
});

// ─── Processed Event Statuses ────────────────────────────────────────────────
export const EVENT_STATUS = Object.freeze({
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

// ─── User Roles (mirrors FlowTask) ──────────────────────────────────────────
export const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  HR: 'hr',
  EMPLOYEE: 'employee',
});

// ─── Workspace Roles ─────────────────────────────────────────────────────────
export const WORKSPACE_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  GUEST: 'guest',
});

// ─── Workspace Plan Limits & Feature Flags ───────────────────────────────
export const WORKSPACE_LIMITS = Object.freeze({
  free: {
    maxMembers: 50,
    maxGuests: 0,
    maxChannels: 20,
    maxFileSize: 5 * 1024 * 1024,
    features: {
      threads: true,
      reactions: true,
      fileUploads: true,
      customEmoji: false,
      videoCall: false,
      guestAccess: false,
      advancedSearch: false,
      auditLog: false,
      sso: false,
    },
  },
  pro: {
    maxMembers: 500,
    maxGuests: 50,
    maxChannels: -1,
    maxFileSize: 25 * 1024 * 1024,
    features: {
      threads: true,
      reactions: true,
      fileUploads: true,
      customEmoji: true,
      videoCall: false,
      guestAccess: true,
      advancedSearch: true,
      auditLog: false,
      sso: false,
    },
  },
  enterprise: {
    maxMembers: -1,
    maxGuests: -1,
    maxChannels: -1,
    maxFileSize: 100 * 1024 * 1024,
    features: {
      threads: true,
      reactions: true,
      fileUploads: true,
      customEmoji: true,
      videoCall: true,
      guestAccess: true,
      advancedSearch: true,
      auditLog: true,
      sso: true,
    },
  },
});

// ─── Default Channels ─────────────────────────────────────────────────
export const DEFAULT_CHANNELS = Object.freeze([]);

// ─── FlowTask System Channels (only when FlowTask integration enabled) ───
export const SYSTEM_CHANNELS = Object.freeze({
  GENERAL: { slug: 'flowtask-general', name: 'General', description: 'Company-wide general discussion', visibility: 'public' },
  ADMIN: { slug: 'flowtask-admin', name: 'Admin', description: 'Admin-only channel', visibility: 'private' },
  MANAGERS: { slug: 'flowtask-managers', name: 'Managers', description: 'Manager-level discussion', visibility: 'private' },
  ANNOUNCEMENTS: { slug: 'flowtask-announcements', name: 'Announcements', description: 'Company announcements', visibility: 'public' },
});

// ─── Socket Events ──────────────────────────────────────────────────────────
export const SOCKET_EVENTS = Object.freeze({
  // Workspace settings
  WORKSPACE_UPDATED: 'workspace:updated',
  WORKSPACE_MEMBER_ADDED: 'workspace:member:added',
  WORKSPACE_MEMBER_REMOVED: 'workspace:member:removed',
  WORKSPACE_SETTINGS_UPDATED: 'workspace:settings:updated',
  WORKSPACE_INTEGRATION_UPDATED: 'workspace:integration:updated',
  WORKSPACE_SECURITY_UPDATED: 'workspace:security:updated',
  WORKSPACE_NOTIFICATION_SETTINGS_UPDATED: 'workspace:notification:settings:updated',
  WORKSPACE_INVITE_CODE_REGENERATED: 'workspace:invite:code:regenerated',
  WORKSPACE_DELETED: 'workspace:deleted',
  WORKSPACE_ROLE_UPDATED: 'workspace:role:updated',
  WORKSPACE_BILLING_UPDATED: 'workspace:billing:updated',
  WORKSPACE_PLAN_CHANGED: 'workspace:plan:changed',

  // Messages
  MESSAGE_CREATE: 'message:create',
  MESSAGE_UPDATE: 'message:update',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_ACK: 'message:ack',
  MESSAGE_STATUS: 'message:status',
  MESSAGE_PINNED: 'message:pinned',
  MESSAGE_UNPINNED: 'message:unpinned',
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',

  // Threads
  THREAD_CREATED: 'thread:created',
  THREAD_UPDATED: 'thread:updated',
  THREAD_REPLY: 'thread:reply',
  THREAD_STATS_UPDATED: 'thread:stats:updated',

  // Channels
  CHANNEL_CREATED: 'channel:created',
  CHANNEL_UPDATED: 'channel:updated',
  CHANNEL_DELETED: 'channel:deleted',
  CHANNEL_ADDED: 'channel:added',
  CHANNEL_REMOVED: 'channel:removed',
    CHANNEL_MEMBERS_UPDATED: 'channel:members:updated',
    CHANNEL_LIST_INVALIDATED: 'channel:list:invalidated',
    CHANNEL_SYNC_PROGRESS: 'channel-sync:progress',
    CHANNEL_SYNC_COMPLETED: 'channel-sync:completed',
    CHANNEL_SYNC_FAILED: 'channel-sync:failed',
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',

  // Presence
  USER_ONLINE: 'user:online',
  USER_AWAY: 'user:away',
  USER_OFFLINE: 'user:offline',
  USER_PROFILE_UPDATED: 'user:profile:updated',
  USER_ROLE_UPDATED: 'user:role:updated',
  PRESENCE_SYNC: 'presence:sync',

  // Notifications
  NOTIFICATION: 'notification',
  NOTIFICATION_DISMISS: 'notification:dismiss',
  NOTIFICATION_READ_SYNC: 'notification:read:sync',
  NOTIFICATION_PREFERENCES_UPDATED: 'notification:preferences:updated',
  NOTIFICATION_UNREAD_UPDATED: 'notification:unread:updated',

  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Announcements
  ANNOUNCEMENT_UPDATED: 'announcement:updated',
  ANNOUNCEMENT_DELETED: 'announcement:deleted',

  // Drafts
  DRAFT_UPDATED: 'draft:updated',
  DRAFT_DELETED: 'draft:deleted',

  // Saved Messages
  SAVED_MESSAGE_ADDED: 'saved:message:added',
  SAVED_MESSAGE_STATUS_UPDATED: 'saved:message:status:updated',

  // Scheduled Messages
  SCHEDULED_MESSAGE_SENT: 'scheduled:sent',
  SCHEDULED_MESSAGE_FAILED: 'scheduled:failed',

  // Favorites
  FAVORITE_ADDED: 'favorite:added',
  FAVORITE_REMOVED: 'favorite:removed',

  // Window / Session
  WINDOW_FOCUS: 'window:focus',
  WINDOW_BLUR: 'window:blur',

  // Invites
  INVITE_CREATED: 'invite:created',
  INVITE_ACCEPTED: 'invite:accepted',
  INVITE_RESENT: 'invite:resent',
  INVITE_REVOKED: 'invite:revoked',

  // Workspace members
  WORKSPACE_MEMBER_UPDATED: 'workspace:member:updated',
});

// ─── Audit Actions ──────────────────────────────────────────────────────────
export const AUDIT_ACTIONS = Object.freeze({
  CHANNEL_CREATED: 'CHANNEL_CREATED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  CHANNEL_ARCHIVED: 'CHANNEL_ARCHIVED',
  WEBHOOK_PROCESSED: 'WEBHOOK_PROCESSED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  INVITE_CREATED: 'INVITE_CREATED',
  INVITE_RESENT: 'INVITE_RESENT',
  INVITE_ACCEPTED: 'INVITE_ACCEPTED',
  INVITE_REVOKED: 'INVITE_REVOKED',
});

// ─── Notification Types ──────────────────────────────────────────────────────
export const NOTIFICATION_TYPES = Object.freeze({
  MENTION: 'mention',
  DM: 'dm',
  CHANNEL_INVITE: 'channel_invite',
  CHANNEL_REMOVE: 'channel_remove',
  TASK_UPDATE: 'task_update',
  SYSTEM: 'system',
  THREAD_REPLY: 'thread_reply',
  GROUP_MESSAGE: 'group_message',
  CHANNEL_MESSAGE: 'channel_message',
  KEYWORD_MATCH: 'keyword_match',
  BOT_ALERT: 'bot_alert',
  WORKSPACE_INVITE: 'workspace_invite',
  ROLE_CHANGE: 'role_change',
  SECURITY_ALERT: 'security_alert',
  CALL_INVITE: 'call_invite',
  REMINDER_OVERDUE: 'reminder_overdue',
  CHANNEL_AUTO_CREATED: 'channel_auto_created',
  USER_ACTIVATED: 'user_activated',
});

// ─── Notification Priorities ─────────────────────────────────────────────────
export const NOTIFICATION_PRIORITIES = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
});

// ─── Notification Categories (for filtering in UI) ──────────────────────────
export const NOTIFICATION_CATEGORIES = Object.freeze({
  DM: 'dm',
  MENTION: 'mention',
  THREAD_REPLY: 'thread_reply',
  CHANNEL_MESSAGE: 'channel_message',
  BOT: 'bot',
  SYSTEM: 'system',
  CALL_INVITE: 'call_invite',
});

// ─── Notification Bundling ───────────────────────────────────────────────────
export const NOTIFICATION_BUNDLING = Object.freeze({
  BUNDLE_WINDOW_MS: 2 * 60 * 1000,
  MAX_BUNDLE_SIZE: 50,
  BUNDLE_QUEUE_NAME: 'notification-bundle',
});

// ─── Pagination Defaults ─────────────────────────────────────────────────────
export const PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  DEFAULT_THREAD_LIMIT: 30,
});

// ─── Rate Limits ─────────────────────────────────────────────────────────────
export const RATE_LIMITS = Object.freeze({
  MESSAGE_SEND: { windowMs: 60_000, max: 30 },
  REACTION: { windowMs: 60_000, max: 60 },
  SEARCH: { windowMs: 60_000, max: 10 },
  WEBHOOK: { windowMs: 60_000, max: 1000 },
  AUTH: { windowMs: 100_000, max: 5 },
  INVITE: { windowMs: 60_000, max: 10 },
});

// ─── Circuit Breaker ─────────────────────────────────────────────────────────
export const CIRCUIT_BREAKER = Object.freeze({
  FAILURE_THRESHOLD: 5,
  FAILURE_RATE_THRESHOLD: 0.5,
  FAILURE_RATE_WINDOW_MS: 60_000,
  COOLDOWN_MS: 30_000,
  PROBE_SUCCESS_THRESHOLD: 2,
});

// ─── Event Processing ────────────────────────────────────────────────────────
export const EVENT_PROCESSING = Object.freeze({
  MAX_HOLD_MS: 60_000,
  DEBOUNCE_WINDOW_MS: 5_000,
  TASK_UPDATE_DEBOUNCE_MS: 30_000,
  PROCESSED_EVENT_TTL_DAYS: 7,
});

// ─── Bot Constants ───────────────────────────────────────────────────────────
export const BOT = Object.freeze({
  SYSTEM_USER_ID: 'SYSTEM_BOT',
  DISPLAY_NAME: 'FlowTask Bot',
  AVATAR: '/bot_6819665.png',
  DEADLINE_CHECK_CRON: '0 9 * * *',
  DEADLINE_WARNING_HOURS: 24,
});

// ─── Message Edit Window ─────────────────────────────────────────────────────
export const MESSAGE_EDIT_WINDOW_MS = 10 * 60 * 1000;

// ─── Channel Name Constraints ────────────────────────────────────────────────
export const CHANNEL_NAME = Object.freeze({
  MAX_LENGTH: 80,
  PREFIX: 'flowtask-',
  DEPT_PREFIX: 'flowtask-dept-',
  TEAM_PREFIX: 'flowtask-team-',
});

// ─── Workspace-Scoped Socket Room Helpers ────────────────────────────────────
export const ROOM_PREFIX = Object.freeze({
  WORKSPACE: 'ws',
  USER: 'user',
  CHANNEL: 'channel',
  DEPARTMENT: 'dept',
});

/**
 * Build workspace-scoped room names for Socket.IO.
 * All rooms are prefixed with ws:{workspaceId}: to prevent cross-workspace leakage.
 */
export function buildRoomName(workspaceId, type, id) {
  if (!workspaceId || !type || !id) {
    throw new Error(`buildRoomName: invalid args (workspaceId=${workspaceId}, type=${type}, id=${id})`);
  }
  return `${ROOM_PREFIX.WORKSPACE}:${workspaceId}:${type}:${id}`;
}
