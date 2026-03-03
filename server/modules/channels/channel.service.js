import Channel from './Channel.model.js';
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
      ...(workspaceId && { workspaceId }),
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
      ...(workspaceId && { workspaceId }),
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
      ...(workspaceId && { workspaceId }),
    });

    logger.info('Team channel created', { channelId: channel._id, slug, teamId });
    return channel;
  }

  /**
   * Create or get a DM channel between two users.
   */
  async getOrCreateDM(user1Id, user2Id, workspaceId) {
    const ids = [user1Id.toString(), user2Id.toString()].sort();

    const existing = await channelRepository.findDMChannel(ids[0], ids[1], workspaceId);
    if (existing) return existing;

    const [user1, user2] = await Promise.all([
      userRepository.findById(ids[0]),
      userRepository.findById(ids[1]),
    ]);

    if (!user1 || !user2) {
      throw new NotFoundError('One or both users not found');
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
      ...(workspaceId && { workspaceId }),
    });

    // Auto-join both users to the channel room
    joinChannelRoom(ids[0], channel._id.toString());
    joinChannelRoom(ids[1], channel._id.toString());

    logger.info('DM channel created', {
      channelId: channel._id,
      participants: ids,
    });

    return channel;
  }

  /**
   * Create a custom channel (user-initiated).
   */
  async createCustomChannel(data, creatorId, workspaceId) {
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

    // Notify all added members
    for (const member of members) {
      if (member.userId.toString() !== creatorId.toString()) {
        emitToUser(member.userId.toString(), SOCKET_EVENTS.CHANNEL_ADDED, {
          channel: { _id: channel._id, name: channel.name, slug: channel.slug, type: channel.type },
        });
        joinChannelRoom(member.userId.toString(), channel._id.toString());
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

    const updated = await channelRepository.addMember(channelId, userId, role);

    // Notify the user and make their socket join the room
    emitToUser(userId.toString(), SOCKET_EVENTS.CHANNEL_ADDED, {
      channel: { _id: updated._id, name: updated.name, slug: updated.slug, type: updated.type },
    });
    joinChannelRoom(userId.toString(), channelId.toString());

    // Notify channel
    emitToChannel(channelId.toString(), SOCKET_EVENTS.MEMBER_JOINED, {
      channelId,
      userId,
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
      });
      joinChannelRoom(uid.toString(), channelId.toString());
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

    const updated = await channelRepository.removeMember(channelId, userId);

    emitToUser(userId.toString(), SOCKET_EVENTS.CHANNEL_REMOVED, { channelId });
    emitToChannel(channelId.toString(), SOCKET_EVENTS.MEMBER_LEFT, { channelId, userId });

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

    const allowed = {};
    if (updates.description !== undefined) {
      allowed.description = sanitizeHtml(updates.description);
    }
    if (updates.topic !== undefined) {
      allowed.topic = sanitizeHtml(updates.topic);
    }

    const updated = await channelRepository.update(channelId, allowed);

    emitToChannel(channelId.toString(), SOCKET_EVENTS.CHANNEL_UPDATED, {
      channelId,
      updates: allowed,
      updatedBy: userId,
    });

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

    const updated = await channelRepository.archive(channelId);

    emitToChannel(channelId.toString(), SOCKET_EVENTS.CHANNEL_UPDATED, {
      channelId,
      updates: { isArchived: true },
      archivedBy: userId,
    });

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
          const chatUsers = await userRepository.findByFlowTaskIds([...flowTaskUserIds]);
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
