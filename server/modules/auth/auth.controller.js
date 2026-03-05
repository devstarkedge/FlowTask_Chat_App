import authService from './auth.service.js';
import channelRepository from '../channels/channel.repository.js';
import channelService from '../channels/channel.service.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import asyncHandler from '../../middleware/asyncHandler.js';
import env from '../../config/environment.js';

/**
 * Ensure the user has a WorkspaceMembership record for the given workspace.
 * Called after login/register so subsequent resolveWorkspace checks pass.
 */
async function ensureWorkspaceMembership(userId, workspaceId) {
  if (!workspaceId) return;
  const existing = await WorkspaceMembership.findOne({
    userId,
    workspaceId,
    isActive: true,
  }).lean();
  if (!existing) {
    await WorkspaceMembership.addMember(userId, workspaceId);
  }
}

/**
 * Auth Controller — handles all authentication HTTP endpoints.
 * Supports native (email/password) and FlowTask SSO.
 */

// ═══════════════════════════════════════════════════════════════════════════
// NATIVE AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/chat/auth/register
 * Register a new native user.
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const { chatUser, message } = await authService.register({ name, email, password, workspaceId: req.workspaceId });

  res.status(201).json({
    success: true,
    data: {
      user: {
        _id: chatUser._id,
        name: chatUser.name,
        email: chatUser.email,
        authProvider: chatUser.authProvider,
        emailVerified: chatUser.emailVerified,
      },
    },
    message,
  });
});

/**
 * POST /api/chat/auth/login
 * Login with email & password. Returns access + refresh tokens.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const userAgent = req.get('User-Agent') || '';

  const { chatUser, accessToken, refreshToken, emailWarning } = await authService.loginNative({
    email,
    password,
    userAgent,
    workspaceId: req.workspaceId,
  });

  // Ensure workspace membership exists for subsequent authenticated requests
  await ensureWorkspaceMembership(chatUser._id, req.workspaceId);

  res.status(200).json({
    success: true,
    data: {
      user: chatUser,
      accessToken,
      refreshToken,
    },
    ...(emailWarning && { warning: emailWarning }),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOWTASK SSO AUTH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/chat/auth/login/flowtask
 * Login via FlowTask JWT token. Returns Chat-issued access + refresh tokens.
 */
export const loginFlowTask = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const userAgent = req.get('User-Agent') || '';

  const { chatUser, accessToken, refreshToken } = await authService.loginFlowTask({
    token,
    userAgent,
    workspaceId: req.workspaceId,
  });

  // Ensure workspace membership exists for subsequent authenticated requests
  await ensureWorkspaceMembership(chatUser._id, req.workspaceId);

  // Auto-join public system channels
  const systemChannels = await channelRepository.findSystemChannels(req.workspaceId);
  for (const sc of systemChannels) {
    if (sc.visibility === 'public' && !sc.hasMember(chatUser._id)) {
      await channelService.addMember(sc._id, chatUser._id).catch(() => {});
    }
  }

  // Sync project channels from FlowTask boards (if FlowTask token available)
  if (env.FLOWTASK_ENABLED) {
    await channelService.syncProjectChannelsForUser(token, chatUser, req.workspaceId).catch(() => {});
  }

  // Get user's channels for initial state
  const channels = await channelRepository.findByMember(chatUser._id, { workspaceId: req.workspaceId });

  res.status(200).json({
    success: true,
    data: {
      user: chatUser,
      accessToken,
      refreshToken,
      channels: channels.map((ch) => ({
        _id: ch._id,
        name: ch.name,
        slug: ch.slug,
        type: ch.type,
        visibility: ch.visibility,
        lastMessageAt: ch.lastMessageAt,
        lastMessagePreview: ch.lastMessagePreview,
        memberCount: ch.memberCount,
      })),
    },
  });
});

/**
 * POST /api/chat/auth/sync
 * Legacy: Sync user from FlowTask JWT. (Backward compatibility)
 */
