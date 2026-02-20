import { z } from 'zod';
import { ALLOWED_REACTIONS, CHANNEL_VISIBILITY } from '../config/constants.js';

/**
 * Zod validation schemas for all API endpoints.
 * Centralized to ensure consistent validation across the application.
 */

// ─── Common ──────────────────────────────────────────────────────────────────

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

// ─── Messages ────────────────────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  content: z.string().max(10000).optional().default(''),
  htmlContent: z.string().max(50000).optional(),
  contentType: z.enum(['text', 'system', 'bot', 'file', 'task_update']).optional(),
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1).max(255),
        originalName: z.string().min(1).max(255).optional(),
        mimeType: z.string().min(1).max(100),
        fileSize: z.number().int().positive().max(50 * 1024 * 1024),
        url: z.string().url(),
        thumbnailUrl: z.string().url().optional(),
        source: z.enum(['chat_upload', 'flowtask_link']).optional(),
      }),
    )
    .max(10)
    .optional(),
  flowTaskRef: z
    .object({
      entityType: z.string(),
      entityId: z.string(),
    })
    .optional(),
  threadId: z.string().optional(),
}).refine(
  (data) => data.content || (data.attachments && data.attachments.length > 0),
  { message: 'Message must have content or attachments' },
);

export const editMessageSchema = z.object({
  content: z.string().min(1, 'Content cannot be empty').max(10000),
});

export const reactionSchema = z.object({
  emoji: z.string().refine(
    (val) => ALLOWED_REACTIONS.includes(val),
    { message: `Allowed reactions: ${ALLOWED_REACTIONS.join(', ')}` },
  ),
});

export const searchMessagesSchema = z.object({
  q: z.string().min(1, 'Search query required').max(200),
  channelId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

// ─── Channels ────────────────────────────────────────────────────────────────

export const createChannelSchema = z.object({
  name: z.string().min(2, 'Channel name must be 2-80 characters').max(80),
  description: z.string().max(500).optional().default(''),
  visibility: z.enum([CHANNEL_VISIBILITY.PUBLIC, CHANNEL_VISIBILITY.PRIVATE]).optional().default(CHANNEL_VISIBILITY.PRIVATE),
  memberIds: z.array(objectId).max(100).optional().default([]),
});

export const updateChannelSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  topic: z.string().max(250).optional(),
  visibility: z.enum([CHANNEL_VISIBILITY.PUBLIC, CHANNEL_VISIBILITY.PRIVATE]).optional(),
});

export const createDMSchema = z.object({
  targetUserId: objectId,
});

// ─── Threads ─────────────────────────────────────────────────────────────────

export const createThreadSchema = z.object({
  rootMessageId: objectId,
  title: z.string().max(200).optional(),
});

export const threadReplySchema = z.object({
  content: z.string().min(1).max(10000),
  htmlContent: z.string().max(50000).optional(),
});

export const updateThreadTitleSchema = z.object({
  title: z.string().min(1).max(200),
});

// ─── Auth ────────────────────────────────────────────────────────────────────

export const updatePreferencesSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  notificationSound: z.boolean().optional(),
  desktopNotifications: z.boolean().optional(),
  sidebarCollapsed: z.boolean().optional(),
  compactMode: z.boolean().optional(),
});
