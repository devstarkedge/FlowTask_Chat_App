import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import env from '../../config/environment.js';

/**
 * Token Service — handles JWT issuance and verification for both
 * native Chat tokens and FlowTask SSO tokens.
 *
 * Token Strategy:
 *  - Access tokens: short-lived (default 15m), signed with JWT_SECRET
 *  - Refresh tokens: longer-lived (default 7d), signed with JWT_REFRESH_SECRET
 *  - FlowTask tokens: verified with FLOWTASK_JWT_SECRET (read-only, never issued here)
 */

class TokenService {
  // ─── Access Tokens (Chat-issued) ──────────────────────────────────────

  /**
   * Issue a new access token for a Chat user.
   * @param {{ id: string, role: string }} payload
   * @returns {string} JWT access token
   */
  issueAccessToken(payload) {
    const claims = { id: payload.id, role: payload.role, type: 'access' };
    return jwt.sign(
      claims,
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRY },
    );
  }

  /**
   * Verify a Chat-issued access token.
   * @param {string} token
   * @returns {{ id: string, role: string, type: string, iat: number, exp: number }}
   * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError}
   */
  verifyAccessToken(token) {
    return jwt.verify(token, env.JWT_SECRET);
  }

  // ─── Refresh Tokens ────────────────────────────────────────────────────

  /**
   * Issue a new refresh token.
   * @param {{ id: string }} payload
   * @returns {string} JWT refresh token
   */
  issueRefreshToken(payload) {
    const claims = { id: payload.id, type: 'refresh' };
    return jwt.sign(
      claims,
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.REFRESH_TOKEN_EXPIRY },
    );
  }

  /**
   * Verify a refresh token.
   * @param {string} token
   * @returns {{ id: string, type: string, iat: number, exp: number }}
   * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError}
   */
  verifyRefreshToken(token) {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
  }

  /**
   * Hash a refresh token for safe storage in the database.
   * @param {string} token
   * @returns {string} SHA-256 hash
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // ─── FlowTask Tokens (verify only) ────────────────────────────────────

  /**
   * Verify a FlowTask-issued JWT token.
   * @param {string} token
   * @returns {object} Decoded token payload
   * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError}
   */
  verifyFlowTaskToken(token) {
    if (!env.FLOWTASK_ENABLED) {
      throw new Error('FlowTask integration is disabled');
    }
    return jwt.verify(token, env.FLOWTASK_JWT_SECRET, {
      clockTolerance: 30, // Allow 30s clock skew between Render instances
    });
  }

  // ─── Utility Tokens (email verification, password reset) ──────────────

  /**
   * Generate a cryptographically random token for email verification / password reset.
   * @returns {string} 64-char hex token
   */
  generateRandomToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Compute token expiry date.
   * @param {number} hoursFromNow - Default 24 hours
   * @returns {Date}
   */
  tokenExpiry(hoursFromNow = 24) {
    return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  }

  /**
   * Compute refresh token expiry as a Date (for DB storage).
   * Parses env.REFRESH_TOKEN_EXPIRY (e.g. '7d', '24h').
   * @returns {Date}
   */
  refreshTokenExpiryDate() {
    const raw = env.REFRESH_TOKEN_EXPIRY;
    const match = raw.match(/^(\d+)([dhms])$/);
    if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default 7d

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
    return new Date(Date.now() + value * (multipliers[unit] || 86400000));
  }
}

export default new TokenService();
