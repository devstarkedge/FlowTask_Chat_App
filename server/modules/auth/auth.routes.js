import { Router } from 'express';
import {
  register,
  login,
  loginFlowTask,
  syncUser,
  refresh,
  logout,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getMe,
  updatePreferences,
  deleteAccount,
  searchUsers,
  getFlowTaskChannelSyncStatus,
} from './auth.controller.js';
import { protect } from './auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';
import { authLimiter, refreshLimiter, passwordResetLimiter } from '../../middleware/rateLimiter.js';
import { validate } from '../../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  loginFlowTaskSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../middleware/schemas.js';

const router = Router();

/**
 * Auth Routes
 *
 * ── Public (No auth required) ──────────────────────────────────────────
 * POST   /register             — Register native user
 * POST   /login                — Login with email/password
 * POST   /login/flowtask       — Login with FlowTask JWT
 * POST   /sync                 — Legacy: Sync user from FlowTask JWT
 * POST   /refresh              — Refresh access token
 * GET    /verify-email         — Verify email (via link)
 * POST   /resend-verification  — Resend verification email
 * POST   /forgot-password      — Request password reset
 * POST   /reset-password       — Reset password with token
 *
 * ── Protected (Auth required) ──────────────────────────────────────────
 * GET    /me                   — Get current user
 * PUT    /preferences          — Update chat preferences
 * POST   /logout               — Logout (revoke refresh token)
 */

// Public auth routes (rate-limited)
router.post('/register', authLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);
router.post('/login/flowtask', authLimiter, validate({ body: loginFlowTaskSchema }), loginFlowTask);
router.post('/sync', authLimiter, syncUser);
router.post('/refresh', refreshLimiter, validate({ body: refreshTokenSchema }), refresh);

// Email verification
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', authLimiter, resendVerification);

// Password reset
router.post('/forgot-password', passwordResetLimiter, validate({ body: forgotPasswordSchema }), forgotPassword);
router.post('/reset-password', passwordResetLimiter, validate({ body: resetPasswordSchema }), resetPassword);

// Protected routes
router.get('/me', protect, getMe);
router.get('/channel-sync/status', protect, resolveWorkspace, getFlowTaskChannelSyncStatus);
router.put('/preferences', protect, resolveWorkspace, updatePreferences);
router.delete('/account', protect, deleteAccount);
router.post('/logout', logout);

// User search (protected)
router.get('/users/search', protect, resolveWorkspace, searchUsers);

export default router;
