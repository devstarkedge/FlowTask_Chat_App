import env from '../../config/environment.js';
import userRepository from '../users/user.repository.js';
import flowTaskService from '../flowtask/flowtask.service.js';
import tokenService from './token.service.js';
import emailService from './email.service.js';
import logger from '../../utils/logger.js';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError } from '../../middleware/errorHandler.js';

/**
 * Auth Service — handles dual authentication:
 *  1. Native: email/password registration & login (Chat-issued JWTs)
 *  2. FlowTask: SSO via FlowTask JWT tokens
 *
 * Also manages refresh token rotation, email verification, and password resets.
 */

class AuthService {
  // ═══════════════════════════════════════════════════════════════════════
  // NATIVE AUTH
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Register a new native user.
   * @param {{ name: string, email: string, password: string }} data
   * @returns {Promise<{ chatUser: object, message: string }>}
   */
  async register({ name, email, password }) {
    // Check for existing user
    const existing = await userRepository.findByEmailPublic(email);
    if (existing) {
      throw new ValidationError('An account with this email already exists');
    }

    // Create user (global identity — no workspace scope)
    const chatUser = await userRepository.createNativeUser({ name, email, password });

    // Generate verification token
    const verificationToken = tokenService.generateRandomToken();
    chatUser.verificationToken = verificationToken;
    chatUser.verificationExpiry = tokenService.tokenExpiry(24); // 24 hours
    await chatUser.save();

    // Send verification email (async, don't block registration)
    emailService.sendVerificationEmail(email, name, verificationToken).catch((err) => {
      logger.error('Failed to send verification email', { email, error: err.message });
    });

    logger.info('New native user registered', { userId: chatUser._id, email });

    return {
      chatUser,
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  /**
   * Login a native user with email and password.
   * @param {{ email: string, password: string, userAgent?: string }} data
   * @returns {Promise<{ chatUser: object, accessToken: string, refreshToken: string }>}
   */
  async loginNative({ email, password, userAgent = '' }) {
    // Find user with password field
    const user = await userRepository.findByEmail(email);

    // If user is not found, or user uses FlowTask SSO, attempt FlowTask login proxy
    if (!user || user.authProvider !== 'native') {
      if (env.FLOWTASK_ENABLED) {
        try {
          const flowTaskRes = await flowTaskService.login(email, password);
          const token = flowTaskRes.data?.token || flowTaskRes.token;
          if (token) {
            logger.info('Successfully proxied email/password to FlowTask', { email });
            return this.loginFlowTask({ token, userAgent });
          }
        } catch (error) {
          if (error.response?.status === 401 || error.response?.status === 404 || error.response?.status === 400) {
            throw new UnauthorizedError('Invalid email or password');
          }
          logger.warn('Failed to authenticate against FlowTask API via email/password proxy', { error: error.message });
          if (!user) throw new UnauthorizedError('Invalid email or password');
        }
      } else if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }
    }

    // Check account is active
    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Check lockout
    if (user.isLocked()) {
      throw new UnauthorizedError('Account is temporarily locked due to too many failed attempts. Please try again later.');
    }

    // Check auth provider (Should only reach here if user.authProvider === 'native')
    if (user.authProvider !== 'native') {
      throw new UnauthorizedError('This account uses FlowTask SSO. Please log in via FlowTask.');
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      throw new UnauthorizedError('Invalid email or password');
    }

    // Reset login attempts on success
    await user.resetLoginAttempts();

    // Check email verification (allow login but flag it)
    const emailWarning = !user.emailVerified
      ? 'Please verify your email address.'
      : undefined;

    // Issue tokens (no workspaceId in JWT — workspace resolved via header)
    const accessToken = tokenService.issueAccessToken({ id: user._id.toString(), role: user.role });
    const refreshToken = tokenService.issueRefreshToken({ id: user._id.toString() });

    // Store hashed refresh token
    await userRepository.addRefreshToken(user._id, {
      tokenHash: tokenService.hashToken(refreshToken),
      expiresAt: tokenService.refreshTokenExpiryDate(),
      userAgent,
    });

    // Prune expired tokens
    await userRepository.pruneExpiredRefreshTokens(user._id);

    logger.info('Native user logged in', { userId: user._id, email });

    return {
      chatUser: user,
      accessToken,
      refreshToken,
      emailWarning,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FLOWTASK SSO AUTH
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Login/sync a FlowTask user via their FlowTask JWT.
   * Verifies the token with FLOWTASK_JWT_SECRET, fetches user from FlowTask API,
   * upserts ChatUser, and issues Chat-specific tokens.
   *
   * @param {{ token: string, userAgent?: string }} data
   * @returns {Promise<{ chatUser: object, accessToken: string, refreshToken: string }>}
   */
  async loginFlowTask({ token, userAgent = '' }) {
    if (!env.FLOWTASK_ENABLED) {
      throw new UnauthorizedError('FlowTask integration is disabled');
    }

    // 1. Verify FlowTask token
    let decoded;
    try {
      decoded = tokenService.verifyFlowTaskToken(token);
    } catch (error) {
      logger.warn('FlowTask SSO token verification failed', {
        errorName: error.name,
        errorMessage: error.message,
        tokenLength: token ? token.length : 0,
        tokenPrefix: token ? token.substring(0, 20) + '...' : '(empty)',
        hint: error.name === 'TokenExpiredError'
          ? 'Token expired (10-min window) — FlowTask must re-generate the redirect token'
          : 'Secret mismatch? Confirm FLOWTASK_JWT_SECRET (Chat backend) === CHAT_JWT_SECRET (FlowTask backend)',
        configCheck: {
          flowtaskEnabled: env.FLOWTASK_ENABLED,
          hasFlowtaskJwtSecret: !!env.FLOWTASK_JWT_SECRET,
          flowtaskJwtSecretLength: env.FLOWTASK_JWT_SECRET ? env.FLOWTASK_JWT_SECRET.length : 0,
        },
      });
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('FlowTask token expired — please return to FlowTask and try again');
      }
      throw new UnauthorizedError(`Invalid FlowTask token (${error.name})`);
    }

    // 2. Determine flow: redirect SSO (token has embedded user data) vs legacy (requires API fetch)
    let flowTaskUser;
    const isRedirectFlow = decoded.source === 'flowtask' && decoded.email && decoded.name;
    // The redirect flow's JWT already carries FlowTask's real workspace id
    // (see FlowTask's chatIntegrationController.js#getChatRedirectUrl) — the
    // legacy flow (fetch-from-API) has no workspace claim available this way.
    const flowTaskWorkspaceId = isRedirectFlow ? (decoded.workspaceId || null) : null;
    const flowTaskWorkspaceName = isRedirectFlow ? (decoded.workspaceName || null) : null;
    const flowTaskWorkspaceSlug = isRedirectFlow ? (decoded.workspaceSlug || null) : null;

    logger.debug('FlowTask SSO login attempt', {
      flowTaskUserId: decoded.id,
      source: decoded.source,
      isRedirectFlow,
      hasEmail: !!decoded.email,
      hasName: !!decoded.name,
    });

    if (isRedirectFlow) {
      // Redirect flow — user data is embedded in the JWT from FlowTask's redirect endpoint
      flowTaskUser = {
        _id: decoded.id,
        name: decoded.name,
        email: decoded.email,
        role: decoded.role || 'employee',
        avatar: decoded.avatar || '',
        isActive: true,
      };
    } else {
      // Legacy flow — fetch fresh user data from FlowTask API
      try {
        flowTaskUser = await flowTaskService.getCurrentUser(token);
      } catch (error) {
        logger.error('Failed to fetch FlowTask user during login', {
          flowTaskUserId: decoded.id,
          error: error.message,
        });
        throw new UnauthorizedError('Failed to verify user with FlowTask');
      }

      // 3. Check if user is active in FlowTask
      if (!flowTaskUser.isActive) {
        throw new UnauthorizedError('FlowTask account is deactivated');
      }
    }

    // 4. Upsert ChatUser (global identity)
    const chatUser = await userRepository.upsertFromFlowTask(flowTaskUser, {
      markRegistered: true,
      createIfMissing: true,
    });

    // 5. Issue Chat tokens (no workspaceId in JWT)
    const accessToken = tokenService.issueAccessToken({ id: chatUser._id.toString(), role: chatUser.role });
    const refreshToken = tokenService.issueRefreshToken({ id: chatUser._id.toString() });

    // 6. Store hashed refresh token
    await userRepository.addRefreshToken(chatUser._id, {
      tokenHash: tokenService.hashToken(refreshToken),
      expiresAt: tokenService.refreshTokenExpiryDate(),
      userAgent,
    });

    logger.info('FlowTask user logged in', {
      chatUserId: chatUser._id,
      flowTaskUserId: chatUser.flowTaskUserId,
      name: chatUser.name,
      flowTaskWorkspaceId,
    });

    return { chatUser, accessToken, refreshToken, flowTaskWorkspaceId, flowTaskWorkspaceName, flowTaskWorkspaceSlug };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TOKEN REFRESH
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Refresh an access token using a valid refresh token.
   * Implements token rotation: old refresh token is revoked, new one issued.
   *
   * @param {{ refreshToken: string, userAgent?: string }} data
   * @returns {Promise<{ accessToken: string, refreshToken: string }>}
   */
  async refreshAccessToken({ refreshToken, userAgent = '' }) {
    // Verify the refresh token
    let decoded;
    try {
      decoded = tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Find user
    const user = await userRepository.findById(decoded.id);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or deactivated');
    }

    // Check that this refresh token exists in the user's stored tokens
    const tokenHash = tokenService.hashToken(refreshToken);
    const storedToken = user.refreshTokens.find((t) => t.tokenHash === tokenHash);
    if (!storedToken) {
      // Possible token reuse attack — clear all refresh tokens for safety
      logger.warn('Refresh token reuse detected, clearing all tokens', { userId: user._id });
      await userRepository.clearAllRefreshTokens(user._id);
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    // Rotate: remove old token
    await userRepository.removeRefreshToken(user._id, tokenHash);

    // Issue new token pair
    const newAccessToken = tokenService.issueAccessToken({ id: user._id.toString(), role: user.role });
    const newRefreshToken = tokenService.issueRefreshToken({ id: user._id.toString() });

    // Store new hashed refresh token
    await userRepository.addRefreshToken(user._id, {
      tokenHash: tokenService.hashToken(newRefreshToken),
      expiresAt: tokenService.refreshTokenExpiryDate(),
      userAgent,
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Logout: revoke a specific refresh token.
   * @param {string} userId
   * @param {string} refreshToken
   */
  async logout(userId, refreshToken) {
    if (refreshToken) {
      const tokenHash = tokenService.hashToken(refreshToken);
      await userRepository.removeRefreshToken(userId, tokenHash);
    }
    logger.info('User logged out', { userId });
  }

  /**
   * Logout from all devices: revoke all refresh tokens.
   * @param {string} userId
   */
  async logoutAll(userId) {
    await userRepository.clearAllRefreshTokens(userId);
    logger.info('User logged out from all devices', { userId });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EMAIL VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Verify a user's email using the verification token.
   * @param {string} token
   * @returns {Promise<{ chatUser: object }>}
   */
  async verifyEmail(token) {
    const user = await userRepository.findByVerificationToken(token);
    if (!user) {
      throw new ValidationError('Invalid or expired verification token');
    }

    const chatUser = await userRepository.verifyEmail(user._id);
    logger.info('Email verified', { userId: user._id, email: user.email });
    return { chatUser };
  }

  /**
   * Resend verification email.
   * @param {string} email
   */
  async resendVerification(email) {
    const user = await userRepository.findByEmailPublic(email);
    if (!user) {
      // Don't reveal whether the email exists
      return;
    }
    if (user.emailVerified) return;
    if (user.authProvider !== 'native') return;

    const verificationToken = tokenService.generateRandomToken();
    user.verificationToken = verificationToken;
    user.verificationExpiry = tokenService.tokenExpiry(24);
    await user.save();

    await emailService.sendVerificationEmail(email, user.name, verificationToken);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PASSWORD RESET
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Request a password reset. Sends reset link to email.
   * Always returns success to prevent email enumeration.
   * @param {string} email
   */
  async requestPasswordReset(email) {
    const user = await userRepository.findByEmailPublic(email);

    // Don't reveal whether the email exists
    if (!user || user.authProvider !== 'native') return;

    const resetToken = tokenService.generateRandomToken();
    user.passwordResetToken = resetToken;
    user.passwordResetExpiry = tokenService.tokenExpiry(1); // 1 hour
    await user.save();

    await emailService.sendPasswordResetEmail(email, user.name, resetToken);
    logger.info('Password reset requested', { email });
  }

  /**
   * Reset password using a valid reset token.
   * @param {{ token: string, newPassword: string }} data
   */
  async resetPassword({ token, newPassword }) {
    const user = await userRepository.findByResetToken(token);
    if (!user) {
      throw new ValidationError('Invalid or expired reset token');
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();

    // Revoke all refresh tokens (force re-login everywhere)
    await userRepository.clearAllRefreshTokens(user._id);

    logger.info('Password reset completed', { userId: user._id });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LEGACY COMPATIBILITY
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Sync (or create) a ChatUser from FlowTask. (Legacy — used by syncUser controller)
   * @param {string} token - FlowTask JWT
   * @param {string} [workspaceId]
   * @returns {Promise<{chatUser: object}>}
   */
  async syncFlowTaskUser(token, workspaceId) {
    if (!env.FLOWTASK_ENABLED) {
      throw new UnauthorizedError('FlowTask integration is disabled');
    }

    let decoded;
    try {
      decoded = tokenService.verifyFlowTaskToken(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Token expired');
      }
      throw new UnauthorizedError('Invalid token');
    }

    let flowTaskUser;
    try {
      flowTaskUser = await flowTaskService.getCurrentUser(token);
    } catch (error) {
      logger.error('Failed to fetch FlowTask user during sync', {
        flowTaskUserId: decoded.id,
        error: error.message,
      });
      throw new UnauthorizedError('Failed to verify user with FlowTask');
    }

    if (!flowTaskUser.isActive) {
      throw new UnauthorizedError('FlowTask account is deactivated');
    }

    const chatUser = await userRepository.upsertFromFlowTask(flowTaskUser, {
      markRegistered: true,
      createIfMissing: true,
    });

    logger.info('FlowTask user synced', {
      chatUserId: chatUser._id,
      flowTaskUserId: chatUser.flowTaskUserId,
      name: chatUser.name,
    });

    return { chatUser };
  }

  /**
   * Get or create a ChatUser from a FlowTask user ID.
   * Used when processing webhook events.
   * @param {string} flowTaskUserId
   * @param {string} [workspaceId]
   * @returns {Promise<object|null>}
   */
  async getOrCreateChatUser(flowTaskUserId, workspaceId) {
    return userRepository.findByFlowTaskId(flowTaskUserId, workspaceId);
  }

  /**
   * Validate that a user has one of the required roles.
   * @param {object} user - ChatUser document
   * @param {string[]} requiredRoles
   * @throws {ForbiddenError}
   */
  validateRole(user, requiredRoles) {
    if (!user) throw new UnauthorizedError('User not found');
    if (user.role === 'admin') return;
    const normalizedRoles = requiredRoles.map((r) => r.toLowerCase());
    if (!normalizedRoles.includes(user.role)) {
      throw new ForbiddenError(`Required role: ${requiredRoles.join(' or ')}. Current role: ${user.role}`);
    }
  }

  /**
   * Check department membership.
   * @param {object} user - ChatUser document
   * @param {string} departmentId
   * @returns {boolean}
   */
  isUserInDepartment(user, departmentId) {
    if (!user || !departmentId) return false;
    if (user.role === 'admin') return true;
    return user.departmentIds.includes(departmentId);
  }
}

export default new AuthService();
