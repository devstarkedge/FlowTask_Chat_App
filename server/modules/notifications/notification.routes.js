import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';
import * as ctrl from './notification.controller.js';
import * as prefCtrl from './notificationPreference.controller.js';

const router = Router();

// All notification routes require auth + workspace context
router.use(protect, resolveWorkspace);

// ─── Core Notification Endpoints ─────────────────────────────────────────────
router.get('/', ctrl.getNotifications);
router.get('/unread-count', ctrl.getUnreadCount);
router.get('/unread-counts-all', ctrl.getUnreadCountsAll);
router.post('/read-all', ctrl.markAllAsRead);
router.post('/:id/read', ctrl.markAsRead);
router.delete('/:id', ctrl.deleteNotification);

// ─── Notification History (filtered) ─────────────────────────────────────────
router.get('/history', prefCtrl.getHistory);

// ─── Notification Preferences ────────────────────────────────────────────────
router.get('/preferences', prefCtrl.getPreferences);
router.put('/preferences', prefCtrl.updatePreferences);
router.put('/preferences/pause', prefCtrl.pauseNotifications);
router.post('/preferences/resume', prefCtrl.resumeNotifications);
router.put('/preferences/keywords', prefCtrl.updateKeywords);
router.put('/preferences/vip', prefCtrl.updateVIPUsers);

// Per-channel overrides
router.put('/preferences/channel/:channelId', prefCtrl.updateChannelPreference);
router.delete('/preferences/channel/:channelId', prefCtrl.removeChannelPreference);

export default router;
