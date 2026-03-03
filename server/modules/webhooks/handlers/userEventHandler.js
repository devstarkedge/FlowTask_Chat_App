import eventBus from '../../../services/eventBus.js';
import userRepository from '../../users/user.repository.js';
import channelService from '../../channels/channel.service.js';
import channelRepository from '../../channels/channel.repository.js';
import messageService from '../../messages/message.service.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SYSTEM_CHANNELS } from '../../../config/constants.js';

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
    const { user } = payload;

    if (!user || !user._id) {
      logger.warn('user.created: missing user data');
      return;
    }

    // Upsert ChatUser
    const chatUser = await userRepository.upsertFromFlowTask(user);

    // Add to public system channels
    const generalChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.GENERAL.slug);
    if (generalChannel) {
      await channelService.addMember(generalChannel._id, chatUser._id);
    }

    // Add to department channel if applicable
    if (user.department) {
      const deptId = typeof user.department === 'string' ? user.department : user.department._id;
      const deptName = typeof user.department === 'string' ? 'Department' : user.department.name;

      if (deptId) {
        const deptChannel = await channelService.getOrCreateDepartmentChannel(deptId, deptName);
        await channelService.addMember(deptChannel._id, chatUser._id);
      }
    }

    // Post welcome in general
    if (generalChannel) {
      await messageService.sendSystemMessage(
        generalChannel._id,
        `👋 Welcome **${chatUser.name}** to the team!`,
      );
    }

    logger.info('user.created handled', {
      chatUserId: chatUser._id,
      flowTaskUserId: user._id,
    });
  });

  // ─── user.updated ──────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.USER_UPDATED, async (payload) => {
    const { user, changes, _workspaceId: wsId } = payload;

    if (!user?._id) return;

    // Upsert with latest data
    const chatUser = await userRepository.upsertFromFlowTask(user, wsId);

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
            await channelService.removeMember(oldChannel._id, chatUser._id, 'system');
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
          await channelService.addMember(newChannel._id, chatUser._id);
        }
      }
    }

    // Handle role change — update role-specific channel membership
    if (changes?.role) {
      // Admin channel
      const adminChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.ADMIN.slug, wsId);
      if (adminChannel) {
        if (changes.role.new === 'admin') {
          await channelService.addMember(adminChannel._id, chatUser._id);
        } else if (changes.role.old === 'admin') {
          await channelService.removeMember(adminChannel._id, chatUser._id, 'system');
        }
      }

      // Managers channel
      const managersChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.MANAGERS.slug, wsId);
      if (managersChannel) {
        if (changes.role.new === 'manager') {
          await channelService.addMember(managersChannel._id, chatUser._id);
        } else if (changes.role.old === 'manager') {
          await channelService.removeMember(managersChannel._id, chatUser._id, 'system');
        }
      }
    }

    logger.info('user.updated handled', {
      chatUserId: chatUser._id,
      changes: Object.keys(changes || {}),
    });
  });

  // ─── user.deactivated ──────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.USER_DEACTIVATED, async (payload) => {
    const { userId, _workspaceId: wsId } = payload;

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
    const { user, _workspaceId: wsId } = payload;

    if (!user || !user._id) {
      logger.warn('user.registered: missing user data');
      return;
    }

    // Upsert ChatUser as inactive (pending verification)
    const userData = { ...user, isActive: false };
    const chatUser = await userRepository.upsertFromFlowTask(userData, wsId);

    // Notify admins only
    const adminChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.ADMIN.slug, wsId);
    if (adminChannel) {
      await messageService.sendSystemMessage(
        adminChannel._id,
        `🆕 New user registered: **${chatUser.name}** (${user.email || 'no email'}) — pending verification`,
      );
    }

    logger.info('user.registered handled', {
      chatUserId: chatUser._id,
      flowTaskUserId: user._id,
    });
  });

  // ─── user.verified ─────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.USER_VERIFIED, async (payload) => {
    const { user, _workspaceId: wsId } = payload;

    if (!user || !user._id) {
      logger.warn('user.verified: missing user data');
      return;
    }

    // Activate user
    const chatUser = await userRepository.upsertFromFlowTask({ ...user, isActive: true }, wsId);

    // Add to #general
    const generalChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.GENERAL.slug, wsId);
    if (generalChannel) {
      await channelService.addMember(generalChannel._id, chatUser._id);
      await messageService.sendSystemMessage(
        generalChannel._id,
        `👋 Welcome **${chatUser.name}** to the team! 🎉`,
      );
    }

    // Add to department channels
    if (user.department) {
      const deptId = typeof user.department === 'string' ? user.department : user.department._id;
      const deptName = typeof user.department === 'string' ? 'Department' : user.department.name;

      if (deptId) {
        const deptChannel = await channelService.getOrCreateDepartmentChannel(deptId, deptName, wsId);
        await channelService.addMember(deptChannel._id, chatUser._id);
      }
    }

    // Add to role-specific channels
    if (chatUser.role === 'admin') {
      const adminChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.ADMIN.slug, wsId);
      if (adminChannel) {
        await channelService.addMember(adminChannel._id, chatUser._id);
      }
    }
    if (chatUser.role === 'manager') {
      const managersChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.MANAGERS.slug, wsId);
      if (managersChannel) {
        await channelService.addMember(managersChannel._id, chatUser._id);
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
