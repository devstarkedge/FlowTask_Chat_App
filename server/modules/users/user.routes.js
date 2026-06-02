import { Router } from 'express';
import {
  getProfile,
  setCustomStatus,
  clearCustomStatus,
  setPresence,
  getOnlineUsers,
  searchUsers,
  getDMContacts,
  pauseNotifications,
  resumeNotifications,
  getDndStatus,
  saveDndSchedule,
  updateThemePreferences,
  getThemePreferences,
} from './user.controller.js';
import { protect } from '../auth/auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';

const router = Router();

/**
 * User Routes
 *
 * All routes require authentication.
 *
 * GET    /users/search     — Search users by name/email
 * GET    /users/online     — Get all currently online users
 * PUT    /users/status     — Set custom status (emoji + text + optional duration)
 * DELETE /users/status     — Clear custom status
 * PUT    /users/presence   — Set presence (online/away/dnd)
 * GET    /users/:id        — Get user profile by ID
 */

// Search & list routes (must come before :id param route)
router.get('/dm-contacts', protect, resolveWorkspace, getDMContacts);
router.get('/search', protect, resolveWorkspace, searchUsers);
router.get('/online', protect, resolveWorkspace, getOnlineUsers);

// Custom status
router.put('/status', protect, setCustomStatus);
router.delete('/status', protect, clearCustomStatus);

// DND / Pause Notifications
router.post('/dnd/pause', protect, pauseNotifications);
router.post('/dnd/resume', protect, resumeNotifications);
router.get('/dnd/status', protect, getDndStatus);
router.post('/dnd/schedule', protect, saveDndSchedule);

// Theme Preferences
router.put('/preferences/theme', protect, updateThemePreferences);
router.get('/preferences/theme', protect, getThemePreferences);

// Presence
router.put('/presence', protect, setPresence);

// Profile (must be last — :id is a catch-all param)
router.get('/:id', protect, getProfile);

export default router;
