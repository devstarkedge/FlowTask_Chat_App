import { Router } from 'express';
import {
  getMessages,
  getMessagesAround,
  sendMessage,
  getMessage,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  pinMessage,
  unpinMessage,
  getPinnedMessages,
  searchMessages,
  uploadFiles,
  getWorkspaceFiles,
  getChannelFiles,
  deleteChannelFile,
  markDMSeen,
  toggleSaveMessage,
  getSavedMessages,
  updateSavedMessageStatus,
  updateSavedMessageReminder,
  snoozeSavedReminder,
  parseReminderText,
  suggestRemindersFromMessage,
  createStandaloneReminder,
  deleteReminder,
  scheduleMessage,
  getScheduledMessages,
  cancelScheduledMessage,
  rescheduleMessage,
  updateScheduledMessage,
  sendScheduledNow,
  forwardMessage,
} from './message.controller.js';
import { protect, requireChannelAccess, requireMessageAccess } from '../auth/auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';
import { uploadFiles as uploadMiddleware, handleMulterError, validateUploadedFileMagic } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import {
  sendMessageSchema,
  editMessageSchema,
  reactionSchema,
  searchMessagesSchema,
  scheduleMessageSchema,
} from '../../middleware/schemas.js';
import { proxyFileAsset, getFileDetails, incrementDownloadCount } from '../files/cloudinarySign.controller.js';

const router = Router();

/**
 * Message Routes — all protected
 *
 * Channel-scoped:
 *   GET  /api/chat/channels/:channelId/messages  — Get messages (cursor pagination)
 *   POST /api/chat/channels/:channelId/messages  — Send message
 *   GET  /api/chat/channels/:channelId/pins      — Get pinned messages
 *
 * Message-scoped:
 *   GET    /api/chat/messages/search            — Search messages
 *   GET    /api/chat/messages/:id               — Get single message
 *   PUT    /api/chat/messages/:id               — Edit message
 *   DELETE /api/chat/messages/:id               — Soft-delete message
 *   POST   /api/chat/messages/:id/reactions     — Add reaction
 *   DELETE /api/chat/messages/:id/reactions/:emoji — Remove reaction
 *   POST   /api/chat/messages/:id/pin           — Pin message
 *   DELETE /api/chat/messages/:id/pin           — Unpin message
 */

// All routes require authentication
router.use(protect);
router.use(resolveWorkspace);

// ─── Channel-scoped message routes ───────────────────────────────────────────
// These are mounted under /api/chat/channels/:channelId in the main router
// but we export them separately to be mounted by the channel router or index

// ─── Message-scoped routes (mounted under /api/chat/messages) ────────────────
router.get('/search', validate({ query: searchMessagesSchema }), searchMessages);
router.get('/files', getWorkspaceFiles);
// Proxy endpoint: streams a FileAsset from Cloudinary server-side to avoid CDN 401
router.get('/files/:assetId/proxy', proxyFileAsset);
// File details endpoint: returns metadata + counts for File Details modal
router.get('/files/:assetId/details', getFileDetails);
// Increment download count (fire-and-forget)
router.post('/files/:assetId/download', incrementDownloadCount);
router.get('/saved', getSavedMessages);
router.get('/scheduled', getScheduledMessages);
router.delete('/scheduled/:id', cancelScheduledMessage);
router.patch('/reschedule/:id', rescheduleMessage);
router.patch('/scheduled/:id', updateScheduledMessage);
router.post('/send-now/:id', sendScheduledNow);
router.get('/:id', requireMessageAccess(), getMessage);
router.put('/:id', requireMessageAccess(), validate({ body: editMessageSchema }), editMessage);
router.delete('/:id', requireMessageAccess(), deleteMessage);
router.post('/:id/reactions', requireMessageAccess(), validate({ body: reactionSchema }), addReaction);
router.delete('/:id/reactions/:emoji', requireMessageAccess(), removeReaction);
router.post('/:id/pin', requireMessageAccess(), pinMessage);
router.delete('/:id/pin', requireMessageAccess(), unpinMessage);
router.post('/:id/save', requireMessageAccess(), toggleSaveMessage);
router.patch('/:id/save/status', requireMessageAccess(), updateSavedMessageStatus);
router.patch('/:id/save/reminder', requireMessageAccess(), updateSavedMessageReminder);
router.patch('/:id/save/reminder/snooze', requireMessageAccess(), snoozeSavedReminder);
router.post('/reminders/standalone', createStandaloneReminder);
router.post('/reminders/parse', parseReminderText);
router.delete('/reminders/:id', deleteReminder);
router.post('/:id/forward', requireMessageAccess(), forwardMessage);
router.post('/:id/reminder-suggestions', requireMessageAccess(), suggestRemindersFromMessage);
export default router;

/**
 * Channel-scoped message routes.
 * To be mounted on the channel router: /api/chat/channels/:channelId
 */
import { uploadLimiter } from '../../middleware/rateLimiter.js';
import { getUploadSignature } from '../files/cloudinarySign.controller.js';

export const channelMessageRouter = Router({ mergeParams: true });
channelMessageRouter.use(protect);
channelMessageRouter.use(resolveWorkspace);
channelMessageRouter.use(requireChannelAccess());
channelMessageRouter.get('/messages', getMessages);
channelMessageRouter.get('/messages/around/:messageId', getMessagesAround);
channelMessageRouter.post('/messages', validate({ body: sendMessageSchema }), sendMessage);
channelMessageRouter.post('/upload', uploadLimiter, uploadMiddleware, handleMulterError, validateUploadedFileMagic, uploadFiles);
channelMessageRouter.post('/upload/sign', getUploadSignature);
channelMessageRouter.get('/files', getChannelFiles);
channelMessageRouter.delete('/files/:fileId', deleteChannelFile);
channelMessageRouter.get('/pins', getPinnedMessages);
channelMessageRouter.post('/seen', markDMSeen);
channelMessageRouter.post('/scheduled-messages', validate({ body: scheduleMessageSchema }), scheduleMessage);

