import channelService from "./channel.service.js";
import Channel from "./Channel.model.js";
import asyncHandler from "../../middleware/asyncHandler.js";

function isSystemManagedProjectChannel(channel) {
  return channel?.type === "project" && channel?.systemManaged;
}

/**
 * Channel Controller — REST endpoints for channel operations.
 */

/**
 * GET /api/chat/channels
 * Get all channels for the authenticated user.
 */
export const getChannels = asyncHandler(async (req, res) => {
  const role = req.membership?.role || null;
  const channels = await channelService.getChannelsForUser(
    req.user._id,
    req.workspaceId,
    role,
  );

  res.json({
    success: true,
    data: { channels },
  });
});

/**
 * GET /api/chat/channels/:id
 * Get a single channel by ID.
 */
export const getChannel = asyncHandler(async (req, res) => {
  const channel = await channelService.getChannelById(
    req.params.id,
    req.user._id,
    req.workspaceId,
  );

  let decoratedChannel = channel;
  if (channel && channel.type === 'dm') {
    const decorated = await channelService._decorateDMChannels([channel], req.user._id, req.workspaceId);
    decoratedChannel = decorated[0];
  }

  res.json({
    success: true,
    data: { channel: decoratedChannel },
  });
});

/**
 * GET /api/chat/channels/slug/:slug
 * Get a channel by slug.
 */
export const getChannelBySlug = asyncHandler(async (req, res) => {
  const channel = await channelService.getChannelBySlug(
    req.params.slug,
    req.workspaceId,
    req.user._id,
  );

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * POST /api/chat/channels
 * Create a custom channel.
 */
export const createChannel = asyncHandler(async (req, res) => {
  const { name, description, visibility, memberIds } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: { message: "Channel name is required (min 2 characters)" },
    });
  }

  if (name.trim().length > 80) {
    return res.status(400).json({
      success: false,
      error: { message: "Channel name must not exceed 80 characters" },
    });
  }

  const channel = await channelService.createCustomChannel(
    { name: name.trim(), description, visibility, memberIds },
    req.user._id,
    req.workspaceId,
  );

  res.status(201).json({
    success: true,
    data: { channel },
  });
});

/**
 * PUT /api/chat/channels/:id
 * Update channel details.
 */
export const updateChannel = asyncHandler(async (req, res) => {
  const channel = await channelService.updateChannel(
    req.params.id,
    req.body,
    req.user._id,
    req.workspaceId,
  );

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * POST /api/chat/channels/:id/archive
 * Archive a channel.
 */
export const archiveChannel = asyncHandler(async (req, res) => {
  const channel = await channelService.archiveChannel(
    req.params.id,
    req.user._id,
    req.workspaceId,
  );

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * POST /api/chat/channels/dm
 * Create or get a DM channel between current user and target (or self-DM if same user).
 *
 * Validates that:
 *  1. targetUserId is provided
 *  2. Target user exists in ChatApp within this workspace
 *  3. Target user is active
 *
 * Returns 403 with USER_NOT_IN_WORKSPACE if target hasn't joined ChatApp.
 */
export const createDM = asyncHandler(async (req, res) => {
  const { targetUserId } = req.body;
  const { _id: senderId } = req.user;
  const workspaceId = req.workspaceId;
  const workspaceName = req.workspace?.name || "";

  if (!targetUserId) {
    return res.status(400).json({
      success: false,
      error: { message: "targetUserId is required" },
    });
  }

  try {
    // ── Resolve & validate target user exists in this workspace ──
    const flowTaskToken = req.flowTaskToken || req.headers["x-flowtask-token"];
    const { chatUserId } = await channelService.resolveAndValidateDMTarget(
      targetUserId,
      workspaceId,
      workspaceName,
      flowTaskToken,
    );

    // ── Create or retrieve existing DM channel (supports self-DM) ──
    const channel = await channelService.getOrCreateDM(
      senderId,
      chatUserId,
      workspaceId,
    );

    const decorated = await channelService._decorateDMChannels([channel], senderId, workspaceId);

    res.status(200).json({
      success: true,
      data: { channel: decorated[0] },
    });
  } catch (error) {
    // Surface user-friendly forbidden errors to the client
    if (error.name === "ForbiddenError" || error.statusCode === 403) {
      const logger = (await import("../../utils/logger.js")).default;
      logger.warn("DM creation blocked", {
        senderId: senderId.toString(),
        targetUserId,
        workspaceId,
        reason: "target_not_in_workspace",
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.status(403).json({
        success: false,
        error: {
          code: "USER_NOT_IN_WORKSPACE",
          message: error.message,
        },
      });
    }
    throw error; // Re-throw other errors to asyncHandler
  }
});

/**
 * POST /api/chat/channels/:id/members
 * Add a member to a channel.
 */
export const addMember = asyncHandler(async (req, res) => {
  const { userId, role } = req.body;

  if (isSystemManagedProjectChannel(req.channel)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "PROJECT_CHANNEL_MEMBERS_MANAGED",
        message:
          "Project channel members are synced from FlowTask and cannot be changed manually",
      },
    });
  }

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: { message: "userId is required" },
    });
  }

  const channel = await channelService.addMember(
    req.params.id,
    userId,
    role,
    req.workspaceId,
    req.user._id,
  );

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * DELETE /api/chat/channels/:id/members/:userId
 * Remove a member from a channel.
 */
export const removeMember = asyncHandler(async (req, res) => {
  if (isSystemManagedProjectChannel(req.channel)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "PROJECT_CHANNEL_MEMBERS_MANAGED",
        message:
          "Project channel members are synced from FlowTask and cannot be changed manually",
      },
    });
  }

  const channel = await channelService.removeMember(
    req.params.id,
    req.params.userId,
    req.user._id,
    req.workspaceId,
  );

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * POST /api/chat/channels/:id/leave
 * Leave a channel (self-remove).
 */
export const leaveChannel = asyncHandler(async (req, res) => {
  if (isSystemManagedProjectChannel(req.channel)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "PROJECT_CHANNEL_MEMBERS_MANAGED",
        message:
          "Project channel members are synced from FlowTask and cannot be changed manually",
      },
    });
  }

  const channel = await channelService.removeMember(
    req.params.id,
    req.user._id,
    req.user._id,
    req.workspaceId,
  );

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * GET /api/chat/channels/search?q=...
 * Search channels by name.
 */
