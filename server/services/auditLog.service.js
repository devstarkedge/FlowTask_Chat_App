import AuditLog from '../modules/admin/AuditLog.model.js';
import logger from '../utils/logger.js';

/**
 * Audit Log Service — fire-and-forget logging for significant system actions.
 *
 * All methods are non-blocking and never throw to the caller.
 * Failures are logged but do not affect the primary operation.
 */

class AuditLogService {
  /**
   * Log an audit event.
   *
   * @param {object} params
   * @param {string} params.action - One of AUDIT_ACTIONS
   * @param {string} params.entityType - 'channel' | 'user' | 'workspace' | 'member'
   * @param {string} params.entityId - The entity's ID
   * @param {string|null} [params.actorId] - The user who performed the action (null = system)
   * @param {string} [params.actorName] - Display name of the actor
   * @param {object} [params.details] - Action-specific details (oldValue, newValue, source)
   * @param {object} [params.metadata] - Request metadata (ip, userAgent, deliveryId)
   * @param {string} params.workspaceId - Workspace scope
   */
  log({ action, entityType, entityId, actorId = null, actorName = 'System', details = {}, metadata = {}, workspaceId }) {
    // Fire-and-forget: do not await, do not throw
    AuditLog.create({
      workspaceId,
      action,
      entityType,
      entityId: entityId?.toString(),
      actorId,
      actorName,
      details,
      metadata,
    }).catch((err) => {
      logger.warn('AuditLog: failed to write audit entry', {
        action,
        entityType,
        entityId,
        error: err.message,
      });
    });
  }

  /**
   * Log channel creation.
   */
  logChannelCreated(channel, actorId, actorName, workspaceId, source = 'webhook') {
    this.log({
      action: 'CHANNEL_CREATED',
      entityType: 'channel',
      entityId: channel._id,
      actorId,
      actorName,
      details: {
        channelName: channel.name,
        channelType: channel.type,
        flowTaskRef: channel.flowTaskRef,
        source,
      },
      workspaceId,
    });
  }

  /**
   * Log member added to channel.
   */
  logMemberAdded(channelId, channelName, userId, userName, workspaceId, source = 'sync') {
    this.log({
      action: 'MEMBER_ADDED',
      entityType: 'member',
      entityId: channelId,
      actorName: 'System',
      details: {
        channelName,
        userId: userId?.toString(),
        userName,
        source,
      },
      workspaceId,
    });
  }

  /**
   * Log member removed from channel.
   */
  logMemberRemoved(channelId, channelName, userId, userName, workspaceId, source = 'manual') {
    this.log({
      action: 'MEMBER_REMOVED',
      entityType: 'member',
      entityId: channelId,
      actorName: 'System',
      details: {
        channelName,
        userId: userId?.toString(),
        userName,
        source,
      },
      workspaceId,
    });
  }

  /**
   * Log channel archived.
   */
  logChannelArchived(channelId, channelName, actorId, actorName, workspaceId) {
    this.log({
      action: 'CHANNEL_ARCHIVED',
      entityType: 'channel',
      entityId: channelId,
      actorId,
      actorName,
      details: { channelName },
      workspaceId,
    });
  }

  /**
   * Log webhook event processed.
   */
  logWebhookProcessed(eventName, deliveryId, workspaceId, details = {}) {
    this.log({
      action: 'WEBHOOK_PROCESSED',
      entityType: 'workspace',
      entityId: workspaceId,
      details: { eventName, deliveryId, ...details },
      workspaceId,
    });
  }

  /**
   * Log user activation (faded → active).
   */
  logUserActivated(userId, userName, channelIds, workspaceId) {
    this.log({
      action: 'USER_ACTIVATED',
      entityType: 'user',
      entityId: userId,
      details: { userName, channelsJoined: channelIds.length },
      workspaceId,
    });
  }

  /**
   * Log invite created.
   */
  logInviteCreated(invite, actorId, actorName, workspaceId) {
    this.log({
      action: 'INVITE_CREATED',
      entityType: 'invite',
      entityId: invite._id,
      actorId,
      actorName,
      details: {
        email: invite.email,
        inviteType: invite.inviteType,
        role: invite.role,
      },
      workspaceId,
    });
  }

  /**
   * Log invite resent.
   */
  logInviteResent(inviteId, actorId, actorName, workspaceId) {
    this.log({
      action: 'INVITE_RESENT',
      entityType: 'invite',
      entityId: inviteId,
      actorId,
      actorName,
      details: {},
      workspaceId,
    });
  }

  /**
   * Log invite accepted.
   */
  logInviteAccepted(inviteId, userId, workspaceId) {
    this.log({
      action: 'INVITE_ACCEPTED',
      entityType: 'invite',
      entityId: inviteId,
      actorId: userId,
      actorName: 'User',
      details: { userId: userId?.toString() },
      workspaceId,
    });
  }

  /**
   * Log invite revoked.
   */
  logInviteRevoked(inviteId, actorId, actorName, workspaceId) {
    this.log({
      action: 'INVITE_REVOKED',
      entityType: 'invite',
      entityId: inviteId,
      actorId,
      actorName,
      details: {},
      workspaceId,
    });
  }
}

export default new AuditLogService();
