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
  updateUser,
  uploadAvatar,
  removeAvatar,
} from './user.controller.js';
import multer from 'multer';

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
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

// Avatar upload & removal (must come before :id catch-all)
router.post('/avatar', protect, (req, res, next) => {
  memoryUpload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'file', maxCount: 1 }])(req, res, (err) => {
    if (err) return next(err);
    req.file = req.files?.avatar?.[0] || req.files?.file?.[0] || req.file;
    next();
  });
}, uploadAvatar);
router.delete('/avatar', protect, removeAvatar);

// Profile (must be last — :id is a catch-all param)
router.patch('/:id', protect, resolveWorkspace, updateUser);
router.get('/:id', protect, getProfile);

export default router;
