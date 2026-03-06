import Channel from './Channel.model.js';
import ChannelMember from './ChannelMember.model.js';
import channelRepository from './channel.repository.js';
import userRepository from '../users/user.repository.js';
import { emitToChannel, emitToUser, joinChannelRoom } from '../../sockets/socketManager.js';
import { slugify, projectChannelSlug, departmentChannelSlug, teamChannelSlug, appendCollisionSuffix } from '../../utils/slugify.js';
import { sanitizeHtml, stripHtml, truncate } from '../../utils/sanitize.js';
import logger from '../../utils/logger.js';
import { CHANNEL_TYPES, CHANNEL_VISIBILITY, SYSTEM_CHANNELS, SOCKET_EVENTS, CHANNEL_MEMBER_ROLES } from '../../config/constants.js';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../../middleware/errorHandler.js';

/**
 * Channel Service — business logic for channel CRUD, membership, and FlowTask entity mapping.
 *
 * Key rules from spec §4.2:
 *   - Project channels auto-created on project.created webhook
 *   - Department channels auto-created on first need
 *   - DM channels created on first message between two users
 *   - System channels bootstrapped on first server boot
 */

class ChannelService {
  // ──────────────────── Channel Creation ────────────────────────────────────

  /**
   * Create a project channel from a FlowTask project (board) event.
   * Called by webhook handler on project.created.
   */
  async createProjectChannel(board, creatorFlowTaskId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError('workspaceId is required to create a project channel');
    }

    const boardId = board._id || board.id;
    const boardName = board.name || board.title;
    const deptName = typeof board.department === 'object'
      ? (board.department?.name || 'general')
      : 'general';

    const existing = await channelRepository.findByFlowTaskRef('board', boardId, workspaceId);
    if (existing) {
      logger.info('Project channel already exists', { boardId, slug: existing.slug });
      return existing;
    }

    const creator = creatorFlowTaskId
      ? await userRepository.findByFlowTaskId(creatorFlowTaskId, workspaceId)
      : null;

    let slug = projectChannelSlug(deptName, boardName, boardId);
    if (await channelRepository.slugExists(slug, workspaceId)) {
      slug = appendCollisionSuffix(slug, boardId);
    }

    const members = [];
    if (creator) {
      members.push({ userId: creator._id, role: CHANNEL_MEMBER_ROLES.OWNER });
    }

    const channel = await channelRepository.create({
      name: boardName,
      slug,
      type: CHANNEL_TYPES.PROJECT,
      flowTaskRef: { entityType: 'board', entityId: boardId },
      description: board.description ? truncate(stripHtml(board.description), 200) : '',
      visibility: board.visibility === 'public'
        ? CHANNEL_VISIBILITY.PUBLIC
        : CHANNEL_VISIBILITY.PRIVATE,
      members,
      memberCount: members.length,
      workspaceId,
      systemManaged: true,
      adminOverrides: { allowRename: false, allowArchive: false, allowMemberEdit: false },
    });

    logger.info('Project channel created', {
      channelId: channel._id,
      slug,
      boardId,
    });