export const searchChannels = asyncHandler(async (req, res) => {
  const channels = await channelService.searchChannels(
    req.query.q || "",
    req.user._id,
    req.workspaceId,
  );

  res.json({
    success: true,
    data: { channels },
  });
});

/**
 * GET /api/chat/channels/:id/members
 * Get persisted members for a channel.
 */
export const getChannelMembers = asyncHandler(async (req, res) => {
  const token = req.flowTaskToken;
  const members = await channelService.getAggregatedMembers(
    req.params.id,
    token,
    req.workspaceId,
  );

  res.json({
    success: true,
    data: { members, total: members.length, memberCount: members.length },
  });
});

export const createAIDM = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;

  // 1 Check if AI DM already exists
  let channel = await channelService.getAIDMChannel(userId, workspaceId);

  // 2 Create if not exists
  if (!channel) {
    channel = await channelService.createAIDMChannel(userId, workspaceId);
  }

  // 3 Ensure AI flag is set
  if (!channel.isAI) {
    channel.isAI = true;
    await channel.save();
  }

  // 4 Response
  res.json({
    success: true,
    data: {
      channelId: channel._id,
    },
  });
});

/**
 * POST /api/chat/channels/self-dm
 * Create or return the user's self-DM (saved messages).
 * Returns: { channelId }
 */
export const createSelfDM = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;

  // Reuse DM creation logic (self-DM is a DM with same sender/recipient)
  const channel = await channelService.getOrCreateDM(userId, userId, workspaceId);

  res.json({
    success: true,
    data: { channelId: channel._id },
  });
});

/**
 * PUT /api/chat/channels/:id/pin
 * Toggle pin state for a channel (per-user).
 */
export const pinChannel = asyncHandler(async (req, res) => {
  const result = await channelService.togglePinChannel(
    req.user._id,
    req.params.id,
    req.workspaceId,
  );

  res.json({
    success: true,
    data: result,
  });
});

/**
 * PUT /api/chat/channels/:id/star
 * Toggle star state for a channel (per-user).
 */
export const starChannel = asyncHandler(async (req, res) => {
  const result = await channelService.toggleStarChannel(
    req.user._id,
    req.params.id,
    req.workspaceId,
  );

  res.json({
    success: true,
    data: result,
  });
});

/**
 * DEPRECATED: PUT /api/chat/channels/:id/category
 */
export const assignCategory = asyncHandler(async (req, res) => {
 res.status(400).json({ success: false, error: { message: "This endpoint is deprecated. Use /api/categories/:id/channels instead." } });
});

/**
 * DEPRECATED: PUT /api/chat/channels/:id/department
 */
export const assignDepartment = asyncHandler(async (req, res) => {
  res.status(400).json({ success: false, error: { message: "This endpoint is deprecated. Create a department category instead." } });
});

/**
 * DEPRECATED: POST /api/chat/channels/bulk-category
 */
export const bulkAssignCategory = asyncHandler(async (req, res) => {
 res.status(400).json({ success: false, error: { message: "This endpoint is deprecated. Use /api/categories/:id/channels instead." } });
});
