import Channel from "./Channel.model.js";
import crypto from "crypto";
import ChannelMember from "./ChannelMember.model.js";
import PendingChannelParticipant from "./PendingChannelParticipant.model.js";
import ChannelPin from "./ChannelPin.model.js";
import channelRepository from "./channel.repository.js";
import favoritesService from "../favorites/favorites.service.js";
import userRepository from "../users/user.repository.js";
import flowtaskService from "../flowtask/flowtask.service.js";
import workspaceRepository from "../workspaces/workspace.repository.js";
import WorkspaceMembership from "../workspaces/WorkspaceMembership.model.js";
import directMessageService from "../dms/directMessage.service.js";
import messageRepository from "../messages/message.repository.js";
import {
  emitToChannel,
  emitToUser,
  emitToWorkspace,
  joinChannelRoom,
  leaveChannelRoom,
  reconcileChannelRoomAccess,
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
import { isRetryableMongoError, mapWithConcurrency } from "../../utils/mongoRetry.js";
import { withProjectChannelLock } from "../flowtask/projectChannelLock.service.js";
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
      if (existing.visibility !== CHANNEL_VISIBILITY.PRIVATE) {
        const migrated = await channelRepository.update(
          existing._id,
          {
            visibility: CHANNEL_VISIBILITY.PRIVATE,
            type: CHANNEL_TYPES.PROJECT,
            systemManaged: true,
          },
          workspaceId,
        );
        emitToWorkspace(workspaceId, SOCKET_EVENTS.CHANNEL_UPDATED, {
          channelId: migrated._id,
          updates: {
            visibility: CHANNEL_VISIBILITY.PRIVATE,
            type: CHANNEL_TYPES.PROJECT,
          },
        });
        await reconcileChannelRoomAccess(migrated._id.toString(), workspaceId);
        logger.info("Migrated mapped FlowTask channel to private in place", {
          boardId,
          channelId: migrated._id,
        });
        if (migrated.$locals) migrated.$locals.flowTaskCreated = false;
        else migrated.__flowTaskCreated = false;
        return migrated;
      }
      logger.info("Project channel already exists", {
        boardId,
        slug: existing.slug,
      });
      if (existing.$locals) existing.$locals.flowTaskCreated = false;
      else existing.__flowTaskCreated = false;
      return existing;
    }

    const resolvedCreator = creatorFlowTaskId
      ? await userRepository.findByFlowTaskId(creatorFlowTaskId, workspaceId)
      : null;
    const creator = resolvedCreator && (
      resolvedCreator.authProvider === "native" || resolvedCreator.registeredAt
    )
      ? resolvedCreator
      : null;

    let slug = projectChannelSlug(deptName, boardName, boardId);
    if (await channelRepository.slugExists(slug, workspaceId)) {
      slug = appendCollisionSuffix(slug, boardId);
    }

    // Project access comes only from the authoritative hierarchy snapshot.
    // Keep the actor as audit metadata without granting transient membership.
    const members = [];

    let channel;
    try {
      channel = await channelRepository.create({
      name: boardName,
      slug,
      type: CHANNEL_TYPES.PROJECT,
      flowTaskRef: { entityType: "board", entityId: boardId },
      description: board.description
        ? truncate(stripHtml(board.description), 200)
        : "",
      visibility: CHANNEL_VISIBILITY.PRIVATE,
      members,
      memberCount: members.length,
      createdBy: creator?._id || null,
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
      if (channel.$locals) channel.$locals.flowTaskCreated = true;
      else channel.__flowTaskCreated = true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      channel = await channelRepository.findByFlowTaskRef("board", boardId, workspaceId);
      if (!channel) throw error;
      if (channel.$locals) channel.$locals.flowTaskCreated = false;
      else channel.__flowTaskCreated = false;
      logger.info("Concurrent project-channel create resolved by mapping", {
        boardId,
        channelId: channel._id,
      });
    }

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
   * Create or get a DM channel between two users OR a self-DM.
   * Both user IDs must be valid ChatUser _id values within the same workspace.
   *
   * @param {string} user1Id - ChatUser _id of the initiating user
   * @param {string} user2Id - ChatUser _id of the target user (can be same as user1Id for self-DM)
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

    // ── Self-DM: single-user conversation ──
    const isSelfDM = id1 === id2;
    const ids = isSelfDM ? [id1] : [id1, id2].sort();
    const dmKey = isSelfDM ? id1 : `${ids[0]}:${ids[1]}`;

    // ── Check for existing DM channel ──
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

    // ── Validate user(s) exist in ChatApp within this workspace ──
    const user1 = await userRepository.findById(ids[0]);
    if (!user1) {
      throw new NotFoundError("User not found");
    }

    let user2 = null;
    if (!isSelfDM) {
      user2 = await userRepository.findById(ids[1]);
      if (!user2) {
        throw new NotFoundError("One or both users not found");
      }
    }

    // ── Verify user(s) are active members of this workspace ──
    const membership1 = await WorkspaceMembership.findOne({
      userId: ids[0],
      workspaceId,
      isActive: true,
    }).lean();

    if (!membership1) {
      throw new ForbiddenError(
        "User must be an active member of the workspace",
      );
    }

    if (!isSelfDM) {
      const membership2 = await WorkspaceMembership.findOne({
        userId: ids[1],
        workspaceId,
        isActive: true,
      }).lean();

      if (!membership2) {
        throw new ForbiddenError(
          "Both users must be active members of the workspace",
        );
      }
    }

    let channel;
    try {
      const channelName = isSelfDM
        ? `${user1.name} (You)`
        : `${user1.name}, ${user2.name}`;
      const channelSlug = isSelfDM
        ? `dm-self-${ids[0]}`
        : `dm-${ids[0]}-${ids[1]}`;
      const members = isSelfDM
        ? [{ userId: ids[0], role: CHANNEL_MEMBER_ROLES.MEMBER }]
        : [
            { userId: ids[0], role: CHANNEL_MEMBER_ROLES.MEMBER },
            { userId: ids[1], role: CHANNEL_MEMBER_ROLES.MEMBER },
          ];

      channel = await channelRepository.create({
        name: channelName,
        slug: channelSlug,
        type: CHANNEL_TYPES.DM,
        visibility: CHANNEL_VISIBILITY.PRIVATE,
        dmParticipants: ids,
        dmKey,
        members,
        memberCount: ids.length,
        workspaceId,
        createdBy: user1Id,
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

    // Persist member(s) to ChannelMember collection
    const channelId = channel._id.toString();
    if (isSelfDM) {
      await ChannelMember.addMember(
        channelId,
        ids[0],
        workspaceId,
        CHANNEL_MEMBER_ROLES.MEMBER,
      );
    } else {
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
    }

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

    // Auto-join user(s) to the workspace-scoped channel room
    joinChannelRoom(ids[0], channel._id.toString(), workspaceId);
    if (!isSelfDM) {
      joinChannelRoom(ids[1], channel._id.toString(), workspaceId);
    }

    // Build a safe channel payload for emission
    const channelPayload = {
      _id: channel._id.toString(),
      name: channel.name,
      slug: channel.slug,
      type: channel.type,
      visibility: channel.visibility,
      dmParticipants: channel.dmParticipants,
      workspaceId: channel.workspaceId,
      memberCount: channel.memberCount,
      createdBy: channel.createdBy,
    };

    try {
      const decorated = await this._decorateDMChannels([channelPayload], ids[0], workspaceId);
      if (decorated && decorated[0]) {
        emitToUser(ids[0], SOCKET_EVENTS.CHANNEL_ADDED, { channel: decorated[0] }, workspaceId);
      }
      
      if (!isSelfDM) {
        const decoratedRecipient = await this._decorateDMChannels([channelPayload], ids[1], workspaceId);
        if (decoratedRecipient && decoratedRecipient[0]) {
          emitToUser(ids[1], SOCKET_EVENTS.CHANNEL_ADDED, { channel: decoratedRecipient[0] }, workspaceId);
        }
      }
    } catch (err) {
      logger.error("Failed to emit CHANNEL_ADDED for DM creation", { error: err.message });
    }

    logger.info("DM channel created", {
      channelId: channel._id,
      participants: ids,
      isSelfDM,
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

    // Get creator details to populate in invite notifications
    const creatorUser = await userRepository.findById(creatorId);
    const creatorName = creatorUser?.name || 'Someone';

    // Notify explicitly added members (for private channels or explicit invites)
    for (const member of members) {
      if (member.userId.toString() !== creatorId.toString()) {
        emitToUser(member.userId.toString(), SOCKET_EVENTS.CHANNEL_ADDED, {
          channel: channelPayload,
        }, wsId);
        joinChannelRoom(member.userId.toString(), channelId, wsId);

        // Persist channel invite notification
        import("../notifications/notification.service.js").then(
          ({ default: notificationService }) => {
            notificationService
              .createChannelInviteNotification({
                workspaceId: channel.workspaceId,
                recipientId: member.userId,
                channelId: channel._id,
                channelName: channel.name,
                inviterName: creatorName,
                inviterId: creatorId,
              })
              .catch(() => {});
          },
        );
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

      // Fetch creator details for invite notifications
      const creatorUser = await userRepository.findById(creatorId);
      const creatorName = creatorUser?.name || 'Someone';

      // Notify each new member via socket and join them to channel room
      for (const uid of newMemberUserIds) {
        emitToUser(uid, SOCKET_EVENTS.CHANNEL_ADDED, { channel: channelPayload }, workspaceId);
        joinChannelRoom(uid, channelId, workspaceId);
      }

      // Persist channel invite notification for auto-added members
      import("../notifications/notification.service.js").then(
        ({ default: notificationService }) => {
          for (const uid of newMemberUserIds) {
            notificationService
              .createChannelInviteNotification({
                workspaceId,
                recipientId: uid,
                channelId: channel._id,
                channelName: channel.name,
                inviterName: creatorName,
                inviterId: creatorId,
              })
              .catch((err) => {
                logger.warn('Failed to send public channel auto-add notification', { userId: uid, error: err.message });
              });
          }
        },
      );

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
  async syncProjectChannelsForUser(token, chatUser, workspaceId, options = {}) {
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
      throw error;
    }

    if (!boards || !Array.isArray(boards) || boards.length === 0) {
      logger.debug("No boards found for user", { userId: chatUser._id });
      return { totalBoards: 0, created: 0, completed: 0, failed: 0, results: [] };
    }

    const requestedBoardIds = options.boardIds?.length
      ? new Set(options.boardIds.map(String))
      : null;
    const eligibleBoards = boards.filter((board) => {
      const boardId = board?._id || board?.id;
      return boardId && !board.isArchived && (!requestedBoardIds || requestedBoardIds.has(String(boardId)));
    });
    const counters = { created: 0, completed: 0, failed: 0, processed: 0 };
    if (options.onBoardsDiscovered) {
      try {
        await options.onBoardsDiscovered(eligibleBoards.map((board) => ({
          boardId: String(board._id || board.id),
          boardName: board.name || board.title || '',
          status: 'pending',
          retryable: false,
        })));
      } catch (error) {
        logger.warn('Failed to persist discovered project boards', {
          jobId: options.jobId,
          requestId: options.requestId,
          workspaceId,
          error: error.message,
        });
      }
    }

    const reportBoardState = async (state) => {
      if (!options.onBoardState) return;
      try {
        await options.onBoardState(state);
      } catch (error) {
        logger.warn('Failed to persist project-board sync state', {
          jobId: options.jobId,
          requestId: options.requestId,
          workspaceId,
          boardId: state.boardId,
          error: error.message,
        });
      }
    };

    const results = await mapWithConcurrency(
      eligibleBoards,
      options.concurrency || 3,
      async (board) => {
        const boardId = String(board._id || board.id);
        await reportBoardState({
          boardId,
          boardName: board.name || board.title || '',
          status: 'processing',
          retryable: false,
          error: null,
        });
      try {
        // Deep sync: board members + card/subtask/nano assignees
        let memberIds = [];
        let participants = [];
        let membershipVersion = 0;
        let authoritativeSnapshotLoaded = false;
        let ownerId = typeof board.owner === "string"
          ? board.owner
          : board.owner?._id || board.owner?.id;

        let deepFetchError = null;
        try {
          const deepResult = await flowTaskService.getBoardDeepMembers(boardId, token);
          memberIds = [...deepResult.memberIds];
          participants = deepResult.participants || [];
          membershipVersion = deepResult.membershipVersion || 0;
          authoritativeSnapshotLoaded = Array.isArray(deepResult.participants);

          // Extract owner from deep result sources
          if (deepResult.sources) {
            for (const [userId, sources] of deepResult.sources) {
              if (sources.includes('board')) {
                ownerId = userId;
                break;
              }
            }
          }
        } catch (deepErr) {
          deepFetchError = deepErr;
          // Fallback to shallow board members if deep fetch fails
          logger.warn('[CHANNEL_SYNC] Deep member fetch failed, using shallow members', {
            boardId,
            error: deepErr.message,
          });
          memberIds = (board.members || [])
            .map((m) => (typeof m === "string" ? m : m._id || m.id))
            .filter(Boolean);
          if (ownerId && !memberIds.includes(ownerId)) {
            memberIds.push(ownerId);
          }
        }

        if (!authoritativeSnapshotLoaded && memberIds.length === 0 && deepFetchError) {
          throw deepFetchError;
        }

        let channel;
        await withProjectChannelLock(
          { workspaceId, boardId, jobId: options.jobId },
          async () => {
            channel = await this.createProjectChannel(
              board,
              chatUser.flowTaskUserId,
              workspaceId,
            );
            if (authoritativeSnapshotLoaded || memberIds.length > 0) {
              await this.reconcileProjectMembers(
                channel._id,
                participants.length > 0 ? participants : memberIds,
                workspaceId,
                {
                  ownerFlowTaskId: ownerId,
                  membershipVersion,
                  syncContext: {
                    jobId: options.jobId,
                    requestId: options.requestId,
                    boardId,
                    userId: chatUser._id?.toString?.(),
                  },
                },
              );
            }
          },
        );

        const createdNow = channel.$locals?.flowTaskCreated === true
          || channel.__flowTaskCreated === true;
        counters.created += createdNow ? 1 : 0;
        counters.completed += 1;
        const result = {
          boardId,
          boardName: board.name || board.title || '',
          status: 'completed',
          created: createdNow,
          retryable: false,
          error: null,
        };
        await reportBoardState(result);
        return result;
      } catch (error) {
        const retryable = error.retryable === true
          || isRetryableMongoError(error)
          || (error.isAxiosError && !error.response)
          || Number(error.response?.status) >= 500
          || ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error.code);
        counters.failed += 1;
        logger.error("Failed to sync project channel", {
          jobId: options.jobId,
          requestId: options.requestId,
          workspaceId,
          userId: chatUser._id,
          boardId,
          boardName: board.name,
          retryable,
          error: error.message,
        });
        const result = {
          boardId,
          boardName: board.name || board.title || '',
          status: 'failed',
          created: false,
          retryable,
          error: error.message,
        };
        await reportBoardState(result);
        return result;
      } finally {
        counters.processed += 1;
        if (options.onProgress) {
          try {
            await options.onProgress({
              totalBoards: eligibleBoards.length,
              processedBoards: counters.processed,
              completedBoards: counters.completed,
              failedBoards: counters.failed,
            });
          } catch (progressError) {
            logger.warn('Failed to persist project-channel sync progress', {
              jobId: options.jobId,
              requestId: options.requestId,
              workspaceId,
              boardId,
              error: progressError.message,
            });
          }
        }
      }
      },
    );

    logger.info("[CHANNEL_SYNC] Project channels synced for user", {
      jobId: options.jobId,
      requestId: options.requestId,
      userId: chatUser._id,
      workspaceId,
      totalBoards: eligibleBoards.length,
      created: counters.created,
      synced: counters.completed,
      failed: counters.failed,
    });
    return {
      totalBoards: eligibleBoards.length,
      created: counters.created,
      completed: counters.completed,
      failed: counters.failed,
      results,
    };
  }

  // ──────────────────── Channel Retrieval ───────────────────────────────────

  /**
   * Get all channels for a user with unread counts.
   * @param {string} userId - User ID
   * @param {string} workspaceId - Workspace ID
   * @param {string} [role] - User's workspace role (optional, fetched if not provided)
   */
  async getChannelsForUser(userId, workspaceId, role = null) {
    // If role not provided, fetch it
    if (!role) {
      role = await workspaceRepository.getUserRole(userId, workspaceId);
    }

    // For guests, only return channels they are explicitly members of
    const isGuest = role === 'guest';
    const isAdmin = role === 'admin' || role === 'owner';

    let channels;
    if (isAdmin) {
      const workspaceChannels = await Channel.find({
        workspaceId,
        isArchived: false,
        type: { $ne: 'dm' }
      }).lean();

      const memberChannels = await channelRepository.findByMember(userId, {
        workspaceId,
      });
      const dmOnly = memberChannels.filter(c => c.type === 'dm');

      channels = [...workspaceChannels, ...dmOnly];
    } else {
      channels = await channelRepository.findByMember(userId, {
        workspaceId,
      });
    }

    // Guests only see channels they are explicit members of
    if (isGuest) {
      const decorated = await this._decorateDMChannels(channels, userId, workspaceId);

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

      logger.debug?.('[CHANNEL_FETCH] Channels resolved for guest user', {
        userId,
        workspaceId,
        memberChannels: channels.length,
        total: withPins.length,
      });

      return withPins;
    }

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


    const all = isAdmin ? channels : [...channels, ...missingPublic];

    const hiddenSlugs = Object.values(SYSTEM_CHANNELS)
      .filter((sc) => sc.uiHidden)
      .map((sc) => sc.slug);
    const visibleChannels = all.filter((c) => !hiddenSlugs.includes(c.slug));

    const decorated = await this._decorateDMChannels(visibleChannels, userId, workspaceId);

    // Merge per-user pin/star state
    const pins = await ChannelPin.getPinsForUser(userId, workspaceId);
    const pinMap = new Map(pins.map((p) => [p.channelId.toString(), p]));

    // Fetch the actual latest messages for these channels to handle stale previews
    // caused by direct database manipulation (bypassing the API).
    const channelIdsStr = decorated.map((c) => (c._id?.toString ? c._id.toString() : String(c._id)));
    const latestMessagesMap = await messageRepository.getLatestMessagesForChannels(channelIdsStr, workspaceId).catch(() => new Map());

    const withPins = decorated.map((ch) => {
      const raw = ch.toObject ? ch.toObject() : ch;
      const pin = pinMap.get(raw._id.toString());
      
      const actuallyHasMessage = latestMessagesMap.has(raw._id.toString());
      
      let safePreview = raw.lastMessagePreview;
      let safeTimestamp = raw.lastMessageAt;
      
      // If the channel has NO valid messages left in the database,
      // forcefully scrub both the preview and the timestamp so the client
      // renders a clean "No messages yet" state without stale dates.
      if (!actuallyHasMessage) {
        safePreview = '';
        safeTimestamp = null;
        
        // Fire-and-forget fix the DB record to prevent future stale state
        if (raw.lastMessagePreview || raw.lastMessageAt) {
          channelRepository.updateLastMessage(raw._id.toString(), '', null, workspaceId?.toString()).catch(() => {});
        }
      }
      
      return {
        ...raw,
        lastMessagePreview: safePreview,
        lastMessageAt: safeTimestamp,
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
      
      // Self-DM: single participant
      if (participants.length === 1 && participants[0] === currentId) {
        recipientIds.add(currentId);
      } else {
        // Regular DM: find the other user
        const recipientId = participants.find((p) => p && p !== currentId);
        if (recipientId) recipientIds.add(recipientId);
      }
    }

    if (recipientIds.size === 0) return channels;

    const users = await userRepository.findByIds([...recipientIds]);
    const byId = new Map(users.map((u) => [u._id.toString(), u]));

    return channels.map((channel) => {
      if (channel.type !== CHANNEL_TYPES.DM) return channel;

      const participants = Array.isArray(channel.dmParticipants)
        ? channel.dmParticipants.map((p) => p?.toString())
        : [];
      
      // Self-DM detection
      const isSelfDM = participants.length === 1 && participants[0] === currentId;
      
      if (isSelfDM) {
        const currentUser = byId.get(currentId);
        const raw = channel.toObject ? channel.toObject() : channel;
        return {
          ...raw,
          dmRecipientId: currentId,
          isSelfDM: true,
          name: `${currentUser?.name || 'You'} (You)`,
          avatar: currentUser?.avatar || raw.avatar || null,
        };
      }
      
      // Regular DM
      const recipientId = participants.find((p) => p && p !== currentId) || null;
      const recipient = recipientId ? byId.get(recipientId) : null;

      const raw = channel.toObject ? channel.toObject() : channel;
      return {
        ...raw,
        dmRecipientId: recipientId,
        isSelfDM: false,
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
        const canAccessChannel = permissionEngine.canAccessChannel(user, channel);
        const isPersistedMember = canAccessChannel
          ? true
          : await ChannelMember.isMember(channelId, userId);

        if (!canAccessChannel && !isPersistedMember) {
          throw new ForbiddenError("Access denied to this channel");
        }
      }
    }

    return channel;
  }

  /**
   * Get a single channel by slug.
   */
  async getChannelBySlug(slug, workspaceId, userId) {
    const channel = await channelRepository.findBySlug(slug, workspaceId);
    if (!channel) {
      throw new NotFoundError("Channel not found");
    }
    return this.getChannelById(channel._id, userId, workspaceId);
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
    addedByUserId = null,
  ) {
    const channel = await channelRepository.findById(channelId, {
      workspaceId,
    });
    if (!channel) throw new NotFoundError("Channel not found");
    if (channel.isArchived) throw new ForbiddenError("Channel is archived");

    const effectiveWsId = channel.workspaceId?.toString();
    const resolvedWorkspaceId = effectiveWsId || workspaceId;
    const { chatUserId } = await this.resolveAndValidateDMTarget(
      userId,
      resolvedWorkspaceId,
      null,
    );

    // Always go through repository to keep ChannelMember and embedded members in sync.
    const updated = await channelRepository.addMember(
      channelId,
      chatUserId,
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
    emitToUser(chatUserId.toString(), SOCKET_EVENTS.CHANNEL_ADDED, {
      channel: channelPayload,
    }, effectiveWsId);
    joinChannelRoom(chatUserId.toString(), channelId.toString(), effectiveWsId);

    // Notify channel
    emitToChannel(
      channelId.toString(),
      SOCKET_EVENTS.MEMBER_JOINED,
      {
        channelId,
        userId: chatUserId,
      },
      channel.workspaceId?.toString(),
    );

    // Persist channel invite notification
    import("../notifications/notification.service.js").then(
      async ({ default: notificationService }) => {
        let inviterName = "System";
        if (addedByUserId) {
          const inviter = await userRepository.findById(addedByUserId);
          if (inviter) {
            inviterName = inviter.name;
          }
        }
        notificationService
          .createChannelInviteNotification({
            workspaceId: channel.workspaceId,
            recipientId: chatUserId,
            channelId: channel._id,
            channelName: channel.name,
            inviterName,
            inviterId: addedByUserId,
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
   * Reconcile a project channel to the exact FlowTask project member set.
   * This is the persistent source-of-truth path used for project channels.
   */
  async reconcileProjectMembers(
    channelId,
    flowTaskParticipants,
    workspaceId,
    options = {},
  ) {
    const lockToken = crypto.randomUUID();
    const delays = [25, 75, 150, 300, 600];
    let locked = false;

    for (const delay of delays) {
      const now = new Date();
      const claimed = await Channel.findOneAndUpdate(
        {
          _id: channelId,
          $or: [
            { 'membershipSyncLock.expiresAt': { $lt: now } },
            { 'membershipSyncLock.expiresAt': null },
            { membershipSyncLock: { $exists: false } },
          ],
        },
        {
          $set: {
            membershipSyncLock: {
              token: lockToken,
              expiresAt: new Date(Date.now() + 60_000),
            },
          },
        },
        { returnDocument: 'after' },
      );
      if (claimed) {
        locked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (!locked) {
      const error = new ConflictError('Project membership reconciliation is busy; retry');
      error.retryable = true;
      throw error;
    }

    const heartbeat = setInterval(() => {
      Channel.updateOne(
        { _id: channelId, 'membershipSyncLock.token': lockToken },
        { $set: { 'membershipSyncLock.expiresAt': new Date(Date.now() + 60_000) } },
      ).catch((error) => logger.warn('Project membership lock heartbeat failed', {
        channelId,
        workspaceId,
        jobId: options.syncContext?.jobId,
        boardId: options.syncContext?.boardId,
        error: error.message,
      }));
    }, 20_000);
    heartbeat.unref?.();

    try {
      return await this._reconcileProjectMembersUnlocked(
        channelId,
        flowTaskParticipants,
        workspaceId,
        options,
      );
    } finally {
      clearInterval(heartbeat);
      await Channel.updateOne(
        { _id: channelId, 'membershipSyncLock.token': lockToken },
        {
          $set: {
            'membershipSyncLock.token': null,
            'membershipSyncLock.expiresAt': null,
          },
        },
      );
    }
  }

  async _reconcileProjectMembersUnlocked(
    channelId,
    flowTaskParticipants,
    workspaceId,
    { ownerFlowTaskId = null, membershipVersion = 0, syncContext = {} } = {},
  ) {
    const channel = await channelRepository.findById(channelId, {
      workspaceId,
    });
    if (!channel) throw new NotFoundError("Channel not found");

    if (
      membershipVersion > 0 &&
      (channel.flowTaskMembershipVersion || 0) > membershipVersion
    ) {
      logger.info("Ignored stale project membership snapshot", {
        channelId,
        receivedVersion: membershipVersion,
        appliedVersion: channel.flowTaskMembershipVersion,
      });
      return channel;
    }

    const effectiveWorkspaceId = channel.workspaceId?.toString() || workspaceId;
    const desiredFlowTaskIds = new Set();
    const participantById = new Map();

    for (const participant of flowTaskParticipants || []) {
      const flowTaskUserId = typeof participant === "string"
        ? participant
        : participant?.flowTaskUserId || participant?._id || participant?.id;
      if (!flowTaskUserId) continue;
      const normalizedId = flowTaskUserId.toString();
      desiredFlowTaskIds.add(normalizedId);
      participantById.set(normalizedId, typeof participant === "string"
        ? { flowTaskUserId: normalizedId }
        : participant);
    }
    if (ownerFlowTaskId) {
      desiredFlowTaskIds.add(ownerFlowTaskId.toString());
    }

    const existingMembers = await channelRepository.listActiveMembers(channelId, {
      workspaceId: effectiveWorkspaceId,
    });
    const existingUserIds = new Set(
      existingMembers
        .map((member) => member.userId?._id?.toString() || member.userId?.toString())
        .filter(Boolean),
    );

    const candidateEmails = [...participantById.values()]
      .map((participant) => participant.email?.trim().toLowerCase())
      .filter(Boolean);
    const chatUsers = desiredFlowTaskIds.size > 0
      ? await userRepository.findByFlowTaskIdentityCandidates(
          [...desiredFlowTaskIds],
          [...new Set(candidateEmails)],
        )
      : [];
    const usersByFlowTaskId = new Map(
      chatUsers
        .filter((user) => user.flowTaskUserId)
        .map((user) => [user.flowTaskUserId.toString(), user]),
    );
    const usersByVerifiedEmail = new Map(
      chatUsers
        .filter((user) => user.emailVerified && user.email)
        .map((user) => [user.email.trim().toLowerCase(), user]),
    );
    const registeredMatches = [];
    const claimedChatUserIds = new Map();

    for (const flowTaskUserId of desiredFlowTaskIds) {
      const participant = participantById.get(flowTaskUserId) || {};
      const normalizedEmail = participant.email?.trim().toLowerCase();
      const byId = usersByFlowTaskId.get(flowTaskUserId);
      const byEmail = normalizedEmail
        ? usersByVerifiedEmail.get(normalizedEmail)
        : null;

      if (byId && byEmail && byId._id.toString() !== byEmail._id.toString()) {
        throw new ConflictError(
          `FlowTask identity conflict for participant ${flowTaskUserId}`,
        );
      }

      let user = byId || byEmail;
      if (!user || user.isActive === false) continue;
      if (user.authProvider !== "native" && !user.registeredAt) continue;

      const userId = user._id.toString();
      const previouslyClaimedFlowTaskId = claimedChatUserIds.get(userId);
      if (
        previouslyClaimedFlowTaskId &&
        previouslyClaimedFlowTaskId !== flowTaskUserId
      ) {
        throw new ConflictError(
          `ChatApp identity matches multiple FlowTask participants: ${userId}`,
        );
      }

      if (user.flowTaskUserId && user.flowTaskUserId.toString() !== flowTaskUserId) {
        throw new ConflictError(
          `Verified email is already linked to another FlowTask identity: ${userId}`,
        );
      }
      if (!user.flowTaskUserId) {
        const linkedUser = await userRepository.linkFlowTaskIdentity(
          user._id,
          flowTaskUserId,
        );
        if (!linkedUser) {
          throw new ConflictError(
            `FlowTask identity could not be linked safely: ${flowTaskUserId}`,
          );
        }
        user = linkedUser;
      }

      claimedChatUserIds.set(userId, flowTaskUserId);
      registeredMatches.push({ user, flowTaskUserId });
    }

    const registeredUsers = registeredMatches.map(({ user }) => user);
    const desiredMembers = registeredUsers.map((user) => ({
      userId: user._id,
      role:
        ownerFlowTaskId &&
        user.flowTaskUserId?.toString() === ownerFlowTaskId.toString()
          ? CHANNEL_MEMBER_ROLES.OWNER
          : CHANNEL_MEMBER_ROLES.MEMBER,
    }));

    const desiredUserIds = new Set(
      desiredMembers.map((member) => member.userId.toString()),
    );

    const updated = await channelRepository.reconcileMembers(
      channelId,
      desiredMembers,
      effectiveWorkspaceId,
      syncContext,
    );

    const registeredFlowTaskIds = new Set(
      registeredMatches.map(({ flowTaskUserId }) => flowTaskUserId),
    );
    const pendingParticipants = [...desiredFlowTaskIds]
      .filter((flowTaskUserId) => !registeredFlowTaskIds.has(flowTaskUserId))
      .map((flowTaskUserId) => participantById.get(flowTaskUserId) || { flowTaskUserId });
    const pendingIds = pendingParticipants.map((participant) => participant.flowTaskUserId);

    await PendingChannelParticipant.updateMany(
      {
        channelId,
        isActive: true,
        flowTaskUserId: { $nin: pendingIds },
      },
      { $set: { isActive: false } },
    );

    if (pendingParticipants.length > 0) {
      await PendingChannelParticipant.bulkWrite(
        pendingParticipants.map((participant) => ({
          updateOne: {
            filter: { channelId, flowTaskUserId: participant.flowTaskUserId },
            update: {
              $set: {
                workspaceId: effectiveWorkspaceId,
                normalizedEmail: participant.email?.trim().toLowerCase() || "",
                name: participant.name || "FlowTask participant",
                avatar: participant.avatar || null,
                role: participant.role || "employee",
                sources: participant.sources || [],
                isActive: true,
                convertedToUserId: null,
                convertedAt: null,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    if (registeredFlowTaskIds.size > 0) {
      await PendingChannelParticipant.updateMany(
        {
          channelId,
          flowTaskUserId: { $in: [...registeredFlowTaskIds] },
        },
        { $set: { isActive: false, convertedAt: new Date() } },
      );
    }

    if (membershipVersion > 0) {
      await Channel.updateOne(
        { _id: channelId },
        { $max: { flowTaskMembershipVersion: membershipVersion } },
      );
    }

    const syncChannelPayload = updated
      ? {
          _id: updated._id,
          name: updated.name,
          slug: updated.slug,
          type: updated.type,
          visibility: updated.visibility,
          description: updated.description,
          memberCount: updated.memberCount,
          workspaceId: updated.workspaceId,
          createdBy: updated.createdBy,
        }
      : null;

    for (const user of registeredUsers) {
      const userId = user._id.toString();
      if (existingUserIds.has(userId) || !syncChannelPayload) continue;

      emitToUser(
        userId,
        SOCKET_EVENTS.CHANNEL_ADDED,
        { channel: syncChannelPayload },
        effectiveWorkspaceId,
      );
      joinChannelRoom(userId, channelId.toString(), effectiveWorkspaceId);
    }

    for (const userId of existingUserIds) {
      if (desiredUserIds.has(userId)) continue;

      emitToUser(
        userId,
        SOCKET_EVENTS.CHANNEL_REMOVED,
        { channelId },
        effectiveWorkspaceId,
      );
      await leaveChannelRoom(userId, channelId.toString(), effectiveWorkspaceId);
    }

    emitToChannel(
      channelId.toString(),
      SOCKET_EVENTS.CHANNEL_MEMBERS_UPDATED,
      {
        channelId,
        memberCount: updated?.memberCount || desiredMembers.length,
      },
      effectiveWorkspaceId,
    );

    logger.info("Project channel members reconciled", {
      channelId,
      desired: desiredMembers.length,
      added: [...desiredUserIds].filter((userId) => !existingUserIds.has(userId))
        .length,
      removed: [...existingUserIds].filter((userId) => !desiredUserIds.has(userId))
        .length,
    });

    return updated;
  }

  /**
   * Convert pending project participants after a real ChatApp account signs in.
   * Stable FlowTask ID wins; normalized verified email is the fallback.
   */
  async activatePendingParticipantsForUser(chatUser, workspaceId) {
    const identityFilters = [];
    if (chatUser.flowTaskUserId) {
      identityFilters.push({ flowTaskUserId: chatUser.flowTaskUserId.toString() });
    }
    if (chatUser.emailVerified && chatUser.email) {
      identityFilters.push({ normalizedEmail: chatUser.email.trim().toLowerCase() });
    }
    if (identityFilters.length === 0) return { converted: 0 };

    const pendingFilter = {
      isActive: true,
      $or: identityFilters,
    };
    if (workspaceId) pendingFilter.workspaceId = workspaceId;
    const pending = await PendingChannelParticipant.find(pendingFilter).lean();
    const pendingFlowTaskIds = [...new Set(
      pending.map((item) => item.flowTaskUserId).filter(Boolean),
    )];
    if (
      chatUser.flowTaskUserId &&
      pendingFlowTaskIds.some(
        (flowTaskUserId) =>
          flowTaskUserId !== chatUser.flowTaskUserId.toString(),
      )
    ) {
      throw new ConflictError(
        'Verified email matches a different pending FlowTask identity',
      );
    }
    if (!chatUser.flowTaskUserId && pendingFlowTaskIds.length > 1) {
      throw new ConflictError(
        'Verified email matches multiple pending FlowTask identities',
      );
    }
    if (!chatUser.flowTaskUserId && pendingFlowTaskIds.length === 1) {
      const linkedUser = await userRepository.linkFlowTaskIdentity(
        chatUser._id,
        pendingFlowTaskIds[0],
      );
      if (!linkedUser) {
        throw new ConflictError('Pending FlowTask identity could not be linked safely');
      }
      chatUser.flowTaskUserId = linkedUser.flowTaskUserId;
    }

    const channels = new Map();
    for (const item of pending) {
      channels.set(item.channelId.toString(), item.workspaceId.toString());
    }
    for (const [channelId, pendingWorkspaceId] of channels) {
      if (!await workspaceRepository.isMember(chatUser._id, pendingWorkspaceId)) {
        await workspaceRepository.addMember(
          chatUser._id,
          pendingWorkspaceId,
          'member',
        );
      }
      await this.addMember(
        channelId,
        chatUser._id,
        CHANNEL_MEMBER_ROLES.MEMBER,
        pendingWorkspaceId,
      );
    }

    if (pending.length > 0) {
      await PendingChannelParticipant.updateMany(
        { _id: { $in: pending.map((item) => item._id) } },
        {
          $set: {
            isActive: false,
            convertedToUserId: chatUser._id,
            convertedAt: new Date(),
          },
        },
      );

      for (const [channelId, pendingWorkspaceId] of channels) {
        emitToChannel(
          channelId,
          SOCKET_EVENTS.CHANNEL_MEMBERS_UPDATED,
          { channelId },
          pendingWorkspaceId,
        );
      }
    }

    logger.info("Pending FlowTask participants activated", {
      workspaceId: workspaceId || 'all-matching-workspaces',
      chatUserId: chatUser._id,
      converted: pending.length,
    });
    return { converted: pending.length };
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

    // Persist channel remove notification
    if (userId.toString() !== removedBy?.toString()) {
      import("../notifications/notification.service.js").then(
        async ({ default: notificationService }) => {
          let removerName = "System";
          if (removedBy && removedBy !== "system") {
            const remover = await userRepository.findById(removedBy);
            if (remover) removerName = remover.name;
          }
          notificationService
            .createChannelRemoveNotification({
              workspaceId: channel.workspaceId,
              recipientId: userId,
              channelId: channel._id,
              channelName: channel.name,
              removerName,
              removerId: removedBy === "system" ? null : removedBy,
            })
            .catch(() => {});
        },
      );
    }

    return updated;
  }

  // ──────────────────── Channel Updates ─────────────────────────────────────

  /**
   * Update channel details (name, description, topic, visibility).
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
      if (updates.visibility !== undefined) {
        throw new ForbiddenError(
          "Cannot change visibility of a system-managed channel.",
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
    if (updates.visibility !== undefined) {
      const normalizedVisibility = updates.visibility?.toLowerCase?.();
      if (
        normalizedVisibility === CHANNEL_VISIBILITY.PUBLIC ||
        normalizedVisibility === CHANNEL_VISIBILITY.PRIVATE
      ) {
        allowed.visibility = normalizedVisibility;
      }
    }
    if (updates.adminOverrides !== undefined) {
      allowed.adminOverrides = updates.adminOverrides;
    }
    if (updates.departmentRef !== undefined) {
      allowed.departmentRef = updates.departmentRef;
    }
    if (updates.isArchived !== undefined) {
      allowed.isArchived = updates.isArchived;
      if (!updates.isArchived) {
        allowed.archivedAt = null;
        allowed.archivedBy = null;
      }
    }

    // Detect visibility change for workspace-wide broadcast
    const visibilityChanged =
      allowed.visibility !== undefined &&
      allowed.visibility !== channel.visibility;

    const updated = await channelRepository.update(
      channelId,
      allowed,
      workspaceId,
    );

    const socketPayload = {
      channelId,
      updates: allowed,
      updatedBy: userId,
    };

    // Always notify channel members
    emitToChannel(
      channelId.toString(),
      SOCKET_EVENTS.CHANNEL_UPDATED,
      socketPayload,
      channel.workspaceId?.toString(),
    );

    // When visibility changes, broadcast to the entire workspace so non-members
    // also update their channel lists (e.g., channel directory, search results).
    if (visibilityChanged) {
      const wsId = channel.workspaceId?.toString() || workspaceId;
      if (wsId) {
        emitToWorkspace(wsId, SOCKET_EVENTS.CHANNEL_UPDATED, socketPayload);
      }
    }

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

  // ──────────────────── Channel Members ─────────────────────────────────────

  /**
   * Get persisted members for a channel from the ChatApp database.
   * Project channels are reconciled from FlowTask, but the database remains the
   * runtime source of truth for refresh-safe rendering.
   */
  async getAggregatedMembers(channelId, token, workspaceId) {
    const channel = await channelRepository.findById(channelId, {
      workspaceId,
    });
    if (!channel) throw new NotFoundError("Channel not found");

    const [members, pendingParticipants] = await Promise.all([
      channelRepository.listActiveMembers(channelId, {
        workspaceId: channel.workspaceId?.toString() || workspaceId,
      }),
      PendingChannelParticipant.find({ channelId, isActive: true }).lean(),
    ]);

    const activeMembers = members
      .map((member) => {
        const user = member.userId;
        if (!user) return null;

        return {
          _id: user._id,
          flowTaskUserId: user.flowTaskUserId,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          onlineStatus: user.onlineStatus || "offline",
          isActive: user.isActive !== false,
          registrationStatus: "active",
          source: ["channel"],
          channelRole: member.role,
          joinedAt: member.joinedAt,
        };
      })
      .filter(Boolean);

    const pendingMembers = pendingParticipants.map((participant) => ({
      _id: `pending:${participant.flowTaskUserId}`,
      flowTaskUserId: participant.flowTaskUserId,
      name: participant.name,
      email: participant.normalizedEmail,
      avatar: participant.avatar,
      role: participant.role,
      onlineStatus: "offline",
      isActive: false,
      registrationStatus: "faded",
      source: participant.sources,
      channelRole: "participant",
      joinedAt: participant.createdAt,
    }));

    return [...activeMembers, ...pendingMembers]
      .sort((a, b) => {
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
      slug: `ai-${userId}`,
    });
  }

  async createAIDMChannel(userId, workspaceId) {
    const slug = `ai-${userId}`;
    const channel = await Channel.findOneAndUpdate(
      { workspaceId, slug },
      {
        $setOnInsert: {
          name: "ChatBot",
          slug,
          type: "dm",
          isAI: true,
          members: [{ userId }],
          memberCount: 1,
          workspaceId,
        }
      },
      { upsert: true, new: true }
    );

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

    // Keep the favorites system (UserFavorite) in sync so the web app's
    // favorites-driven star UI reflects mobile changes in real time.
    try {
      const targetType =
        channel.visibility === 'private' || channel.type === 'private'
          ? 'private_channel'
          : channel.type === 'project'
            ? 'project'
            : channel.type === 'dm'
              ? 'dm'
              : 'channel';
      await favoritesService.syncChannelFavorite(
        userId,
        workspaceId,
        channelId,
        targetType,
        result.isStarred,
      );
    } catch (err) {
      logger.warn('[Channel] Failed to sync channel favorite:', err?.message || err);
    }

    emitToUser(userId.toString(), SOCKET_EVENTS.CHANNEL_UPDATED, {
      channelId: channelId.toString(),
      updates: { isStarred: result.isStarred },
    }, workspaceId?.toString());

    return result;
  }
}
export default new ChannelService();
