import { Router } from 'express';
import { markAsRead, getUnreadCounts } from './readReceipt.controller.js';
import { protect } from '../auth/auth.middleware.js';

const router = Router();

/**
 * Read Receipt Routes — all protected
 *
 * GET  /api/chat/unread                       — Get unread counts
 * POST /api/chat/channels/:channelId/read     — Mark channel as read
 */

router.use(protect);

router.get('/unread', getUnreadCounts);

export default router;

/**
 * Channel-scoped read receipt route.
 * Mounted on: /api/chat/channels/:channelId
 */
export const channelReadRouter = Router({ mergeParams: true });
channelReadRouter.use(protect);
channelReadRouter.post('/read', markAsRead);
