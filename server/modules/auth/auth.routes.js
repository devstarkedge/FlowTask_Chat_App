import { Router } from 'express';
import { syncUser, getMe, updatePreferences } from './auth.controller.js';
import { protect } from './auth.middleware.js';

const router = Router();

/**
 * Auth Routes
 * POST /api/chat/auth/sync       — Sync user from FlowTask (public, uses Bearer token)
 * GET  /api/chat/auth/me         — Get current user (protected)
 * PUT  /api/chat/auth/preferences — Update chat preferences (protected)
 */

router.post('/sync', syncUser);
router.get('/me', protect, getMe);
router.put('/preferences', protect, updatePreferences);

export default router;
