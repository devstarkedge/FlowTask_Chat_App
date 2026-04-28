import Channel from "./Channel.model.js";
import ChannelMember from "./ChannelMember.model.js";
import ChannelPin from "./ChannelPin.model.js";
import channelRepository from "./channel.repository.js";
import userRepository from "../users/user.repository.js";
import flowtaskService from "../flowtask/flowtask.service.js";
import workspaceRepository from "../workspaces/workspace.repository.js";
import WorkspaceMembership from "../workspaces/WorkspaceMembership.model.js";
import directMessageService from "../dms/directMessage.service.js";
import {
  emitToChannel,
  emitToUser,
  joinChannelRoom,
} from "../../sockets/socketManager.js";
import {
  slugify,
  projectChannelSlug,
  departmentChannelSlug,
  teamChannelSlug,
  appendCollisionSuffix,
} from "../../utils/slugify.js";
import { sanitizeHtml, stripHtml, truncate } from "../../utils/sanitize.js";
import logger from "../../utils/logger.js";
import {
  CHANNEL_TYPES,
  CHANNEL_VISIBILITY,
  SYSTEM_CHANNELS,
  SOCKET_EVENTS,
  CHANNEL_MEMBER_ROLES,
} from "../../config/constants.js";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../../middleware/errorHandler.js";

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
      throw new ValidationError(
        "workspaceId is required to create a project channel",
      );
    }

    const boardId = board._id || board.id;
    const boardName = board.name || board.title;
    const deptObj = typeof board.department === 'object' ? board.department : null;
    const deptName = deptObj?.name || 'general';
    const deptId = deptObj?._id || deptObj?.id || (typeof board.department === 'string' ? board.department : null);

    const existing = await channelRepository.findByFlowTaskRef(
      "board",
      boardId,
      workspaceId,
    );
    if (existing) {
      logger.info("Project channel already exists", {
        boardId,
        slug: existing.slug,
      });
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
      flowTaskRef: { entityType: "board", entityId: boardId },
      description: board.description
        ? truncate(stripHtml(board.description), 200)
        : "",
      visibility:
        board.visibility === "public"
          ? CHANNEL_VISIBILITY.PUBLIC
          : CHANNEL_VISIBILITY.PRIVATE,
      members,
      memberCount: members.length,
      workspaceId,
      systemManaged: true,
      adminOverrides: {
        allowRename: false,
        allowArchive: false,
        allowMemberEdit: false,
      },
      departmentRef: deptId
        ? { departmentId: deptId.toString(), departmentName: deptName }
        : { departmentId: null, departmentName: null },
    });

    logger.info("Project channel created", {
      channelId: channel._id,
      slug,
      boardId,
    });

    return channel;
  }

  /**
   * Create or get a department channel.
   */
  async getOrCreateDepartmentChannel(
    departmentId,
    departmentName,
    workspaceId,
  ) {
    if (!workspaceId) {
      throw new ValidationError(
        "workspaceId is required to create a department channel",
      );
    }

    const existing = await channelRepository.findByFlowTaskRef(
      "department",
      departmentId,
      workspaceId,
    );
    if (existing) return existing;

    let slug = departmentChannelSlug(departmentName, departmentId);
    if (await channelRepository.slugExists(slug, workspaceId)) {
      slug = appendCollisionSuffix(slug, departmentId);
    }

    const channel = await channelRepository.create({
      name: departmentName,
      slug,
      type: CHANNEL_TYPES.DEPARTMENT,
      flowTaskRef: { entityType: "department", entityId: departmentId },
      visibility: CHANNEL_VISIBILITY.PRIVATE,
      members: [],
      memberCount: 0,
      workspaceId,
    });

    logger.info("Department channel created", {
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
      throw new ValidationError(
        "workspaceId is required to create a team channel",
      );
    }

    const existing = await channelRepository.findByFlowTaskRef(
      "team",
      teamId,
      workspaceId,
    );
    if (existing) return existing;

    let slug = teamChannelSlug(teamName, teamId);
    if (await channelRepository.slugExists(slug, workspaceId)) {
      slug = appendCollisionSuffix(slug, teamId);
    }

    const channel = await channelRepository.create({
      name: teamName,
      slug,
      type: CHANNEL_TYPES.TEAM,
      flowTaskRef: { entityType: "team", entityId: teamId },
      visibility: CHANNEL_VISIBILITY.PRIVATE,
      members: [],
      memberCount: 0,
      workspaceId,
    });

    logger.info("Team channel created", {
      channelId: channel._id,
      slug,
      teamId,
    });
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
      throw new ValidationError(
        "workspaceId is required to create a DM channel",
      );
    }

    const id1 = user1Id.toString();
    const id2 = user2Id.toString();

    // ── Prevent self-DM ──
    if (id1 === id2) {
      throw new ValidationError(
        "Cannot create a DM conversation with yourself",
      );
    }

    // ── Canonical ID ordering for deterministic dedup ──
    const ids = [id1, id2].sort();
    const dmKey = `${ids[0]}:${ids[1]}`;

    // ── Check for existing DM channel (pass as array — matches repository signature) ──
    const existing = await channelRepository.findDMChannel(ids, workspaceId);
    if (existing) {
      // DM v2 foundation: ensure dedicated DM record mirrors legacy channel.
      await directMessageService
        .ensureForChannel({
          workspaceId,
          memberIds: ids,
          legacyChannelId: existing._id,
          createdBy: user1Id,
        })
        .catch((error) => {
          logger.warn("Failed to ensure DM v2 record for existing channel", {
            channelId: existing._id,
            workspaceId,
            error: error.message,
          });
        });
      return existing;
    }

    // ── Validate both users exist in ChatApp within this workspace ──
    const [user1, user2] = await Promise.all([
      userRepository.findById(ids[0]),
      userRepository.findById(ids[1]),
    ]);

    if (!user1 || !user2) {
      throw new NotFoundError("One or both users not found");
    }

    // ── Verify both users are active members of this workspace ──
    const [membership1, membership2] = await Promise.all([
      WorkspaceMembership.findOne({
        userId: ids[0],
        workspaceId,
        isActive: true,
      }).lean(),
      WorkspaceMembership.findOne({
        userId: ids[1],
        workspaceId,
        isActive: true,
      }).lean(),
    ]);

    if (!membership1 || !membership2) {
      throw new ForbiddenError(
        "Both users must be active members of the workspace",
      );
    }

    let channel;
    try {
      channel = await channelRepository.create({
        name: `${user1.name}, ${user2.name}`,
        slug: `dm-${ids[0]}-${ids[1]}`,
        type: CHANNEL_TYPES.DM,
        visibility: CHANNEL_VISIBILITY.PRIVATE,
        dmParticipants: ids,
        dmKey,
        members: [
          { userId: ids[0], role: CHANNEL_MEMBER_ROLES.MEMBER },
          { userId: ids[1], role: CHANNEL_MEMBER_ROLES.MEMBER },
        ],
        memberCount: 2,
        workspaceId,
      });
    } catch (error) {
      // Race-safe path: another request created the DM first.
      if (error?.code === 11000) {
        const winner = await channelRepository.findDMChannel(ids, workspaceId);
        if (winner) {
          await directMessageService
            .ensureForChannel({
              workspaceId,
              memberIds: ids,
              legacyChannelId: winner._id,
              createdBy: user1Id,
            })
            .catch(() => {});
          return winner;
        }
      }
      throw error;
    }

    // Persist both participants to ChannelMember collection so that
    // findByMember (which uses ChannelMember as primary lookup) can
    // find this DM channel after page refresh.
    const channelId = channel._id.toString();
    await Promise.all([
      ChannelMember.addMember(
        channelId,
        ids[0],
        workspaceId,
        CHANNEL_MEMBER_ROLES.MEMBER,
      ),
      ChannelMember.addMember(
        channelId,
        ids[1],
        workspaceId,
        CHANNEL_MEMBER_ROLES.MEMBER,
      ),
    ]);

    // DM v2 foundation: dual-write a dedicated DirectMessage record.
    await directMessageService
      .ensureForChannel({
        workspaceId,
        memberIds: ids,
        legacyChannelId: channel._id,
        createdBy: user1Id,
      })
      .catch((error) => {
        logger.warn("Failed to ensure DM v2 record for newly created channel", {
          channelId: channel._id,
          workspaceId,
          error: error.message,
        });
      });

    // Auto-join both users to the workspace-scoped channel room
    joinChannelRoom(ids[0], channel._id.toString(), workspaceId);
    joinChannelRoom(ids[1], channel._id.toString(), workspaceId);

    logger.info("DM channel created", {
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
  async resolveAndValidateDMTarget(
    targetUserId,
    workspaceId,
    workspaceName,
    flowTaskToken = null,
  ) {
    let targetUser = null;

    // Strategy 1: Try as a ChatUser _id (24-char hex ObjectId)
    if (/^[0-9a-fA-F]{24}$/.test(targetUserId)) {
      targetUser = await userRepository.findById(targetUserId);
    }

    // Strategy 2: Try as a flowTaskUserId (if not found above)
    if (!targetUser) {
      targetUser = await userRepository.findByFlowTaskId(targetUserId);
    }

    // Strategy 3: Fetch from FlowTask service if we have a token
    if (
      !targetUser &&
      flowTaskToken &&
      !/^[0-9a-fA-F]{24}$/.test(targetUserId)
    ) {
      try {
        const ftu = await flowtaskService.getUser(targetUserId, flowTaskToken);
        if (ftu && ftu._id && ftu.email) {
          targetUser = await userRepository.upsertFromFlowTask(ftu);
        }
      } catch (err) {
        logger.warn("Failed to resolve target user via FlowTask API", {
          targetUserId,
          error: err.message,
          workspaceId,
        });
      }
    }

    // ── Target user does not exist in ChatApp ──
    if (!targetUser) {
      throw new NotFoundError(
        `User '${targetUserId}' not found in workspace '${workspaceName || workspaceId}'.`,
      );
    }

    if (!targetUser.isActive) {
      throw new ForbiddenError(
        `${targetUser.name}'s account is deactivated in this workspace.`,
      );
    }

    // ── Verify workspace membership (ChatUser is global — workspace link is via WorkspaceMembership) ──
    let membership = await workspaceRepository.getMembership(
      targetUser._id,
      workspaceId,
    );

    if (!membership) {
      // Auto-add FlowTask users to workspace if they've been synced but not yet added as members
      if (targetUser.authProvider === "flowtask" && targetUser.flowTaskUserId) {
        try {
          await workspaceRepository.addMember(
            targetUser._id,
            workspaceId,
            CHANNEL_MEMBER_ROLES.MEMBER,
          );
          logger.info("Auto-added FlowTask user to workspace for DM", {
            userId: targetUser._id,
            workspaceId,
          });
          membership = await workspaceRepository.getMembership(
            targetUser._id,
            workspaceId,
          );
        } catch (addError) {
          // Re-check membership in case of race condition (concurrent add)
          membership = await workspaceRepository.getMembership(
            targetUser._id,
            workspaceId,
          );
          if (!membership) {
            logger.error("Failed to auto-add FlowTask user to workspace", {
              userId: targetUser._id,
              workspaceId,
              error: addError.message,
            });
            throw new ForbiddenError(
              `Unable to add user '${targetUser.name}' to workspace '${workspaceName || workspaceId}'.`,
            );
          }
        }
      } else {
        throw new ForbiddenError(
          `User '${targetUser.name}' is not a member of workspace '${workspaceName || workspaceId}'.`,
        );
      }
    }

    return { chatUserId: targetUser._id.toString(), user: targetUser };
  }

  /**
   * Create a custom channel (user-initiated).
   * Public channels auto-add all active workspace members.
   * Private channels only include the creator (and optional memberIds).
   */
  async createCustomChannel(data, creatorId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required to create a channel");
    }

    const visibility = data.visibility || CHANNEL_VISIBILITY.PRIVATE;

    let slug = slugify(data.name);
    if (await channelRepository.slugExists(slug, workspaceId)) {
      slug = appendCollisionSuffix(slug, Date.now().toString(36));
    }

    const members = [{ userId: creatorId, role: CHANNEL_MEMBER_ROLES.OWNER }];

    // Add initial members if provided (for private channels or explicit invites)
    if (data.memberIds?.length) {
      for (const memberId of data.memberIds) {
        if (memberId.toString() !== creatorId.toString()) {
          members.push({ userId: memberId, role: CHANNEL_MEMBER_ROLES.MEMBER });
        }
      }
    }

    // Derive type from visibility (not always 'project')
    const channelType = visibility === CHANNEL_VISIBILITY.PUBLIC
      ? CHANNEL_TYPES.PUBLIC
      : CHANNEL_TYPES.PRIVATE;

    const channel = await channelRepository.create({
      name: data.name,
      slug,
      type: channelType,
      description: data.description ? sanitizeHtml(data.description) : '',
      visibility,
      members,
      memberCount: members.length,
      createdBy: creatorId,
      workspaceId,
    });

    // Persist initial members to ChannelMember collection (source of truth for
    // findByMember which powers channel list on page refresh / reconnect).
    const channelId = channel._id.toString();
    const wsId = workspaceId.toString();
    await Promise.all(
      members.map((m) =>
        ChannelMember.addMember(channelId, m.userId, wsId, m.role),
      ),
    );

    // Build full channel payload for socket events (so frontend can render icons correctly)
    const channelPayload = {
      _id: channel._id,
      name: channel.name,
      slug: channel.slug,
      type: channel.type,
      visibility: channel.visibility,
      description: channel.description,
      memberCount: channel.memberCount,
      workspaceId: channel.workspaceId,
      createdBy: channel.createdBy,
    };

    // Join creator to channel room
    joinChannelRoom(creatorId.toString(), channelId, wsId);

    // Notify explicitly added members (for private channels or explicit invites)
    for (const member of members) {
      if (member.userId.toString() !== creatorId.toString()) {
        emitToUser(member.userId.toString(), SOCKET_EVENTS.CHANNEL_ADDED, {
          channel: channelPayload,
        }, wsId);
        joinChannelRoom(member.userId.toString(), channelId, wsId);
      }
    }

    // PUBLIC CHANNEL: auto-add all workspace members
    if (visibility === CHANNEL_VISIBILITY.PUBLIC) {
      await this._autoPopulatePublicChannel(channel, creatorId, wsId, channelPayload);
    }

    return channel;
  }

  /**
   * Auto-add all active workspace members to a newly created public channel.
   * Uses bulk upsert for dedup safety and performance.
   * @private
   */
  async _autoPopulatePublicChannel(channel, creatorId, workspaceId, channelPayload) {
    try {
      const memberships = await WorkspaceMembership.find({
        workspaceId,
        isActive: true,
      }).select('userId').lean();

      // Filter out creator and any already-added members
      const existingIds = new Set(channel.members.map((m) => m.userId.toString()));
      const newMemberUserIds = memberships
        .map((m) => m.userId.toString())
        .filter((uid) => !existingIds.has(uid));

      if (newMemberUserIds.length === 0) return;

      // Bulk upsert into ChannelMember collection (dedup-safe)
      const channelId = channel._id.toString();
      const bulkOps = newMemberUserIds.map((uid) => ({
        updateOne: {
          filter: { channelId: channel._id, userId: uid },
          update: {
            $setOnInsert: { channelId: channel._id, userId: uid, joinedAt: new Date() },
            $set: { isActive: true, workspaceId, role: CHANNEL_MEMBER_ROLES.MEMBER },
          },
          upsert: true,
        },
      }));
      await ChannelMember.bulkWrite(bulkOps);

      // Update embedded members array and memberCount atomically
      const embeddedMembers = newMemberUserIds.map((uid) => ({
        userId: uid,
        role: CHANNEL_MEMBER_ROLES.MEMBER,
        joinedAt: new Date(),
      }));
      await Channel.findOneAndUpdate(
        { _id: channel._id },
        {
          $push: { members: { $each: embeddedMembers } },
          $inc: { memberCount: newMemberUserIds.length },
        },
      );

      // Notify each new member via socket and join them to channel room
      for (const uid of newMemberUserIds) {
        emitToUser(uid, SOCKET_EVENTS.CHANNEL_ADDED, { channel: channelPayload }, workspaceId);
        joinChannelRoom(uid, channelId, workspaceId);
      }

      logger.info('[PUBLIC_CHANNEL] Auto-added workspace members', {
        channelId,
        channelName: channel.name,
        workspaceId,
        addedCount: newMemberUserIds.length,
      });
    } catch (error) {
      // Non-critical — log but don't fail channel creation
      logger.error('[PUBLIC_CHANNEL] Failed to auto-populate members', {
        channelId: channel._id,
        workspaceId,
        error: error.message,
      });
    }
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
      const existing = await channelRepository.findBySlug(
        config.slug,
        workspaceId,
      );
      if (existing) continue;

      await channelRepository.create({
        name: config.name,
        slug: config.slug,
        type: CHANNEL_TYPES.SYSTEM,
        description: config.description,
        visibility:
          config.visibility === "public"
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
    const flowTaskService = (await import("../flowtask/flowtask.service.js"))
      .default;

    let boards;
    try {
      boards = await flowTaskService.getUserBoards(token);
    } catch (error) {
      logger.warn("Failed to fetch boards for channel sync", {
        userId: chatUser._id,
        error: error.message,
      });
      return;
    }

    if (!boards || !Array.isArray(boards) || boards.length === 0) {
      logger.debug("No boards found for user", { userId: chatUser._id });
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

        // Ensure current user is a member (ChannelMember + embedded array)
        if (!channel.hasMember(chatUser._id)) {
          await this.addMember(channel._id, chatUser._id);
        } else {
          // Embedded members may be in sync while ChannelMember is missing.
          // Force idempotent add to guarantee ChannelMember row exists.
          await channelRepository.addMember(
            channel._id,
            chatUser._id,
            CHANNEL_MEMBER_ROLES.MEMBER,
            channel.workspaceId?.toString() || workspaceId,
          );
        }

        // Sync board members
        const memberIds = (board.members || [])
          .map((m) => (typeof m === "string" ? m : m._id || m.id))
          .filter(Boolean);

        // Add owner
        const ownerId =
          typeof board.owner === "string"
            ? board.owner
            : board.owner?._id || board.owner?.id;
        if (ownerId && !memberIds.includes(ownerId)) {
          memberIds.push(ownerId);
        }

        if (memberIds.length > 0) {
          await this.syncMembers(channel._id, memberIds, workspaceId);
          synced++;
        }

        if (
          channel.createdAt &&
          Date.now() - channel.createdAt.getTime() < 5000
        ) {
          created++;
        }
      } catch (error) {
        logger.error("Failed to sync project channel", {
          boardId: board._id,
          boardName: board.name,
          error: error.message,
        });
      }
    }

    logger.info("[CHANNEL_SYNC] Project channels synced for user", {
      userId: chatUser._id,
      workspaceId,
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
    const channels = await channelRepository.findByMember(userId, {
      workspaceId,
    });


    // Get system public channels the user might not be a member of yet
    const systemChannels =
      await channelRepository.findSystemChannels(workspaceId);
    const publicSystem = systemChannels.filter(
      (sc) =>
        sc.visibility === CHANNEL_VISIBILITY.PUBLIC &&
        !channels.some((c) => c._id.toString() === sc._id.toString()),
    );

    // Include any public channels the user might not yet have a ChannelMember
    // record for (e.g. race condition, legacy data, or first load after join).
    const publicChannels = await channelRepository.findPublicChannels(workspaceId);
    const existingIds = new Set(channels.map((c) => c._id.toString()));
    const missingPublic = publicChannels
      .filter((pc) => !existingIds.has(pc._id.toString()))
      .map((pc) => (pc.toObject ? pc.toObject() : pc));


    const all = [...channels, ...missingPublic];
    const decorated = await this._decorateDMChannels(all, userId, workspaceId);

    // Merge per-user pin/star state
    const pins = await ChannelPin.getPinsForUser(userId, workspaceId);
    const pinMap = new Map(pins.map((p) => [p.channelId.toString(), p]));

    const withPins = decorated.map((ch) => {
      const raw = ch.toObject ? ch.toObject() : ch;
      const pin = pinMap.get(raw._id.toString());
      return {
        ...raw,
        isPinned: pin?.isPinned || false,
        isStarred: pin?.isStarred || false,
        pinnedOrder: pin?.pinnedOrder || 0,
      };
    });

    logger.debug?.('[CHANNEL_FETCH] Channels resolved for sidebar', {
      userId,
      workspaceId,
      memberChannels: channels.length,
      missingPublic: missingPublic.length,
      total: withPins.length,
      pinned: pins.filter((p) => p.isPinned).length,
    });

    return withPins;
  }

  async _decorateDMChannels(channels, currentUserId, workspaceId) {
    const currentId = currentUserId?.toString();
    if (!currentId) return channels;

    const dmChannels = channels.filter((c) => c.type === CHANNEL_TYPES.DM);
    if (dmChannels.length === 0) return channels;

    const recipientIds = new Set();
    for (const dm of dmChannels) {
      const participants = Array.isArray(dm.dmParticipants)
        ? dm.dmParticipants.map((p) => p?.toString())
        : [];
      const recipientId = participants.find((p) => p && p !== currentId);
      if (recipientId) recipientIds.add(recipientId);
    }

    if (recipientIds.size === 0) return channels;

    const users = await userRepository.findByIds([...recipientIds]);
    const byId = new Map(users.map((u) => [u._id.toString(), u]));

    return channels.map((channel) => {
      if (channel.type !== CHANNEL_TYPES.DM) return channel;

      const participants = Array.isArray(channel.dmParticipants)
        ? channel.dmParticipants.map((p) => p?.toString())
        : [];
      const recipientId =
        participants.find((p) => p && p !== currentId) || null;
      const recipient = recipientId ? byId.get(recipientId) : null;

      const raw = channel.toObject ? channel.toObject() : channel;
      return {
        ...raw,
        dmRecipientId: recipientId,
        name: recipient?.name || raw.name || "Direct message",
        avatar: recipient?.avatar || raw.avatar || null,
      };
    });
  }

  /**
   * Get a single channel by ID with access check.
   * Uses permission engine for default-deny access control.
   */
  async getChannelById(channelId, userId, workspaceId) {
    const channel = await channelRepository.findById(channelId, {
      workspaceId,
    });
    if (!channel) {
      throw new NotFoundError("Channel not found");
    }

    // Permission-based access check (default-deny)
    if (userId) {
      const user = await userRepository.findById(userId);
      if (user) {
        const permissionEngine = (await import("../../services/permissionEngine.js")).default;
        if (!permissionEngine.canAccessChannel(user, channel)) {
          throw new ForbiddenError("Access denied to this channel");
        }
      }
    }

    return channel;
  }

  /**
   * Get a single channel by slug.
   */
  async getChannelBySlug(slug, workspaceId) {
    const channel = await channelRepository.findBySlug(slug, workspaceId);
    if (!channel) {
      throw new NotFoundError("Channel not found");
    }
    return channel;
  }

  // ──────────────────── Membership Management ──────────────────────────────

  /**
   * Add a member to a channel.
   * Validates that the target user is an active workspace member (prevents cross-workspace injection).
   */
  async addMember(
    channelId,
    userId,
    role = CHANNEL_MEMBER_ROLES.MEMBER,
    workspaceId,
  ) {
    const channel = await channelRepository.findById(channelId, {
      workspaceId,
    });
    if (!channel) throw new NotFoundError("Channel not found");
    if (channel.isArchived) throw new ForbiddenError("Channel is archived");

    const effectiveWsId = channel.workspaceId?.toString();

    // Validate target user is an active workspace member
    if (effectiveWsId) {
      const isMember = await WorkspaceMembership.findOne({
        userId,
        workspaceId: effectiveWsId,
        isActive: true,
      }).lean();
      if (!isMember) {
        throw new ForbiddenError('User is not a member of this workspace');
      }
    }

    // Always go through repository to keep ChannelMember and embedded members in sync.
    const updated = await channelRepository.addMember(
      channelId,
      userId,
      role,
      effectiveWsId,
    );

    // Send full channel payload so frontend can render icons, categorize, etc.
    const channelPayload = {
      _id: updated._id,
      name: updated.name,
      slug: updated.slug,
      type: updated.type,
      visibility: updated.visibility,
      description: updated.description,
      memberCount: updated.memberCount,
      workspaceId: updated.workspaceId,
      createdBy: updated.createdBy,
    };

    // Notify the user and make their socket join the room
    emitToUser(userId.toString(), SOCKET_EVENTS.CHANNEL_ADDED, {
      channel: channelPayload,
    }, effectiveWsId);
    joinChannelRoom(userId.toString(), channelId.toString(), effectiveWsId);

    // Notify channel
    emitToChannel(
      channelId.toString(),
      SOCKET_EVENTS.MEMBER_JOINED,
      {
        channelId,
        userId,
      },
      channel.workspaceId?.toString(),
    );

    // Persist channel invite notification
    import("../notifications/notification.service.js").then(
      ({ default: notificationService }) => {
        notificationService
          .createChannelInviteNotification({
            workspaceId: channel.workspaceId,
            recipientId: userId,
            channelId: channel._id,
            channelName: channel.name,
            inviterName: "System",
            inviterId: null,
          })
          .catch(() => {});
      },
    );

    return updated;
  }

  /**
   * Add multiple members to a channel (bulk, for project sync).
   */
  async syncMembers(channelId, flowTaskUserIds, workspaceId) {
    const channel = await channelRepository.findById(channelId, {
      workspaceId,
    });
    if (!channel) throw new NotFoundError("Channel not found");

    const chatUsers = await userRepository.findByFlowTaskIds(
      flowTaskUserIds,
      workspaceId,
    );
    const chatUserIds = chatUsers.map((u) => u._id);

    // Filter out existing members
    const newMembers = chatUserIds.filter((uid) => !channel.hasMember(uid));

    if (newMembers.length === 0) return channel;

    const updated = await channelRepository.addMembers(
      channelId,
      newMembers.map((uid) => ({
        userId: uid,
        role: CHANNEL_MEMBER_ROLES.MEMBER,
      })),
    );

    // Notify and join rooms
    const syncChannelPayload = {
      _id: updated._id,
      name: updated.name,
      slug: updated.slug,
      type: updated.type,
      visibility: updated.visibility,
      description: updated.description,
      memberCount: updated.memberCount,
      workspaceId: updated.workspaceId,
      createdBy: updated.createdBy,
    };
    for (const uid of newMembers) {
      emitToUser(uid.toString(), SOCKET_EVENTS.CHANNEL_ADDED, {
        channel: syncChannelPayload,
      }, channel.workspaceId?.toString());
      joinChannelRoom(uid.toString(), channelId.toString(), channel.workspaceId?.toString());
    }

    logger.info("Members synced to channel", {
      channelId,
      added: newMembers.length,
    });

    return updated;
  }

  /**
   * Remove a member from a channel.
   */
  async removeMember(channelId, userId, removedBy, workspaceId) {
    const channel = await channelRepository.findById(channelId, {
      workspaceId,
    });
    if (!channel) throw new NotFoundError("Channel not found");

    if (!channel.hasMember(userId)) return channel;

    // Prevent removing the last owner unless it's a system action
    if (channel.getMemberRole(userId) === CHANNEL_MEMBER_ROLES.OWNER) {
      const owners = channel.members.filter(
        (m) => m.role === CHANNEL_MEMBER_ROLES.OWNER,
      );
      if (owners.length <= 1 && removedBy !== "system") {
        throw new ForbiddenError("Cannot remove the last channel owner");
      }
    }

    const updated = await channelRepository.removeMember(
      channelId,
      userId,
      channel.workspaceId,
    );

    emitToUser(
      userId.toString(),
      SOCKET_EVENTS.CHANNEL_REMOVED,
      { channelId },
      channel.workspaceId?.toString(),
    );
    emitToChannel(
      channelId.toString(),
      SOCKET_EVENTS.MEMBER_LEFT,
      { channelId, userId },
      channel.workspaceId?.toString(),
    );

    return updated;
  }

  // ──────────────────── Channel Updates ─────────────────────────────────────

  /**
   * Update channel details (name, description, topic).
   */
  async updateChannel(channelId, updates, userId, workspaceId) {
    const channel = await channelRepository.findById(channelId, {
      workspaceId,
    });
    if (!channel) throw new NotFoundError("Channel not found");
    if (channel.isArchived) throw new ForbiddenError("Channel is archived");

    // System-managed channel protection
    if (channel.systemManaged && userId !== null) {
      if (updates.name && !channel.adminOverrides?.allowRename) {
        throw new ForbiddenError(
          "Cannot rename a system-managed channel. Enable admin override first.",
        );
      }
      if (updates.slug && !channel.adminOverrides?.allowRename) {
        throw new ForbiddenError(
          "Cannot change the slug of a system-managed channel.",
        );
      }
      if (updates.adminOverrides !== undefined) {
        throw new ForbiddenError(
          "Only system actions can modify admin overrides on system-managed channels.",
        );
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

    const updated = await channelRepository.update(
      channelId,
      allowed,
      workspaceId,
    );

    emitToChannel(
      channelId.toString(),
      SOCKET_EVENTS.CHANNEL_UPDATED,
      {
        channelId,
        updates: allowed,
        updatedBy: userId,
      },
      channel.workspaceId?.toString(),
    );

    return updated;
  }

  /**
   * Archive a channel.
   */
  async archiveChannel(channelId, userId, workspaceId) {
    const channel = await channelRepository.findById(channelId, {
      workspaceId,
    });
    if (!channel) throw new NotFoundError("Channel not found");

    if (channel.type === CHANNEL_TYPES.SYSTEM) {
      throw new ForbiddenError("Cannot archive system channels");
    }

    // System-managed channel protection
    if (
      channel.systemManaged &&
      userId !== "system" &&
      !channel.adminOverrides?.allowArchive
    ) {
      throw new ForbiddenError(
        "Cannot archive a system-managed channel. Enable admin override first.",
      );
    }

    const updated = await channelRepository.archive(channelId, "", workspaceId);

    emitToChannel(
      channelId.toString(),
      SOCKET_EVENTS.CHANNEL_UPDATED,
      {
        channelId,
        updates: { isArchived: true },
        archivedBy: userId,
      },
      channel.workspaceId?.toString(),
    );

    logger.info("Channel archived", { channelId, archivedBy: userId });
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
  async getAggregatedMembers(channelId, token, workspaceId) {
    const channel = await channelRepository.findById(channelId, {
      populate: true,
      workspaceId,
    });
    if (!channel) throw new NotFoundError("Channel not found");

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
          onlineStatus: user.onlineStatus || "offline",
          isActive: user.isActive !== false,
          source: ["channel"],
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
        const flowTaskService = (
          await import("../flowtask/flowtask.service.js")
        ).default;
        const boardId = channel.flowTaskRef.entityId;

        // Use deep member extraction (board + cards + subtasks + nanos)
        const { memberIds: flowTaskUserIds, sources: ftSources } =
          await flowTaskService.getBoardDeepMembers(boardId, token);

        // Resolve FlowTask user IDs to chat users
        if (flowTaskUserIds.size > 0) {
          const chatUsers = await userRepository.findByFlowTaskIds(
            [...flowTaskUserIds],
            channel.workspaceId,
          );
          const resolvedFtIds = new Set(chatUsers.map((u) => u.flowTaskUserId));

          // Add registered ChatApp users
          for (const chatUser of chatUsers) {
            const ftId = chatUser.flowTaskUserId;
            const memberSources = ftSources.get(ftId) || ['board'];
            if (memberMap.has(ftId)) {
              const existing = memberMap.get(ftId);
              for (const s of memberSources) {
                if (!existing.source.includes(s)) existing.source.push(s);
              }
            } else {
              memberMap.set(ftId, {
                _id: chatUser._id,
                flowTaskUserId: chatUser.flowTaskUserId,
                name: chatUser.name,
                email: chatUser.email,
                avatar: chatUser.avatar,
                role: chatUser.role,
                onlineStatus: chatUser.onlineStatus || "offline",
                isActive: chatUser.isActive !== false,
                registrationStatus: "active",
                source: memberSources,
                channelRole: null,
              });
            }
          }

          // Add faded users (FlowTask users not registered in ChatApp)
          for (const ftId of flowTaskUserIds) {
            if (!resolvedFtIds.has(ftId) && !memberMap.has(ftId)) {
              const memberSources = ftSources.get(ftId) || ['board'];
              memberMap.set(ftId, {
                _id: null,
                flowTaskUserId: ftId,
                name: null,       // Will be resolved from FlowTask user data if available
                email: null,
                avatar: null,
                role: null,
                onlineStatus: "offline",
                isActive: false,
                registrationStatus: "faded",
                source: memberSources,
                channelRole: null,
              });
            }
          }

          // Try to enrich faded users with FlowTask user details
          const fadedIds = [...memberMap.values()]
            .filter((m) => m.registrationStatus === "faded" && !m.name)
            .map((m) => m.flowTaskUserId);

          if (fadedIds.length > 0) {
            try {
              const ftUsers = await flowTaskService.getUsers(token);
              const ftUserMap = new Map();
              for (const u of (ftUsers || [])) {
                const uid = (u._id || u.id || '').toString();
                if (uid) ftUserMap.set(uid, u);
              }
              for (const ftId of fadedIds) {
                const ftUser = ftUserMap.get(ftId);
                if (ftUser && memberMap.has(ftId)) {
                  const m = memberMap.get(ftId);
                  m.name = ftUser.name || 'Unknown User';
                  m.email = ftUser.email || null;
                  m.avatar = ftUser.avatar || null;
                }
              }
            } catch {
              // Non-critical: faded users will show without names
            }
          }
        }
      } catch (error) {
        logger.warn("Failed to aggregate FlowTask members", {
          channelId,
          error: error.message,
        });
        // Fall through with channel members only
      }
    }

    // Mark existing channel members as 'active' if not already set
    for (const m of memberMap.values()) {
      if (!m.registrationStatus) m.registrationStatus = 'active';
    }

    return [...memberMap.values()].sort((a, b) => {
      // Active users first, then faded
      if (a.registrationStatus !== b.registrationStatus) {
        return a.registrationStatus === 'active' ? -1 : 1;
      }
      // Online first, then alphabetical
      const onlineOrder = { online: 0, away: 1, dnd: 2, offline: 3 };
      const aOrder = onlineOrder[a.onlineStatus] ?? 3;
      const bOrder = onlineOrder[b.onlineStatus] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.name || "").localeCompare(b.name || "");
    });
  }

  async getAIDMChannel(userId, workspaceId) {
    return Channel.findOne({
      workspaceId,
      type: "dm",
      isAI: true,
      "members.userId": userId,
    });
  }

  async createAIDMChannel(userId, workspaceId) {
    const channel = await Channel.create({
      name: "ChatBot",
      slug: `ai-${userId}`,
      type: "dm",
      isAI: true,
      members: [{ userId }],
      memberCount: 1,
      workspaceId,
    });

    return channel;
  }

  // ──────────────────── Pin / Star ─────────────────────────────────────────

  /**
   * Toggle pin state for a channel (per-user).
   */
  async togglePinChannel(userId, channelId, workspaceId) {
    const channel = await channelRepository.findById(channelId, { workspaceId });
    if (!channel) throw new NotFoundError('Channel not found');

    const result = await ChannelPin.togglePin(userId, channelId, workspaceId);

    // Emit to the user so other tabs update
    emitToUser(userId.toString(), SOCKET_EVENTS.CHANNEL_UPDATED, {
      channelId: channelId.toString(),
      updates: { isPinned: result.isPinned },
    }, workspaceId?.toString());

    return result;
  }

  /**
   * Toggle star state for a channel (per-user).
   */
  async toggleStarChannel(userId, channelId, workspaceId) {
    const channel = await channelRepository.findById(channelId, { workspaceId });
    if (!channel) throw new NotFoundError('Channel not found');

    const result = await ChannelPin.toggleStar(userId, channelId, workspaceId);

    emitToUser(userId.toString(), SOCKET_EVENTS.CHANNEL_UPDATED, {
      channelId: channelId.toString(),
      updates: { isStarred: result.isStarred },
    }, workspaceId?.toString());

    return result;
  }
}
export default new ChannelService();
