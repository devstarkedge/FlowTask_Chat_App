import eventBus from '../../../services/eventBus.js';
import userRepository from '../../users/user.repository.js';
import channelService from '../../channels/channel.service.js';
import channelRepository from '../../channels/channel.repository.js';
import messageService from '../../messages/message.service.js';
import roleSyncService from '../../../services/roleSync.service.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SYSTEM_CHANNELS } from '../../../config/constants.js';

function requireWorkspaceId(payload, eventName) {
  const wsId = payload?._workspaceId;
  if (!wsId) {
    logger.warn(`${eventName}: missing _workspaceId, skipping event`);
    return null;
  }
  return wsId;
}

/**
 * User Event Handler — handles FlowTask user lifecycle events.
 *
 * Events:
 *   user.created     — Sync user to ChatUser, add to system channels
 *   user.updated     — Update ChatUser fields (name, email, role, department, avatar)
 *   user.deactivated — Deactivate ChatUser, remove from channels
 */

export function registerUserEventHandlers() {
  // ─── user.created ──────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.USER_CREATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.USER_CREATED);
    if (!wsId) return;

    const { user } = payload;

    if (!user || !user._id) {
      logger.warn('user.created: missing user data');
      return;
    }

    // Upsert ChatUser
    const chatUser = await userRepository.upsertFromFlowTask(user, wsId);
    if (!chatUser) {
      logger.info('FlowTask user retained as external identity until ChatApp login', {
        flowTaskUserId: user._id,
      });
      return;
    }

    // Add to public system channels
    const generalChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.GENERAL.slug, wsId);
    if (generalChannel) {
      await channelService.addMember(generalChannel._id, chatUser._id, undefined, wsId);
    }

    // Add to department channel if applicable
    if (user.department) {
      const deptId = typeof user.department === 'string' ? user.department : user.department._id;
      const deptName = typeof user.department === 'string' ? 'Department' : user.department.name;

      if (deptId) {
        const deptChannel = await channelService.getOrCreateDepartmentChannel(deptId, deptName, wsId);
        await channelService.addMember(deptChannel._id, chatUser._id, undefined, wsId);
      }
    }

    // Post welcome in general
    if (generalChannel) {
      await messageService.sendSystemMessage(
        generalChannel._id,
        `👋 Welcome **${chatUser.name}** to the team!`,
        undefined,
        wsId,
      );
    }

    logger.info('user.created handled', {
      chatUserId: chatUser._id,
      flowTaskUserId: user._id,
    });
  });

  // ─── user.updated ──────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.USER_UPDATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.USER_UPDATED);
    if (!wsId) return;

    const { user, changes } = payload;

    logger.info('[UserEventHandler] USER_UPDATED received', {
      userId: user?._id,
      userRole: user?.role,
      hasChanges: !!changes,
      changesKeys: changes ? Object.keys(changes) : [],
      changesRole: changes?.role,
      workspaceId: wsId,
    });

    if (!user?._id) {
      logger.warn('[UserEventHandler] USER_UPDATED: missing user._id', { payload });
      return;
    }

    // Get existing ChatUser BEFORE updating to detect role changes
    const existingChatUser = await userRepository.findByFlowTaskId(user._id);
    const oldRole = existingChatUser?.role;

    // Upsert with latest data
    const chatUser = await userRepository.upsertFromFlowTask(user, wsId);
    if (!chatUser) {
      logger.info('Ignored profile update for unregistered ChatApp identity', {
        flowTaskUserId: user._id,
      });
      return;
    }
    
    logger.info('[UserEventHandler] ChatUser upserted', {
      chatUserId: chatUser._id,
      chatUserRole: chatUser.role,
      oldRole,
      newRole: chatUser.role,
    });

    // Handle department change
    if (changes?.department) {
      // Remove from old department channel
      if (changes.department.old) {
        const oldDeptId = typeof changes.department.old === 'string'
          ? changes.department.old
          : changes.department.old._id;

        if (oldDeptId) {
          const oldChannel = await channelRepository.findByFlowTaskRef('department', oldDeptId, wsId);
          if (oldChannel) {
            await channelService.removeMember(oldChannel._id, chatUser._id, 'system', wsId);
          }
        }
      }

      // Add to new department channel
      if (changes.department.new) {
        const newDeptId = typeof changes.department.new === 'string'
          ? changes.department.new
          : changes.department.new._id;
        const newDeptName = typeof changes.department.new === 'string'
          ? 'Department'
          : changes.department.new.name;

        if (newDeptId) {
          const newChannel = await channelService.getOrCreateDepartmentChannel(newDeptId, newDeptName, wsId);
          await channelService.addMember(newChannel._id, chatUser._id, undefined, wsId);
        }
      }
    }

    // Handle role change — detect from changes object OR by comparing old vs new
    const hasRoleChange = changes?.role || (oldRole && oldRole !== chatUser.role);
    const effectiveOldRole = changes?.role?.old || oldRole;
    const effectiveNewRole = changes?.role?.new || chatUser.role;

    if (hasRoleChange && effectiveOldRole !== effectiveNewRole) {
      logger.info('[UserEventHandler] Processing role change', {
        oldRole: effectiveOldRole,
        newRole: effectiveNewRole,
        chatUserId: chatUser._id,
        source: changes?.role ? 'changes.role' : 'direct comparison',
      });
      
      // Admin channel
      const adminChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.ADMIN.slug, wsId);
      if (adminChannel) {
        if (effectiveNewRole === 'admin' || effectiveNewRole === 'manager') {
          await channelService.addMember(adminChannel._id, chatUser._id, undefined, wsId);
        } else if (effectiveOldRole === 'admin' || effectiveOldRole === 'manager') {
          await channelService.removeMember(adminChannel._id, chatUser._id, 'system', wsId);
        }
      }

      // Managers channel
      const managersChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.MANAGERS.slug, wsId);
      if (managersChannel) {
        if (effectiveNewRole === 'manager') {
          await channelService.addMember(managersChannel._id, chatUser._id, undefined, wsId);
        } else if (effectiveOldRole === 'manager') {
          await channelService.removeMember(managersChannel._id, chatUser._id, 'system', wsId);
        }
      }

      // Update WorkspaceMembership role and emit socket event to notify clients
      logger.info('[UserEventHandler] Calling roleSyncService.syncUserRole', {
        flowTaskUserId: user._id,
        newRole: effectiveNewRole,
        workspaceId: wsId,
      });
      
      await roleSyncService.syncUserRole(user._id, effectiveNewRole, wsId);
    }

    logger.info('user.updated handled', {
      chatUserId: chatUser._id,
      changes: Object.keys(changes || {}),
      roleChanged: hasRoleChange,
    });
  });

  // ─── user.deactivated ──────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.USER_DEACTIVATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.USER_DEACTIVATED);
    if (!wsId) return;

    const { userId } = payload;

    if (!userId) return;

    const chatUser = await userRepository.findByFlowTaskId(userId, wsId);
    if (!chatUser) return;

    await userRepository.deactivate(chatUser._id);

    logger.info('user.deactivated handled', {
      chatUserId: chatUser._id,
      flowTaskUserId: userId,
    });
  });

  // ─── user.registered ───────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.USER_REGISTERED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.USER_REGISTERED);
    if (!wsId) return;

    const { user } = payload;

    if (!user || !user._id) {
      logger.warn('user.registered: missing user data');
      return;
    }

    // Upsert ChatUser as inactive (pending verification)
    const userData = { ...user, isActive: false };
    const chatUser = await userRepository.upsertFromFlowTask(userData, wsId);
    if (!chatUser) {
      logger.info('FlowTask registration did not provision a ChatApp account', {
        flowTaskUserId: user._id,
      });
      return;
    }

    // Notify admins only
    const adminChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.ADMIN.slug, wsId);
    if (adminChannel) {
      await messageService.sendSystemMessage(
        adminChannel._id,
        `🆕 New user registered: **${chatUser.name}** (${user.email || 'no email'}) — pending verification`,
        undefined,
        wsId,
      );
    }

    logger.info('user.registered handled', {
      chatUserId: chatUser._id,
      flowTaskUserId: user._id,
    });
  });

  // ─── user.verified ─────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.USER_VERIFIED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.USER_VERIFIED);
    if (!wsId) return;

    const { user } = payload;

    if (!user || !user._id) {
      logger.warn('user.verified: missing user data');
      return;
    }

    // Activate user
    const chatUser = await userRepository.upsertFromFlowTask({ ...user, isActive: true }, wsId);
    if (!chatUser) {
      logger.info('FlowTask verification did not provision a ChatApp account', {
        flowTaskUserId: user._id,
      });
      return;
    }

    // Add to #general
    const generalChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.GENERAL.slug, wsId);
    if (generalChannel) {
      await channelService.addMember(generalChannel._id, chatUser._id, undefined, wsId);
      await messageService.sendSystemMessage(
        generalChannel._id,
        `👋 Welcome **${chatUser.name}** to the team! 🎉`,
        undefined,
        wsId,
      );
    }

    // Add to department channels
    if (user.department) {
      const deptId = typeof user.department === 'string' ? user.department : user.department._id;
      const deptName = typeof user.department === 'string' ? 'Department' : user.department.name;

      if (deptId) {
        const deptChannel = await channelService.getOrCreateDepartmentChannel(deptId, deptName, wsId);
        await channelService.addMember(deptChannel._id, chatUser._id, undefined, wsId);
      }
    }

    // Add to role-specific channels
    if (chatUser.role === 'admin') {
      const adminChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.ADMIN.slug, wsId);
      if (adminChannel) {
        await channelService.addMember(adminChannel._id, chatUser._id, undefined, wsId);
      }
    }
    if (chatUser.role === 'manager') {
      const managersChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.MANAGERS.slug, wsId);
      if (managersChannel) {
        await channelService.addMember(managersChannel._id, chatUser._id, undefined, wsId);
      }
    }

    // Notify admin channel
    const adminChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.ADMIN.slug, wsId);
    if (adminChannel) {
      await messageService.sendSystemMessage(
        adminChannel._id,
        `✅ User verified: **${chatUser.name}** (${user.email || 'no email'}), Role: ${chatUser.role}`,
        undefined,
        wsId,
      );
    }

    // Notify managers channel if user is in a department
    if (user.department) {
      const managersChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.MANAGERS.slug, wsId);
      if (managersChannel) {
        const deptName = typeof user.department === 'object' ? user.department.name : 'their department';
        await messageService.sendSystemMessage(
          managersChannel._id,
          `✅ New verified user **${chatUser.name}** joined ${deptName}`,
          undefined,
          wsId,
        );
      }
    }

    logger.info('user.verified handled', {
      chatUserId: chatUser._id,
      flowTaskUserId: user._id,
    });
  });

  logger.info('User event handlers registered');
}
