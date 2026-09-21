/**
 * @file types.js
 * Definitions and standard schemas for the centralized notification architecture.
 */

/**
 * Standard Notification Types supported by the pipeline.
 * Extensible by registering custom event types.
 */
export const NotificationType = Object.freeze({
  NEW_MESSAGE: 'NEW_MESSAGE',
  MESSAGE_EDITED: 'MESSAGE_EDITED',
  GIF_RECEIVED: 'GIF_RECEIVED',
  THREAD_REPLY: 'THREAD_REPLY',
  MENTION_RECEIVED: 'MENTION_RECEIVED',
  REACTION_ADDED: 'REACTION_ADDED',
  FILE_RECEIVED: 'FILE_RECEIVED',
  CHANNEL_CREATED: 'CHANNEL_CREATED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_DELETED: 'TASK_DELETED',
  SYSTEM_ALERT: 'SYSTEM_ALERT',
});

/**
 * Priority levels for notifications.
 */
export const NotificationPriority = Object.freeze({
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low',
});

/**
 * Navigation Target types.
 */
export const NavigationTargetType = Object.freeze({
  CHANNEL: 'channel',
  DM: 'dm',
  TASK: 'task',
  THREAD: 'thread',
  URL: 'url',
});

/**
 * Active Conversation Behavior options.
 */
export const ActiveConversationBehavior = Object.freeze({
  SUPPRESS: 'suppress',           // Hide notification if user is actively viewing conversation
  ALLOW_CRITICAL: 'allow_critical', // Allow only critical/high priority notifications
  ALLOW_ALL: 'allow_all',         // Show notification regardless of active view
});

/**
 * @typedef {Object} NavigationTarget
 * @property {'channel' | 'dm' | 'task' | 'thread' | 'url'} type
 * @property {string} targetId
 * @property {Record<string, any>} [extra]
 */

/**
 * @typedef {Object} NotificationSender
 * @property {string} id
 * @property {string} name
 * @property {string} [avatar]
 */

/**
 * Standardized Notification Event Structure
 * @typedef {Object} NotificationEvent
 * @property {string} type - Identifier from NotificationType enum or custom registered string
 * @property {string} eventId - Unique event identifier (e.g., message ID, task event hash)
 * @property {string} [workspaceId] - Active workspace ID context
 * @property {string} [channelId] - Channel or DM ID
 * @property {string} [conversationId] - Alternative conversation identifier
 * @property {string} [messageId] - Specific message ID
 * @property {NotificationSender} [sender] - Sender details
 * @property {string} title - Human-readable notification title
 * @property {string} body - Human-readable notification body text (sanitized)
 * @property {'high' | 'normal' | 'low'} [priority] - Notification priority
 * @property {Record<string, any>} [metadata] - Additional contextual data
 * @property {NavigationTarget} [navigationTarget] - Direct routing target on click
 * @property {number} [timestamp] - Timestamp when notification occurred
 */