export const syncUser = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: { message: 'Token required' } });
  }

  const { chatUser } = await authService.syncFlowTaskUser(token, req.workspaceId);

  // Ensure workspace membership exists for subsequent authenticated requests
  await ensureWorkspaceMembership(chatUser._id, req.workspaceId);

  // Auto-join public system channels
  const systemChannels = await channelRepository.findSystemChannels(req.workspaceId);
  for (const sc of systemChannels) {
    if (sc.visibility === 'public' && !sc.hasMember(chatUser._id)) {
      await channelService.addMember(sc._id, chatUser._id).catch(() => {});
    }
  }

  // Sync project channels
  if (env.FLOWTASK_ENABLED) {
    await channelService.syncProjectChannelsForUser(token, chatUser, req.workspaceId).catch(() => {});
  }

  const channels = await channelRepository.findByMember(chatUser._id, { workspaceId: req.workspaceId });

  res.status(200).json({
    success: true,
    data: {
      user: chatUser,
      channels: channels.map((ch) => ({
        _id: ch._id,
        name: ch.name,
        slug: ch.slug,
        type: ch.type,
        visibility: ch.visibility,
        lastMessageAt: ch.lastMessageAt,
        lastMessagePreview: ch.lastMessagePreview,
        memberCount: ch.memberCount,
      })),
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/chat/auth/refresh
 * Refresh access token using refresh token (with rotation).
 */
export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const userAgent = req.get('User-Agent') || '';

  const tokens = await authService.refreshAccessToken({ refreshToken, userAgent });

  res.status(200).json({
    success: true,
    data: tokens,
  });
});

/**
 * POST /api/chat/auth/logout
 * Revoke the current refresh token.
 */
export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  await authService.logout(req.user._id, refreshToken);

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/chat/auth/verify-email?token=...
 * Verify user's email address.
 */
export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ success: false, error: { message: 'Verification token required' } });
  }

  await authService.verifyEmail(token);

  // Redirect to client login with success message
  const clientUrl = Array.isArray(env.CORS_ORIGINS) ? env.CORS_ORIGINS[0] : env.CORS_ORIGINS;
  res.redirect(`${clientUrl}/login?verified=true`);
});

/**
 * POST /api/chat/auth/resend-verification
 * Resend email verification link.
 */
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.resendVerification(email);

  // Always return success to prevent email enumeration
  res.status(200).json({
    success: true,
    message: 'If an unverified account exists with that email, a new verification link has been sent.',
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD RESET
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/chat/auth/forgot-password
 * Request a password reset link.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.requestPasswordReset(email);

  // Always return success to prevent email enumeration
  res.status(200).json({
    success: true,
    message: 'If an account exists with that email, a reset link has been sent.',
  });
});

/**
 * POST /api/chat/auth/reset-password
 * Reset password using a valid reset token.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  await authService.resetPassword({ token, newPassword });

  res.status(200).json({
    success: true,
    message: 'Password reset successful. Please log in with your new password.',
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// USER PROFILE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/chat/auth/me
 * Get current chat user profile.
 */
export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

/**
 * PUT /api/chat/auth/preferences
 * Update chat preferences.
 */
/**
 * GET /api/chat/auth/users/search?q=...
 * Search users by name or email.
 */
export const searchUsers = asyncHandler(async (req, res) => {
  const { default: userRepository } = await import('../users/user.repository.js');
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(200).json({ success: true, data: { users: [] } });
  }
  const users = await userRepository.search(q.trim(), 20, req.workspaceId);
  // Filter out the requesting user
  const filtered = users.filter((u) => u._id.toString() !== req.user._id.toString());
  res.status(200).json({ success: true, data: { users: filtered } });
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const { default: userRepository } = await import('../users/user.repository.js');

  const allowedFields = [
    'theme', 'notificationSound', 'desktopNotifications',
    'sidebarCollapsed', 'compactMode',
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const user = await userRepository.updatePreferences(req.user._id, updates);

  res.status(200).json({
    success: true,
    data: { user },
  });
});
