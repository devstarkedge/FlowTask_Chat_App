/**
 * Application-wide constants.
 * Single source of truth for enums, event names, limits, and defaults.
 */

// ─── FlowTask Domain Events ─────────────────────────────────────────────────
export const FLOWTASK_EVENTS = Object.freeze({
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',
  PROJECT_MEMBER_ASSIGNED: 'PROJECT_MEMBER_ASSIGNED',
  PROJECT_MEMBER_ADDED: 'PROJECT_MEMBER_ADDED',
  PROJECT_MEMBER_REMOVED: 'PROJECT_MEMBER_REMOVED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_DELETED: 'TASK_DELETED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_COMMENTED: 'TASK_COMMENTED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  TASK_DUE_DATE_CHANGED: 'TASK_DUE_DATE_CHANGED',
  TIME_ENTRY_ADDED: 'TIME_ENTRY_ADDED',
  USER_REGISTERED: 'USER_REGISTERED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_VERIFIED: 'USER_VERIFIED',
  ANNOUNCEMENT_CREATED: 'ANNOUNCEMENT_CREATED',
});

// ─── Channel Types ───────────────────────────────────────────────────────────
export const CHANNEL_TYPES = Object.freeze({
  PROJECT: 'project',
  DEPARTMENT: 'department',
  TEAM: 'team',
  DM: 'dm',
  SYSTEM: 'system',
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

// ─── Message Content Types ───────────────────────────────────────────────────
export const MESSAGE_CONTENT_TYPES = Object.freeze({
  TEXT: 'text',
  SYSTEM: 'system',
  BOT: 'bot',
  FILE: 'file',
  TASK_UPDATE: 'task_update',
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

// ─── System Channel Slugs ────────────────────────────────────────────────────
export const SYSTEM_CHANNELS = Object.freeze({
  GENERAL: { slug: 'flowtask-general', name: 'General', description: 'Company-wide general discussion', visibility: 'public' },
  ADMIN: { slug: 'flowtask-admin', name: 'Admin', description: 'Admin-only channel', visibility: 'private' },
  MANAGERS: { slug: 'flowtask-managers', name: 'Managers', description: 'Manager-level discussion', visibility: 'private' },
  ANNOUNCEMENTS: { slug: 'flowtask-announcements', name: 'Announcements', description: 'Company announcements', visibility: 'public' },
});

// ─── Socket Events (emitted by chat server) ──────────────────────────────────
export const SOCKET_EVENTS = Object.freeze({
  // Messages
  MESSAGE_CREATE: 'message:create',
  MESSAGE_UPDATE: 'message:update',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_ACK: 'message:ack',
  MESSAGE_PINNED: 'message:pinned',
  MESSAGE_UNPINNED: 'message:unpinned',

  // Reactions
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',

  // Threads
  THREAD_CREATED: 'thread:created',
  THREAD_UPDATED: 'thread:updated',
  THREAD_REPLY: 'thread:reply',

  // Channels
  CHANNEL_CREATED: 'channel:created',
  CHANNEL_UPDATED: 'channel:updated',
  CHANNEL_ARCHIVED: 'channel:archived',
  CHANNEL_ADDED: 'channel:added',
  CHANNEL_REMOVED: 'channel:removed',
  CHANNEL_MEMBER_ADDED: 'channel:member:added',
  CHANNEL_MEMBER_REMOVED: 'channel:member:removed',
  CHANNEL_MEMBERS_UPDATED: 'channel:members:updated',
  MEMBER_JOINED: 'channel:member_joined',
  MEMBER_LEFT: 'channel:member_left',

  // Presence
  USER_ONLINE: 'presence:online',
  USER_OFFLINE: 'presence:offline',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Read Receipts
  READ_RECEIPT_UPDATED: 'readReceipt:updated',

  // Message Delivery Status
  MESSAGE_STATUS: 'message:status',

  // Unread
  UNREAD_UPDATED: 'unread:updated',

  // Notifications
  NOTIFICATION: 'notification',
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
  AUTH: { windowMs: 60_000, max: 20 },
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
  MAX_HOLD_MS: 60_000,          // max time to hold out-of-order events
  DEBOUNCE_WINDOW_MS: 5_000,    // rapid successive updates debounce
  TASK_UPDATE_DEBOUNCE_MS: 30_000, // task update suppression window
  PROCESSED_EVENT_TTL_DAYS: 7,
});

// ─── Bot Constants ───────────────────────────────────────────────────────────
export const BOT = Object.freeze({
  SYSTEM_USER_ID: 'SYSTEM_BOT',
  DISPLAY_NAME: 'FlowTask Bot',
  AVATAR: '/assets/bot-avatar.png',
  DEADLINE_CHECK_CRON: '0 9 * * *',       // Daily at 9 AM
  DEADLINE_WARNING_HOURS: 24,              // Warn for tasks due within 24h
});

// ─── Message Edit Window ─────────────────────────────────────────────────────
export const MESSAGE_EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// ─── Channel Name Constraints ────────────────────────────────────────────────
export const CHANNEL_NAME = Object.freeze({
  MAX_LENGTH: 80,
  PREFIX: 'flowtask-',
  DEPT_PREFIX: 'flowtask-dept-',
  TEAM_PREFIX: 'flowtask-team-',
});
