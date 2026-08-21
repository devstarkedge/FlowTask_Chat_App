import mongoose from 'mongoose';
import crypto from 'node:crypto';
import authService from './auth.service.js';
import channelRepository from '../channels/channel.repository.js';
import channelService from '../channels/channel.service.js';
import workspaceService from '../workspaces/workspace.service.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import asyncHandler from '../../middleware/asyncHandler.js';
import env from '../../config/environment.js';
import ChatUser from '../users/ChatUser.model.js';
import FlowTaskAuthAttempt from './FlowTaskAuthAttempt.model.js';
import projectChannelSyncService from '../flowtask/projectChannelSync.service.js';
import logger from '../../utils/logger.js';
import { ForbiddenError } from '../../middleware/errorHandler.js';
import { normalizeFlowTaskAccess } from '../flowtask/flowTaskWorkspaceRoleMap.js';

/**
 * Ensure the user has a WorkspaceMembership record for the given workspace.
 * Called after login/register so subsequent resolveWorkspace checks pass.
 */
async function ensureWorkspaceMembership(userId, workspaceId, flowTaskAccess = null) {
  if (!workspaceId) throw new ForbiddenError('FlowTask workspace context is required.');
  if (!flowTaskAccess) throw new ForbiddenError('FlowTask workspace access is required.');

  const normalized = normalizeFlowTaskAccess(flowTaskAccess);
  const { _workspaceRole, _isCustomRole, ...persistedAccess } = normalized;

  // A FlowTask workspace membership must always be written together with its
  // signed FlowTask role. `addMember` is idempotent and safely handles both
  // the first SSO login and an existing/re-activated membership.
  await WorkspaceMembership.addMember(userId, workspaceId, _workspaceRole);
  await WorkspaceMembership.updateOne(
    { userId, workspaceId, isActive: true },
    { $set: { role: _workspaceRole, flowTaskAccess: persistedAccess } },
  );

  return { workspaceRole: _workspaceRole, flowTaskRole: persistedAccess.role, isCustomRole: _isCustomRole };
}

function summarizeChannel(channel) {
  return {
    _id: channel._id,
    name: channel.name,
    slug: channel.slug,
    type: channel.type,
    visibility: channel.visibility,
    lastMessageAt: channel.lastMessageAt,
    lastMessagePreview: channel.lastMessagePreview,
    memberCount: channel.memberCount,
  };
}

