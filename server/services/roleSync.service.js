import userRepository from '../modules/users/user.repository.js';
import WorkspaceMembership from '../modules/workspaces/WorkspaceMembership.model.js';
import { emitToUser, emitToWorkspace, leaveChannelRoom } from '../sockets/socketManager.js';
import { SOCKET_EVENTS } from '../config/constants.js';
import logger from '../utils/logger.js';
import { purgeUnauthorizedProjectActivity } from '../modules/flowtask/projectAccess.service.js';
import { normalizeFlowTaskAccess } from '../modules/flowtask/flowTaskWorkspaceRoleMap.js';

/**
 * Role Synchronization Service
 * Handles user role updates from FlowTask and propagates changes to ChatApp.
 */

class RoleSyncService {
  /**
   * Sync user role from FlowTask to ChatApp workspace membership.
   * Emits socket event to notify all connected clients.
   * 
   * @param {string} userId - FlowTask user ID
   * @param {string} newRole - New role from FlowTask
   * @param {string} workspaceId - Target workspace ID
   * @returns {Promise<boolean>} Success status
   */
  async syncUserRole(userId, newRole, workspaceId, flowTaskAccess = null) {
    try {
      logger.info('[RoleSync] Starting role sync', { userId, newRole, workspaceId });
      
      // Find ChatUser by FlowTask user ID
      const chatUser = await userRepository.findByFlowTaskId(userId);
      if (!chatUser) {
        logger.warn('[RoleSync] ChatUser not found for FlowTask user', { userId, workspaceId });
        return false;
      }

      logger.info('[RoleSync] Found ChatUser', { 
        chatUserId: chatUser._id, 
        flowTaskUserId: userId,
        currentChatUserRole: chatUser.role 
      });

      const incomingAccess = flowTaskAccess || { role: newRole };
      let normalizedAccess;
      try {
        normalizedAccess = normalizeFlowTaskAccess(incomingAccess);
      } catch (error) {
        // Do not revoke or grant anything based on a malformed/unknown role.
        // The next signed FlowTask event can retry with a complete snapshot.
        logger.error('[RoleSync] Rejected invalid FlowTask workspace access', {
          userId,
          workspaceId,
          error: error.message,
        });
        return false;
      }
      const { _workspaceRole: nextWorkspaceRole, _isCustomRole, ...nextAccess } = normalizedAccess;

      // A signed user webhook can reach ChatApp before this user has opened
      // Chat. Provision the exact workspace membership here; never invent a
      // default Chat member role for a FlowTask identity.
      let membership = await WorkspaceMembership.findOne({
        userId: chatUser._id,
        workspaceId,
        isActive: true,
      });
      if (!membership) {
        membership = await WorkspaceMembership.addMember(
          chatUser._id,
          workspaceId,
          nextWorkspaceRole,
        );
        logger.info('[RoleSync] Provisioned workspace membership from FlowTask access', {
          chatUserId: chatUser._id, 
          workspaceId,
          workspaceRole: nextWorkspaceRole,
        });
      }

      const oldAccess = membership.flowTaskAccess?.toObject?.()
        || membership.flowTaskAccess
        || {};
      const oldFlowTaskRole = oldAccess.role || null;
      const oldWorkspaceRole = membership.role;
      const comparableOld = { ...oldAccess, syncedAt: undefined };
      const comparableNext = { ...nextAccess, syncedAt: undefined };
      const changed = membership.role !== nextWorkspaceRole
        || JSON.stringify(comparableOld) !== JSON.stringify(comparableNext);

      if (changed) {
        membership.role = nextWorkspaceRole;
        membership.flowTaskAccess = nextAccess;
        await membership.save();

        const revokedChannelIds = await purgeUnauthorizedProjectActivity(
          chatUser._id,
          workspaceId,
          membership,
        );
        for (const channelId of revokedChannelIds) {
          emitToUser(
            chatUser._id.toString(),
            SOCKET_EVENTS.CHANNEL_REMOVED,
            { channelId },
            workspaceId,
          );
          await leaveChannelRoom(chatUser._id.toString(), channelId, workspaceId);
        }

        logger.info('[RoleSync] User role updated in DB', {
          chatUserId: chatUser._id,
          flowTaskUserId: userId,
          oldFlowTaskRole,
          newFlowTaskRole: nextAccess.role,
          oldWorkspaceRole,
          newWorkspaceRole: nextWorkspaceRole,
          isCustomRole: _isCustomRole,
          workspaceId,
        });

        // Emit socket event to user's personal room 
        const userRolePayload = {
          userId: chatUser._id.toString(),
          oldRole: oldWorkspaceRole,
          newRole: nextWorkspaceRole,
          flowTaskRole: nextAccess.role,
          oldFlowTaskRole,
          workspaceId,
          timestamp: new Date().toISOString(),
        };
        
        logger.info('[RoleSync] Emitting USER_ROLE_UPDATED', {
          chatUserId: chatUser._id,
          payload: userRolePayload,
        });
        
        emitToUser(
          chatUser._id.toString(),
          SOCKET_EVENTS.USER_ROLE_UPDATED,
          userRolePayload,
          workspaceId
        );

        emitToUser(
          chatUser._id.toString(),
          SOCKET_EVENTS.CHANNEL_LIST_INVALIDATED,
          { workspaceId, reason: 'flowtask_access_changed' },
          workspaceId,
        );

        logger.info('[RoleSync] Emitted user:role_updated to personal room', {
          chatUserId: chatUser._id,
          workspaceId,
        });

        // Emit to workspace room (so other members see the update)
        const workspacePayload = {
          userId: chatUser._id.toString(),
          newRole: nextWorkspaceRole,
          flowTaskRole: nextAccess.role,
          workspaceId,
          updatedBy: null,
          timestamp: new Date().toISOString(),
        };
        
        logger.info('[RoleSync] Emitting WORKSPACE_MEMBER_UPDATED', {
          payload: workspacePayload,
        });
        
        emitToWorkspace(
          workspaceId,
          SOCKET_EVENTS.WORKSPACE_MEMBER_UPDATED,
          workspacePayload
        );

        logger.info('[RoleSync] Emitted workspace:member_updated to workspace room', {
          workspaceId,
          affectedUserId: chatUser._id,
        });

        // Clear any cached permissions for this user
        await this._clearPermissionCache(chatUser._id, workspaceId);

        return true;
      }

      logger.info('[RoleSync] No FlowTask access change needed', {
        chatUserId: chatUser._id,
        currentFlowTaskRole: oldFlowTaskRole,
        incomingRole: nextAccess.role,
        workspaceId,
      });
      return false; // No change needed
    } catch (error) {
      logger.error('[RoleSync] Failed to sync user role', {
        userId,
        newRole,
        workspaceId,
        error: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  /**
   * Sync user profile updates (name, avatar, email) from FlowTask.
   * 
   * @param {string} userId - FlowTask user ID
   * @param {object} updates - Profile updates from FlowTask
   * @param {string} workspaceId - Target workspace ID
   * @returns {Promise<boolean>}
   */
  async syncUserProfile(userId, updates, workspaceId) {
    try {
      const chatUser = await userRepository.findByFlowTaskId(userId);
      if (!chatUser) {
        logger.warn('[RoleSync] ChatUser not found for profile update', { userId, workspaceId });
        return false;
      }

      const allowedUpdates = {};
      if (updates.name) allowedUpdates.name = updates.name;
      if (updates.email) allowedUpdates.email = updates.email;
      if (updates.avatar) allowedUpdates.avatar = updates.avatar;

      if (Object.keys(allowedUpdates).length === 0) {
        return false;
      }

      await userRepository.update(chatUser._id, allowedUpdates);

      logger.info('[RoleSync] User profile updated', {
        chatUserId: chatUser._id,
        flowTaskUserId: userId,
        fields: Object.keys(allowedUpdates),
        workspaceId,
      });

      // Emit socket event
      emitToUser(
        chatUser._id.toString(),
        SOCKET_EVENTS.USER_PROFILE_UPDATED,
        {
          userId: chatUser._id,
          updates: allowedUpdates,
          workspaceId,
          timestamp: new Date().toISOString(),
        },
        workspaceId
      );

      return true;
    } catch (error) {
      logger.error('[RoleSync] Failed to sync user profile', {
        userId,
        workspaceId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Clear cached permissions for a user in a workspace.
   * @private
   */
  async _clearPermissionCache(userId, workspaceId) {
    try {
      const cacheService = (await import('./cache.service.js')).default;
      
      // Clear specific keys
      await cacheService.del(`permissions:${userId}:${workspaceId}`);
      await cacheService.del(`membership:${userId}:${workspaceId}`);
      await cacheService.del(`capabilities:${userId}:${workspaceId}`);
      
      // Clear pattern-based keys to catch all related caches
      await cacheService.delPattern(`permissions:${userId}:*`);
      await cacheService.delPattern(`membership:${userId}:*`);
      await cacheService.delPattern(`capabilities:${userId}:*`);
      
      logger.debug('[RoleSync] Permission caches cleared', { userId, workspaceId });
    } catch (error) {
      logger.warn('[RoleSync] Failed to clear permission cache', { 
        userId, 
        workspaceId, 
        error: error.message 
      });
    }
  }
}

export default new RoleSyncService();
