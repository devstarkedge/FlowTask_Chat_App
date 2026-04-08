import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

export const saveDraftSchema = z.object({
  channelId: objectId,
  threadId: objectId.optional().nullable(),
  content: z.string().max(10000).optional().default(''),
  htmlContent: z.string().max(50000).optional().default(''),
  attachments: z.array(z.object({
    fileId: objectId.optional(),
    fileName: z.string().max(255).optional(),
    mimeType: z.string().max(100).optional(),
    fileSize: z.number().int().positive().optional(),
    url: z.string().optional(),
    thumbnailUrl: z.string().optional(),
  })).max(10).optional().default([]),
  mentions: z.array(z.object({
    targetId: z.string().min(1),
    name: z.string().optional(),
    type: z.enum(['user', 'channel']).optional().default('user'),
  })).max(50).optional().default([]),
});
