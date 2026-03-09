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
  const { chatUser, message } = await authService.register({ name, email, password });

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
  });

  // Fetch user's workspaces for client-side workspace selection
  const { default: WorkspaceMembership } = await import('../workspaces/WorkspaceMembership.model.js');
  const workspaces = await WorkspaceMembership.findUserWorkspaces(chatUser._id);

  res.status(200).json({
    success: true,
    data: {
      user: chatUser,
      accessToken,
      refreshToken,
      workspaces,
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
  });

  // Fetch user's workspaces
  const { default: WorkspaceMembership } = await import('../workspaces/WorkspaceMembership.model.js');
  const workspaces = await WorkspaceMembership.findUserWorkspaces(chatUser._id);

  // If user has a workspace with FlowTask enabled, get channels for that workspace
  let channels = [];
  const wsId = req.headers['x-workspace-id'];
  if (wsId) {
    // Ensure workspace membership exists
    await ensureWorkspaceMembership(chatUser._id, wsId);

    // Auto-join public system channels
    const systemChannels = await channelRepository.findSystemChannels(wsId);
    for (const sc of systemChannels) {
      if (sc.visibility === 'public' && !sc.hasMember(chatUser._id)) {
        await channelService.addMember(sc._id, chatUser._id).catch(() => {});
      }
    }

    // Sync project channels from FlowTask boards
    if (env.FLOWTASK_ENABLED) {
      await channelService.syncProjectChannelsForUser(token, chatUser, wsId).catch(() => {});
    }

    // Get user's channels for initial state
    const userChannels = await channelRepository.findByMember(chatUser._id, { workspaceId: wsId });
    channels = userChannels.map((ch) => ({
      _id: ch._id,
      name: ch.name,
      slug: ch.slug,
      type: ch.type,
      visibility: ch.visibility,
      lastMessageAt: ch.lastMessageAt,
      lastMessagePreview: ch.lastMessagePreview,
      memberCount: ch.memberCount,
    }));
  }

  res.status(200).json({
    success: true,
    data: {
      user: chatUser,
      accessToken,
      refreshToken,
      workspaces,
      channels,
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

  const { chatUser } = await authService.syncFlowTaskUser(token);

  const wsId = req.headers['x-workspace-id'];
  let channels = [];

  if (wsId) {
    // Ensure workspace membership exists
    await ensureWorkspaceMembership(chatUser._id, wsId);

    // Auto-join public system channels
    const systemChannels = await channelRepository.findSystemChannels(wsId);
    for (const sc of systemChannels) {
      if (sc.visibility === 'public' && !sc.hasMember(chatUser._id)) {
        await channelService.addMember(sc._id, chatUser._id).catch(() => {});
      }
    }

    // Sync project channels
    if (env.FLOWTASK_ENABLED) {
      await channelService.syncProjectChannelsForUser(token, chatUser, wsId).catch(() => {});
    }

    const userChannels = await channelRepository.findByMember(chatUser._id, { workspaceId: wsId });
    channels = userChannels.map((ch) => ({
      _id: ch._id,
      name: ch.name,
      slug: ch.slug,
      type: ch.type,
      visibility: ch.visibility,
      lastMessageAt: ch.lastMessageAt,
      lastMessagePreview: ch.lastMessagePreview,
      memberCount: ch.memberCount,
    }));
  }

  res.status(200).json({
    success: true,
    data: {
      user: chatUser,
      channels,
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
  // Include user's workspaces in the response
  const { default: WorkspaceMembership } = await import('../workspaces/WorkspaceMembership.model.js');
  const workspaces = await WorkspaceMembership.findUserWorkspaces(req.user._id);

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
      workspaces,
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
