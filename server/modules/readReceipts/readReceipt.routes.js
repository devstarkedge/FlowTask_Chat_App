import { Router } from 'express';
import {
  getMessageInfo,
  markMessageRead,
} from './readReceipt.controller.js';
import { protect, requireMessageAccess } from '../auth/auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';

const router = Router();

// All routes require authentication
router.use(protect);
router.use(resolveWorkspace);

// GET /api/chat/messages/:messageId/info?channelId=xxx
router.get('/messages/:messageId/info', requireMessageAccess(), getMessageInfo);

// POST /api/chat/channels/:channelId/messages/:messageId/mark-read
router.post('/channels/:channelId/messages/:messageId/mark-read', markMessageRead);

export default router;