    return channel;
  }

  /**
   * Create or get a department channel.
   */
  async getOrCreateDepartmentChannel(departmentId, departmentName, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError('workspaceId is required to create a department channel');
    }

    const existing = await channelRepository.findByFlowTaskRef('department', departmentId, workspaceId);
    if (existing) return existing;

    let slug = departmentChannelSlug(departmentName, departmentId);
    if (await channelRepository.slugExists(slug, workspaceId)) {
      slug = appendCollisionSuffix(slug, departmentId);
    }

    const channel = await channelRepository.create({
      name: departmentName,
      slug,
      type: CHANNEL_TYPES.DEPARTMENT,
      flowTaskRef: { entityType: 'department', entityId: departmentId },
      visibility: CHANNEL_VISIBILITY.PRIVATE,
      members: [],
      memberCount: 0,
      workspaceId,
    });

    logger.info('Department channel created', {
      channelId: channel._id,
      slug,
      departmentId,
    });

    return channel;
  }

  /**
   * Create or get a team channel.
   */
  async getOrCreateTeamChannel(teamId, teamName, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError('workspaceId is required to create a team channel');
    }

    const existing = await channelRepository.findByFlowTaskRef('team', teamId, workspaceId);
    if (existing) return existing;

    let slug = teamChannelSlug(teamName, teamId);
    if (await channelRepository.slugExists(slug, workspaceId)) {
      slug = appendCollisionSuffix(slug, teamId);
    }

    const channel = await channelRepository.create({
      name: teamName,
      slug,
      type: CHANNEL_TYPES.TEAM,
      flowTaskRef: { entityType: 'team', entityId: teamId },
      visibility: CHANNEL_VISIBILITY.PRIVATE,
      members: [],
      memberCount: 0,
      workspaceId,
    });

    logger.info('Team channel created', { channelId: channel._id, slug, teamId });
    return channel;
  }

  /**
   * Create or get a DM channel between two users.
   * Both user IDs must be valid ChatUser _id values within the same workspace.
   *
   * @param {string} user1Id - ChatUser _id of the initiating user
   * @param {string} user2Id - ChatUser _id of the target user
   * @param {string} workspaceId - Workspace scope (required)
   * @returns {Promise<Channel>}
   */
  async getOrCreateDM(user1Id, user2Id, workspaceId) {
    // ── Workspace is mandatory for DM creation (multi-tenant isolation) ──
    if (!workspaceId) {
      throw new ValidationError('workspaceId is required to create a DM channel');
    }

    const id1 = user1Id.toString();
    const id2 = user2Id.toString();

    // ── Prevent self-DM ──
    if (id1 === id2) {
      throw new ValidationError('Cannot create a DM conversation with yourself');
    }

    // ── Canonical ID ordering for deterministic dedup ──
    const ids = [id1, id2].sort();

    // ── Check for existing DM channel (pass as array — matches repository signature) ──
    const existing = await channelRepository.findDMChannel(ids, workspaceId);
    if (existing) return existing;

    // ── Validate both users exist in ChatApp within this workspace ──
    const [user1, user2] = await Promise.all([
      userRepository.findById(ids[0]),
      userRepository.findById(ids[1]),
    ]);

    if (!user1 || !user2) {
      throw new NotFoundError('One or both users not found');
    }

    // ── Verify both users belong to the same workspace ──
    if (user1.workspaceId?.toString() !== workspaceId || user2.workspaceId?.toString() !== workspaceId) {
      throw new ForbiddenError('Both users must belong to the same workspace');
    }

    const channel = await channelRepository.create({
      name: `${user1.name}, ${user2.name}`,
      slug: `dm-${ids[0]}-${ids[1]}`,
      type: CHANNEL_TYPES.DM,
      visibility: CHANNEL_VISIBILITY.PRIVATE,
      dmParticipants: ids,
      members: [
        { userId: ids[0], role: CHANNEL_MEMBER_ROLES.MEMBER },
        { userId: ids[1], role: CHANNEL_MEMBER_ROLES.MEMBER },
      ],
      memberCount: 2,
      workspaceId,
    });

    // Auto-join both users to the workspace-scoped channel room
    joinChannelRoom(ids[0], channel._id.toString(), workspaceId);
    joinChannelRoom(ids[1], channel._id.toString(), workspaceId);

    logger.info('DM channel created', {
      channelId: channel._id,
      participants: ids,
      workspaceId,
    });

    return channel;
  }

  /**
   * Resolve a target user identifier to a ChatUser _id.
   * Accepts either a ChatUser _id (ObjectId) or a flowTaskUserId string.
   * Validates the target exists within the given workspace.
   *
   * @param {string} targetUserId - ChatUser _id or flowTaskUserId
   * @param {string} workspaceId - Workspace scope
   * @param {string} workspaceName - Workspace display name (for error messages)
   * @returns {Promise<{ chatUserId: string, user: object }>}
   */
  async resolveAndValidateDMTarget(targetUserId, workspaceId, workspaceName) {
    let targetUser = null;

    // Strategy 1: Try as a ChatUser _id (24-char hex ObjectId)
    if (/^[0-9a-fA-F]{24}$/.test(targetUserId)) {
      targetUser = await userRepository.findById(targetUserId);
      // Verify workspace match
      if (targetUser && targetUser.workspaceId?.toString() !== workspaceId) {
        targetUser = null;
      }
    }

    // Strategy 2: Try as a flowTaskUserId (if not found above)
    if (!targetUser) {
      targetUser = await userRepository.findByFlowTaskId(targetUserId, workspaceId);
    }

    // ── Target user does not exist in this workspace's ChatApp ──
    if (!targetUser) {
      throw new NotFoundError(
        `User '${targetUserId}' not found in workspace '${workspaceName || workspaceId}'.`
      );
    }

    if (!targetUser.isActive) {
      throw new ForbiddenError(
        `${targetUser.name}'s account is deactivated in this workspace.`
      );
    }

    return { chatUserId: targetUser._id.toString(), user: targetUser };
  }

  /**
   * Create a custom channel (user-initiated).
   */
  async createCustomChannel(data, creatorId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError('workspaceId is required to create a channel');
    }

    let slug = slugify(data.name);
    if (await channelRepository.slugExists(slug, workspaceId)) {
      slug = appendCollisionSuffix(slug, Date.now().toString(36));
    }

    const members = [{ userId: creatorId, role: CHANNEL_MEMBER_ROLES.OWNER }];

    // Add initial members if provided
    if (data.memberIds?.length) {
      for (const memberId of data.memberIds) {
        if (memberId.toString() !== creatorId.toString()) {
          members.push({ userId: memberId, role: CHANNEL_MEMBER_ROLES.MEMBER });
        }
      }
    }

    const channel = await channelRepository.create({
      name: data.name,
      slug,
      type: CHANNEL_TYPES.PROJECT, // Custom channels use project type
      description: data.description ? sanitizeHtml(data.description) : '',
      visibility: data.visibility || CHANNEL_VISIBILITY.PRIVATE,
      members,
      memberCount: members.length,
      ...(workspaceId && { workspaceId }),
    });

    // Join creator to channel room
    joinChannelRoom(creatorId.toString(), channel._id.toString(), workspaceId?.toString());

    // Notify all added members
    for (const member of members) {
      if (member.userId.toString() !== creatorId.toString()) {
        emitToUser(member.userId.toString(), SOCKET_EVENTS.CHANNEL_ADDED, {
          channel: { _id: channel._id, name: channel.name, slug: channel.slug, type: channel.type },
        }, workspaceId?.toString());
        joinChannelRoom(member.userId.toString(), channel._id.toString(), workspaceId?.toString());
      }
    }

    return channel;
  }

  // ──────────────────── System Channel Bootstrap ────────────────────────────

  /**
   * Ensure system channels exist on first boot.
   * Idempotent — safe to call on every startup.
   */
  async bootstrapSystemChannels(workspaceId) {
    const systemChannelConfigs = Object.values(SYSTEM_CHANNELS);
    let created = 0;

    for (const config of systemChannelConfigs) {
      const existing = await channelRepository.findBySlug(config.slug, workspaceId);
      if (existing) continue;

      await channelRepository.create({
        name: config.name,
        slug: config.slug,
        type: CHANNEL_TYPES.SYSTEM,
        description: config.description,
        visibility: config.visibility === 'public'
          ? CHANNEL_VISIBILITY.PUBLIC
          : CHANNEL_VISIBILITY.PRIVATE,
        members: [],
        memberCount: 0,
        ...(workspaceId && { workspaceId }),
      });

      created++;
      logger.info(`System channel created: ${config.slug}`);
    }

    if (created > 0) {
      logger.info(`Bootstrapped ${created} system channels`);
    }
  }

  /**
   * Sync all project channels for a user from FlowTask boards.
   * Called during login/sync to create channels for existing projects.
   */
  async syncProjectChannelsForUser(token, chatUser, workspaceId) {
    const flowTaskService = (await import('../flowtask/flowtask.service.js')).default;

    let boards;
    try {
      boards = await flowTaskService.getUserBoards(token);
    } catch (error) {
      logger.warn('Failed to fetch boards for channel sync', {
        userId: chatUser._id,
        error: error.message,
      });
      return;
    }

    if (!boards || !Array.isArray(boards) || boards.length === 0) {
      logger.debug('No boards found for user', { userId: chatUser._id });
      return;
    }

    let created = 0;
    let synced = 0;

    for (const board of boards) {
      try {
        const boardId = board._id || board.id;
        if (!boardId) continue;
        if (board.isArchived) continue;

        // Create channel if it doesn't exist
        const channel = await this.createProjectChannel(
          board,
          chatUser.flowTaskUserId,
          workspaceId,
        );

        // Ensure current user is a member
        if (!channel.hasMember(chatUser._id)) {
          await this.addMember(channel._id, chatUser._id);
        }

        // Sync board members
        const memberIds = (board.members || [])
          .map((m) => (typeof m === 'string' ? m : m._id || m.id))
          .filter(Boolean);

        // Add owner
        const ownerId = typeof board.owner === 'string'
          ? board.owner
          : board.owner?._id || board.owner?.id;
        if (ownerId && !memberIds.includes(ownerId)) {
          memberIds.push(ownerId);
        }

        if (memberIds.length > 0) {
          await this.syncMembers(channel._id, memberIds);
          synced++;
        }

        if (channel.createdAt && (Date.now() - channel.createdAt.getTime()) < 5000) {
          created++;
        }
      } catch (error) {
        logger.error('Failed to sync project channel', {
          boardId: board._id,
          boardName: board.name,
          error: error.message,
        });
      }
    }

    logger.info('Project channels synced', {
      userId: chatUser._id,
      totalBoards: boards.length,
      created,
      synced,
    });
  }

  // ──────────────────── Channel Retrieval ───────────────────────────────────

  /**
   * Get all channels for a user with unread counts.
   */
  async getChannelsForUser(userId, workspaceId) {
    const channels = await channelRepository.findByMember(userId, { workspaceId });

    // Get system public channels the user might not be a member of yet
    const systemChannels = await channelRepository.findSystemChannels(workspaceId);
    const publicSystem = systemChannels.filter(
      (sc) =>
        sc.visibility === CHANNEL_VISIBILITY.PUBLIC &&
        !channels.some((c) => c._id.toString() === sc._id.toString()),
    );

    return [...channels, ...publicSystem];
  }

  /**
   * Get a single channel by ID with access check.
   */
  async getChannelById(channelId, userId) {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new NotFoundError('Channel not found');
    }
    return channel;
  }

  /**
   * Get a single channel by slug.
   */
  async getChannelBySlug(slug, workspaceId) {
    const channel = await channelRepository.findBySlug(slug, workspaceId);
    if (!channel) {
      throw new NotFoundError('Channel not found');
    }
    return channel;
  }

  // ──────────────────── Membership Management ──────────────────────────────

  /**
   * Add a member to a channel.
   */
  async addMember(channelId, userId, role = CHANNEL_MEMBER_ROLES.MEMBER) {
    const channel = await channelRepository.findById(channelId);
    if (!channel) throw new NotFoundError('Channel not found');
    if (channel.isArchived) throw new ForbiddenError('Channel is archived');

    if (channel.hasMember(userId)) {
      return channel; // Already a member — idempotent
    }

    const updated = await channelRepository.addMember(channelId, userId, role, channel.workspaceId?.toString());

    // Notify the user and make their socket join the room
    emitToUser(userId.toString(), SOCKET_EVENTS.CHANNEL_ADDED, {
      channel: { _id: updated._id, name: updated.name, slug: updated.slug, type: updated.type },
    }, channel.workspaceId?.toString());
    joinChannelRoom(userId.toString(), channelId.toString(), channel.workspaceId?.toString());

    // Notify channel
    emitToChannel(channelId.toString(), SOCKET_EVENTS.MEMBER_JOINED, {
      channelId,
      userId,
    }, channel.workspaceId?.toString());

    // Persist channel invite notification
    import('../notifications/notification.service.js').then(({ default: notificationService }) => {
      notificationService.createChannelInviteNotification({
        workspaceId: channel.workspaceId,
        recipientId: userId,
        channelId: channel._id,
        channelName: channel.name,
        inviterName: 'System',
        inviterId: null,
      }).catch(() => {});
    });

    return updated;
  }

  /**
   * Add multiple members to a channel (bulk, for project sync).
   */
  async syncMembers(channelId, flowTaskUserIds, workspaceId) {
    const channel = await channelRepository.findById(channelId);
    if (!channel) throw new NotFoundError('Channel not found');

    const chatUsers = await userRepository.findByFlowTaskIds(flowTaskUserIds, workspaceId);
    const chatUserIds = chatUsers.map((u) => u._id);

    // Filter out existing members
    const newMembers = chatUserIds.filter(
      (uid) => !channel.hasMember(uid),
    );

    if (newMembers.length === 0) return channel;

    const updated = await channelRepository.addMembers(channelId, newMembers.map((uid) => ({
      userId: uid,
      role: CHANNEL_MEMBER_ROLES.MEMBER,
    })));

    // Notify and join rooms
    for (const uid of newMembers) {
      emitToUser(uid.toString(), SOCKET_EVENTS.CHANNEL_ADDED, {
        channel: { _id: updated._id, name: updated.name, slug: updated.slug },
      }, channel.workspaceId?.toString());
      joinChannelRoom(uid.toString(), channelId.toString(), channel.workspaceId?.toString());
    }

    logger.info('Members synced to channel', {
      channelId,
      added: newMembers.length,
    });

    return updated;
  }

  /**
   * Remove a member from a channel.
   */
  async removeMember(channelId, userId, removedBy) {
    const channel = await channelRepository.findById(channelId);
    if (!channel) throw new NotFoundError('Channel not found');

    if (!channel.hasMember(userId)) return channel;

    // Prevent removing the last owner unless it's a system action
    if (channel.getMemberRole(userId) === CHANNEL_MEMBER_ROLES.OWNER) {
      const owners = channel.members.filter((m) => m.role === CHANNEL_MEMBER_ROLES.OWNER);
      if (owners.length <= 1 && removedBy !== 'system') {
        throw new ForbiddenError('Cannot remove the last channel owner');
      }
    }

    const updated = await channelRepository.removeMember(channelId, userId, channel.workspaceId);

    emitToUser(userId.toString(), SOCKET_EVENTS.CHANNEL_REMOVED, { channelId }, channel.workspaceId?.toString());
    emitToChannel(channelId.toString(), SOCKET_EVENTS.MEMBER_LEFT, { channelId, userId }, channel.workspaceId?.toString());

    return updated;
  }

  // ──────────────────── Channel Updates ─────────────────────────────────────

  /**
   * Update channel details (name, description, topic).
   */
  async updateChannel(channelId, updates, userId) {
    const channel = await channelRepository.findById(channelId);
    if (!channel) throw new NotFoundError('Channel not found');
    if (channel.isArchived) throw new ForbiddenError('Channel is archived');

    // System-managed channel protection
    if (channel.systemManaged && userId !== null) {
      if (updates.name && !channel.adminOverrides?.allowRename) {
        throw new ForbiddenError('Cannot rename a system-managed channel. Enable admin override first.');
      }
      if (updates.slug && !channel.adminOverrides?.allowRename) {
        throw new ForbiddenError('Cannot change the slug of a system-managed channel.');
      }
      if (updates.adminOverrides !== undefined) {
        throw new ForbiddenError('Only system actions can modify admin overrides on system-managed channels.');
      }
    }

    const allowed = {};
    if (updates.name !== undefined) {
      allowed.name = sanitizeHtml(updates.name);
    }
    if (updates.slug !== undefined) {
      allowed.slug = updates.slug;
    }
    if (updates.description !== undefined) {
      allowed.description = sanitizeHtml(updates.description);
    }
    if (updates.topic !== undefined) {
      allowed.topic = sanitizeHtml(updates.topic);
    }
    if (updates.adminOverrides !== undefined) {
      allowed.adminOverrides = updates.adminOverrides;
    }

    const updated = await channelRepository.update(channelId, allowed);

    emitToChannel(channelId.toString(), SOCKET_EVENTS.CHANNEL_UPDATED, {
      channelId,
      updates: allowed,
      updatedBy: userId,
    }, channel.workspaceId?.toString());

    return updated;
  }

  /**
   * Archive a channel.
   */
  async archiveChannel(channelId, userId) {
    const channel = await channelRepository.findById(channelId);
    if (!channel) throw new NotFoundError('Channel not found');

    if (channel.type === CHANNEL_TYPES.SYSTEM) {
      throw new ForbiddenError('Cannot archive system channels');
    }

    // System-managed channel protection
    if (channel.systemManaged && userId !== 'system' && !channel.adminOverrides?.allowArchive) {
      throw new ForbiddenError('Cannot archive a system-managed channel. Enable admin override first.');
    }

    const updated = await channelRepository.archive(channelId);

    emitToChannel(channelId.toString(), SOCKET_EVENTS.CHANNEL_UPDATED, {
      channelId,
      updates: { isArchived: true },
      archivedBy: userId,
    }, channel.workspaceId?.toString());

    logger.info('Channel archived', { channelId, archivedBy: userId });
    return updated;
  }

  /**
   * Search channels by name.
   */
  async searchChannels(query, userId, workspaceId) {
    return channelRepository.search(query, userId, 20, workspaceId);
  }

  // ──────────────────── Aggregated Members ──────────────────────────────────

  /**
   * Get aggregated members for a channel.
   * For project channels: combines board members, task assignees, and channel members.
   * For other channels: returns channel members only.
   * All members are deduplicated and enriched with user profile data.
   */
  async getAggregatedMembers(channelId, token) {
    const channel = await channelRepository.findById(channelId, { populate: true });
    if (!channel) throw new NotFoundError('Channel not found');

    // Start with channel members (always included)
    const memberMap = new Map(); // flowTaskUserId -> member info

    // Add channel members
    for (const member of channel.members) {
      const user = member.userId; // populated
      if (!user) continue;
      const ftId = user.flowTaskUserId || user._id.toString();
      if (!memberMap.has(ftId)) {
        memberMap.set(ftId, {
          _id: user._id,
          flowTaskUserId: user.flowTaskUserId,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          onlineStatus: user.onlineStatus || 'offline',
          isActive: user.isActive !== false,
          source: ['channel'],
          channelRole: member.role,
        });
      }
    }

    // For project channels, fetch board members + task assignees from FlowTask
    if (
      channel.type === CHANNEL_TYPES.PROJECT &&
      channel.flowTaskRef?.entityId &&
      token
    ) {
      try {
        const flowTaskService = (await import('../flowtask/flowtask.service.js')).default;
        const boardId = channel.flowTaskRef.entityId;

        // Fetch board details (includes members array)
        const [board, cards] = await Promise.all([
          flowTaskService.getBoard(boardId, token).catch(() => null),
          flowTaskService.getBoardCards(boardId, token).catch(() => []),
        ]);

        // Collect all FlowTask user IDs from board + cards
        const flowTaskUserIds = new Set();

        if (board) {
          // Board owner
          const ownerId = typeof board.owner === 'string'
            ? board.owner
            : board.owner?._id || board.owner?.id;
          if (ownerId) flowTaskUserIds.add(ownerId.toString());

          // Board members
          for (const m of (board.members || [])) {
            const mid = typeof m === 'string' ? m : m._id || m.id;
            if (mid) flowTaskUserIds.add(mid.toString());
          }
        }

        // Task assignees + members
        const cardList = Array.isArray(cards) ? cards : [];
        for (const card of cardList) {
          for (const a of (card.assignees || [])) {
            const aid = typeof a === 'string' ? a : a._id || a.id;
            if (aid) flowTaskUserIds.add(aid.toString());
          }
          for (const m of (card.members || [])) {
            const mid = typeof m === 'string' ? m : m._id || m.id;
            if (mid) flowTaskUserIds.add(mid.toString());
          }
        }

        // Resolve FlowTask user IDs to chat users
        if (flowTaskUserIds.size > 0) {
          const chatUsers = await userRepository.findByFlowTaskIds([...flowTaskUserIds], channel.workspaceId);
          for (const chatUser of chatUsers) {
            const ftId = chatUser.flowTaskUserId;
            if (memberMap.has(ftId)) {
              // Already in map, just add source
              const existing = memberMap.get(ftId);
              if (!existing.source.includes('board')) existing.source.push('board');
            } else {
              memberMap.set(ftId, {
                _id: chatUser._id,
                flowTaskUserId: chatUser.flowTaskUserId,
                name: chatUser.name,
                email: chatUser.email,
                avatar: chatUser.avatar,
                role: chatUser.role,
                onlineStatus: chatUser.onlineStatus || 'offline',
                isActive: chatUser.isActive !== false,
                source: ['board'],
                channelRole: null,
              });
            }
          }
        }
      } catch (error) {
        logger.warn('Failed to aggregate FlowTask members', {
          channelId,
          error: error.message,
        });
        // Fall through with channel members only
      }
    }

    return [...memberMap.values()].sort((a, b) => {
      // Online first, then alphabetical
      const onlineOrder = { online: 0, away: 1, dnd: 2, offline: 3 };
      const aOrder = onlineOrder[a.onlineStatus] ?? 3;
      const bOrder = onlineOrder[b.onlineStatus] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.name || '').localeCompare(b.name || '');
    });
  }
}

export default new ChannelService();
