import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';
import {
  requireAdmin,
  getAnalytics,
  listUsers,
  changeUserRole,
  deactivateUser,
  activateUser,
  listChannels,
  archiveChannel,
  unarchiveChannel,
  deleteChannel,
  getSettings,
  updateSettings,
} from './admin.controller.js';

const router = Router();

// All admin routes require authentication + workspace + admin role
router.use(protect);
router.use(resolveWorkspace);
router.use(requireAdmin);

// ─── Analytics ───────────────────────────────────────────────────────────────
router.get('/analytics', getAnalytics);

// ─── User Management ────────────────────────────────────────────────────────
router.get('/users', listUsers);
router.put('/users/:userId/role', changeUserRole);
router.put('/users/:userId/deactivate', deactivateUser);
router.put('/users/:userId/activate', activateUser);

// ─── Channel Management ─────────────────────────────────────────────────────
router.get('/channels', listChannels);
router.put('/channels/:channelId/archive', archiveChannel);
router.put('/channels/:channelId/unarchive', unarchiveChannel);
router.delete('/channels/:channelId', deleteChannel);

// ─── Workspace Settings ─────────────────────────────────────────────────────
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

export default router;
