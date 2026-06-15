import roleSyncService from '../../services/roleSync.service.js';
import eventBus from '../../services/eventBus.js';
import logger from '../../utils/logger.js';

/**
 * User Webhook Handlers
 * Process user-related events from FlowTask (role updates, profile changes, etc.)
 */

/**
 * Handle user role updated event
 */
export async function handleUserRoleUpdated(payload) {
  const { user, userId, role, newRole, _workspaceId } = payload;
  
  const targetUserId = user?._id || user?.id || userId;
  const targetRole = newRole || role;

  if (!targetUserId || !targetRole || !_workspaceId) {
    logger.warn('[UserWebhook] Missing required fields for role update', {
      hasUserId: !!targetUserId,
      hasRole: !!targetRole,
      hasWorkspace: !!_workspaceId,
    });
    return;
  }

  logger.info('[UserWebhook] Processing user role update', {
    userId: targetUserId,
    role: targetRole,
    workspaceId: _workspaceId,
  });

  await roleSyncService.syncUserRole(targetUserId, targetRole, _workspaceId);
}

/**
 * Handle user profile updated event
 */
export async function handleUserProfileUpdated(payload) {
  const { user, userId, updates, _workspaceId } = payload;

  const targetUserId = user?._id || user?.id || userId;

  if (!targetUserId || !_workspaceId) {
    logger.warn('[UserWebhook] Missing required fields for profile update', {
      hasUserId: !!targetUserId,
      hasWorkspace: !!_workspaceId,
    });
    return;
  }

  const profileUpdates = updates || {
    name: user?.name,
    email: user?.email,
    avatar: user?.avatar,
  };

  logger.info('[UserWebhook] Processing user profile update', {
    userId: targetUserId,
    fields: Object.keys(profileUpdates),
    workspaceId: _workspaceId,
  });

  await roleSyncService.syncUserProfile(targetUserId, profileUpdates, _workspaceId);
}

/**
 * Handle user activated/deactivated events
 */
export async function handleUserStatusChanged(payload) {
  const { user, userId, isActive, _workspaceId } = payload;

  const targetUserId = user?._id || user?.id || userId;

  if (!targetUserId || !_workspaceId) {
    return;
  }

  logger.info('[UserWebhook] Processing user status change', {
    userId: targetUserId,
    isActive,
    workspaceId: _workspaceId,
  });

  // Update ChatUser isActive status
  const userRepository = (await import('../users/user.repository.js')).default;
  const chatUser = await userRepository.findByFlowTaskId(targetUserId);
  
  if (chatUser) {
    await userRepository.update(chatUser._id, { isActive });
  }
}

// Register event handlers on the event bus
eventBus.on('user:role_updated', handleUserRoleUpdated);
eventBus.on('user:updated', handleUserProfileUpdated);
eventBus.on('user:profile_updated', handleUserProfileUpdated);
eventBus.on('user:status_changed', handleUserStatusChanged);
eventBus.on('user:activated', (payload) => handleUserStatusChanged({ ...payload, isActive: true }));
eventBus.on('user:deactivated', (payload) => handleUserStatusChanged({ ...payload, isActive: false }));

logger.info('[UserWebhook] User event handlers registered');
