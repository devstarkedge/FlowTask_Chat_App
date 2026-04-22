import { z } from 'zod';
import { CHANNEL_VISIBILITY } from '../config/constants.js';

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
  fileReferences: z.array(objectId).max(10).optional(),
  flowTaskRef: z
    .object({
      entityType: z.string(),
      entityId: z.string(),
    })
    .optional(),
  threadId: z.string().optional(),
  tempId: z.string().max(100).optional(),
  mentions: z
    .array(
      z.object({
        userId: z.string().min(1),
        username: z.string().optional(),
        type: z.enum(['user', 'channel']).optional().default('user'),
      })
    )
    .max(50)
    .optional(),
}).refine(
  (data) => data.content || (data.attachments && data.attachments.length > 0) || (data.fileReferences && data.fileReferences.length > 0),
  { message: 'Message must have content or attachments' },
);

export const editMessageSchema = z.object({
  content: z.string().min(1, 'Content cannot be empty').max(10000),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1, 'Emoji is required').max(10), // Limit length since some emojis use multiple codepoints
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
  // Accept both ChatUser _id (24-char ObjectId) and flowTaskUserId (arbitrary string)
  targetUserId: z.string().min(1, 'targetUserId is required').max(128),
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

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be 2-50 characters').max(50),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const loginFlowTaskSchema = z.object({
  token: z.string().min(1, 'FlowTask token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const updatePreferencesSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).optional(),
  sidebarTheme: z.enum(['aubergine', 'purple', 'blue', 'green', 'graphite', 'custom']).optional(),
  customTheme: z.object({
    sidebarBg: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    sidebarText: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    sidebarActive: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }).optional(),
  notificationSound: z.boolean().optional(),
  desktopNotifications: z.boolean().optional(),
  sidebarCollapsed: z.boolean().optional(),
  compactMode: z.boolean().optional(),
});

export const scheduleMessageSchema = z.object({
  content: z.string().max(10000).optional().default(''),
  htmlContent: z.string().max(50000).optional().default(''),
  threadId: z.string().optional(),
  scheduledAt: z.string().min(1, 'scheduledAt is required'),
  attachments: z.array(z.object({
    fileName: z.string().max(255).optional(),
    mimeType: z.string().max(100).optional(),
    fileSize: z.number().int().positive().optional(),
    url: z.string().optional(),
    thumbnailUrl: z.string().optional(),
  })).max(10).optional().default([]),
  mentions: z.array(z.object({
    userId: z.string().min(1),
    username: z.string().optional(),
    type: z.enum(['user', 'channel']).optional().default('user'),
  })).max(50).optional().default([]),
  fileReferences: z.array(objectId).max(10).optional(),
}).refine(
  (data) => (data.content && data.content.trim()) || (data.attachments && data.attachments.length > 0) || (data.fileReferences && data.fileReferences.length > 0),
  { message: 'Message must have content or attachments' },
);

// ─── Workspaces ──────────────────────────────────────────────────────────────

export const createWorkspaceSchema = z.object({
  name: z.string().min(2, 'Workspace name must be 2-100 characters').max(100),
  description: z.string().max(500).optional().default(''),
  plan: z.enum(['free', 'pro', 'enterprise']).optional().default('free'),
  slug: z.string().max(100).optional(),
});
