import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';
import * as ctrl from './notification.controller.js';

const router = Router();

// All notification routes require auth + workspace context
router.use(protect, resolveWorkspace);

router.get('/', ctrl.getNotifications);
router.get('/unread-count', ctrl.getUnreadCount);
router.get('/unread-counts-all', ctrl.getUnreadCountsAll);
router.post('/read-all', ctrl.markAllAsRead);
router.post('/:id/read', ctrl.markAsRead);
router.delete('/:id', ctrl.deleteNotification);

export default router;