function getFlowTaskTokenExpiry(token) {
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.exp ? new Date(decoded.exp * 1000) : null;
  } catch {
    return null;
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

  const { chatUser, accessToken, refreshToken, emailWarning, flowTaskToken } = await authService.loginNative({
    email,
    password,
    userAgent,
  });

  if (chatUser.emailVerified) {
    await channelService.activatePendingParticipantsForUser(chatUser);
  }

  if (flowTaskToken) {
    await ChatUser.updateOne(
      { _id: chatUser._id },
      {
        $set: {
          flowTaskToken,
          flowTaskTokenExpiry: getFlowTaskTokenExpiry(flowTaskToken),
        },
      },
    );
  }

  // Fetch user's workspaces for client-side workspace selection
  const workspaces = await WorkspaceMembership.findUserWorkspaces(chatUser._id);

  res.status(200).json({
    success: true,
    data: {
      user: chatUser,
      accessToken,
      refreshToken,
      workspaces,
      ...(flowTaskToken && { flowTaskToken }),
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
  const startedAt = Date.now();
  const requestId = (req.get('X-Request-Id') || crypto.randomUUID()).slice(0, 128);
  const attemptId = req.get('X-Auth-Attempt-Id')?.slice(0, 128) || null;
  // Advisory only — used solely for a mismatch log below. The actual target
  // workspace is decided by the server-verified JWT `workspaceId` claim
  // (see authService.loginFlowTask), never by this client-supplied header.
  // Previously this header WON over the resolved workspace outright, which
  // meant any authenticated request could redirect itself into an arbitrary
  // workspace — see the `wsId` computation below.
  const explicitWorkspaceId = req.get('X-Workspace-Id');
  res.set('X-Request-Id', requestId);

  if (explicitWorkspaceId && !mongoose.Types.ObjectId.isValid(explicitWorkspaceId)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid workspace ID format' } });
  }

  let attemptClaimed = false;
  if (attemptId) {
    const tokenDigest = crypto.createHash('sha256').update(token || '').digest('hex');
    const claim = await FlowTaskAuthAttempt.claim({ attemptId, tokenDigest, requestId });
    if (!claim.acquired) {
      logger.warn('Duplicate FlowTask login request detected', {
        requestId,
        attemptId,
        existingRequestId: claim.doc?.requestId,
        existingStatus: claim.doc?.status,
      });
      return res.status(409).json({
        success: false,
        error: {
          code: claim.doc?.status === 'completed'
            ? 'AUTH_ATTEMPT_COMPLETED'
            : 'AUTH_ATTEMPT_IN_PROGRESS',
          message: claim.doc?.status === 'completed'
            ? 'This authentication attempt has already completed.'
            : 'This authentication attempt is already being processed.',
          requestId: claim.doc?.requestId,
        },
      });
    }
    attemptClaimed = true;
  }

  logger.info('FlowTask SSO login request received', {
    requestId,
    attemptId,
    hasToken: !!token,
    tokenLength: token ? token.length : 0,
    contentType: req.get('Content-Type'),
    origin: req.get('Origin'),
    referer: req.get('Referer'),
    userAgent: userAgent.substring(0, 80),
  });

  try {
    const {
      chatUser, accessToken, refreshToken,
      flowTaskWorkspaceId, flowTaskWorkspaceName, flowTaskWorkspaceSlug, flowTaskPlan, flowTaskAccess,
    } = await authService.loginFlowTask({ token, userAgent });
    logger.info('FlowTask token validated and ChatApp user resolved', {
      requestId,
      attemptId,
      chatUserId: chatUser._id,
      flowTaskUserId: chatUser.flowTaskUserId,
      flowTaskWorkspaceId,
    });

    if (explicitWorkspaceId && flowTaskWorkspaceId && explicitWorkspaceId !== flowTaskWorkspaceId) {
      logger.warn('X-Workspace-Id header does not match the JWT workspaceId claim — header ignored', {
        requestId,
        chatUserId: chatUser._id,
        explicitWorkspaceId,
        flowTaskWorkspaceId,
      });
    }

    let flowtaskWorkspace = null;
    if (env.FLOWTASK_ENABLED) {
      if (flowTaskWorkspaceId) {
        let membershipRole;
        try {
          ({ _workspaceRole: membershipRole } = normalizeFlowTaskAccess(flowTaskAccess));
        } catch (error) {
          throw new ForbiddenError(`Invalid FlowTask workspace access: ${error.message}`);
        }
        try {
          flowtaskWorkspace = await workspaceService.findOrCreateFlowTaskWorkspace({
            creatorId: chatUser._id,
            flowTaskWorkspaceId,
            workspaceName: flowTaskWorkspaceName,
            workspaceSlug: flowTaskWorkspaceSlug,
            plan: flowTaskPlan,
            membershipRole,
          });
        } catch (error) {
          if (error instanceof ForbiddenError) {
            // The Free-plan gate — this must surface as a clean 403 to the
            // caller, not a silent soft-fail into a login that "succeeds"
            // with no workspace resolved (which every other failure mode
            // below deliberately still swallows).
            throw error;
          }
          logger.error('Failed to resolve FlowTask workspace during login', {
            requestId,
            chatUserId: chatUser._id,
            flowTaskWorkspaceId,
            error: error.message,
          });
        }
      } else {
        logger.error('FlowTask SSO token has no workspaceId claim — cannot resolve a ChatApp workspace', {
          requestId,
          chatUserId: chatUser._id,
        });
      }
    }

    // No header fallback — the target workspace is decided ONLY by the
    // server-verified JWT claim resolved above, never by a client-supplied
    // header (that was the actual access-control bug being fixed here).
    const wsId = flowtaskWorkspace?._id?.toString() || null;
    let channels = [];
    let channelSync = env.FLOWTASK_ENABLED
      ? { status: wsId ? 'pending' : 'failed', workspaceId: wsId, error: wsId ? null : 'FlowTask workspace unavailable' }
      : { status: 'completed' };

    if (wsId) {
      await ensureWorkspaceMembership(chatUser._id, wsId, flowTaskAccess);
      logger.info('FlowTask workspace membership resolved', {
        requestId,
        chatUserId: chatUser._id,
        workspaceId: wsId,
      });

      const systemChannels = await channelRepository.findSystemChannels(wsId);
      await Promise.all(systemChannels.map((channel) => {
        if (channel.visibility === 'public' && !channel.hasMember(chatUser._id)) {
          return channelService.addMember(channel._id, chatUser._id, undefined, wsId).catch((error) => {
            logger.warn('System channel auto-join failed during login', {
              requestId,
              workspaceId: wsId,
              channelId: channel._id,
              error: error.message,
            });
          });
        }
        return null;
      }));

      let tokenStored = false;
      try {
        await ChatUser.updateOne(
          { _id: chatUser._id },
          {
            $set: {
              flowTaskToken: token,
              flowTaskTokenExpiry: getFlowTaskTokenExpiry(token),
            },
          },
        );
        tokenStored = true;
        logger.info('FlowTask token stored for authenticated user', {
          requestId,
          workspaceId: wsId,
          chatUserId: chatUser._id,
        });
      } catch (error) {
        channelSync = { status: 'failed', workspaceId: wsId, error: 'Unable to persist FlowTask sync credentials' };
        logger.error('FlowTask token persistence failed after authentication', {
          requestId,
          workspaceId: wsId,
          chatUserId: chatUser._id,
          error: error.message,
        });
      }

      try {
        const userChannels = await channelService.getChannelsForUser(chatUser._id, wsId);
        channels = userChannels.map(summarizeChannel);
      } catch (error) {
        logger.warn('Initial authorized channel list unavailable during login', {
          requestId,
          workspaceId: wsId,
          chatUserId: chatUser._id,
          error: error.message,
        });
      }

      if (env.FLOWTASK_ENABLED && tokenStored) {
        try {
          channelSync = await projectChannelSyncService.enqueueForUser({
            chatUser,
            workspaceId: wsId,
            requestId,
            reason: 'login',
          });
        } catch (error) {
          channelSync = { status: 'failed', workspaceId: wsId, error: error.message };
          logger.error('Failed to queue FlowTask channel-sync job', {
            requestId,
            workspaceId: wsId,
            chatUserId: chatUser._id,
            error: error.message,
          });
        }
      }
    }

    const workspaces = await WorkspaceMembership.findUserWorkspaces(chatUser._id);
    if (attemptClaimed) {
      try {
        await FlowTaskAuthAttempt.markCompleted(attemptId, 200);
      } catch (error) {
        logger.warn('FlowTask authentication attempt completion marker failed', {
          requestId,
          attemptId,
          error: error.message,
        });
      }
    }

    res.once('finish', () => {
      logger.info('FlowTask authentication response sent', {
        requestId,
        attemptId,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        chatUserId: chatUser._id,
        workspaceId: wsId,
        channelSyncJobId: channelSync.jobId,
        channelSyncStatus: channelSync.status,
      });
    });
    return res.status(200).json({
      success: true,
      data: {
        user: chatUser,
        accessToken,
        refreshToken,
        workspaceId: wsId,
        workspaces,
        channels,
        channelSync,
        flowTaskToken: token,
      },
    });
  } catch (error) {
    if (attemptClaimed) {
      try {
        await FlowTaskAuthAttempt.markFailed(attemptId, error.statusCode || 500);
      } catch {
        // Preserve the original authentication error.
      }
    }
    logger.error('FlowTask SSO login request failed', {
      requestId,
      attemptId,
      durationMs: Date.now() - startedAt,
      error: error.message,
    });
    throw error;
  }
});

/**
 * POST /api/chat/auth/sync
 * Legacy: Sync user from FlowTask JWT. (Backward compatibility)
 */
export const syncUser = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const requestId = (req.get('X-Request-Id') || crypto.randomUUID()).slice(0, 128);
  if (!token) {
    return res.status(401).json({ success: false, error: { message: 'Token required' } });
  }

  const { chatUser } = await authService.syncFlowTaskUser(token);

  const wsId = req.headers['x-workspace-id'];
  let channels = [];
  let channelSync = { status: env.FLOWTASK_ENABLED ? 'pending' : 'completed' };

  if (wsId) {
    if (!mongoose.Types.ObjectId.isValid(wsId)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid workspace ID format' } });
    }
    // Legacy tokens have no signed workspace-scoped role/access snapshot.
    // They may refresh an existing membership but can never create one from a
    // caller-controlled workspace header.
    const existingMembership = await WorkspaceMembership.isMember(chatUser._id, wsId);
    if (!existingMembership) {
      throw new ForbiddenError('Use the FlowTask Open Chat redirect to establish workspace access.');
    }

    // Auto-join public system channels
    const systemChannels = await channelRepository.findSystemChannels(wsId);
    for (const sc of systemChannels) {
      if (sc.visibility === 'public' && !sc.hasMember(chatUser._id)) {
        await channelService.addMember(sc._id, chatUser._id, undefined, wsId).catch(() => {});
      }
    }

    await ChatUser.updateOne(
      { _id: chatUser._id },
      { $set: { flowTaskToken: token, flowTaskTokenExpiry: getFlowTaskTokenExpiry(token) } },
    );

    if (env.FLOWTASK_ENABLED) {
      channelSync = await projectChannelSyncService.enqueueForUser({
        chatUser,
        workspaceId: wsId,
        requestId,
        reason: 'legacy-sync',
      });
    }

    const userChannels = await channelService.getChannelsForUser(chatUser._id, wsId);
    channels = userChannels.map(summarizeChannel);
  }

  res.status(200).json({
    success: true,
    data: {
      user: chatUser,
      channels,
      channelSync,
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

  // Derive userId: prefer req.user (if protect ran), else decode the refresh token
  let userId = req.user?._id;
  if (!userId && refreshToken) {
    try {
      const tokenService = (await import('./token.service.js')).default;
      const decoded = tokenService.verifyRefreshToken(refreshToken);
      userId = decoded?.id;
    } catch {
      // Token expired / invalid — nothing to revoke
    }
  }

  if (userId) {
    await authService.logout(userId, refreshToken);
  }

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

  const { chatUser } = await authService.verifyEmail(token);
  await channelService.activatePendingParticipantsForUser(chatUser);

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
  const workspaces = await WorkspaceMembership.findUserWorkspaces(req.user._id);

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
      workspaces,
    },
  });
});

export const getFlowTaskChannelSyncStatus = asyncHandler(async (req, res) => {
  const channelSync = await projectChannelSyncService.getStatusForUser(
    req.user._id,
    req.workspaceId,
  );
  res.status(200).json({ success: true, data: { channelSync } });
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
    'theme', 'sidebarTheme', 'customTheme', 'notificationSound', 'desktopNotifications',
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
