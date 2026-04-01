import channelService from "./channel.service.js";
import asyncHandler from "../../middleware/asyncHandler.js";

/**
 * Channel Controller — REST endpoints for channel operations.
 */

/**
 * GET /api/chat/channels
 * Get all channels for the authenticated user.
 */
export const getChannels = asyncHandler(async (req, res) => {
  const channels = await channelService.getChannelsForUser(
    req.user._id,
    req.workspaceId,
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

  res.json({
    success: true,
    data: { channel },
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
 * Create or get a DM channel between current user and target.
 *
 * Validates that:
 *  1. targetUserId is provided
 *  2. Target user exists in ChatApp within this workspace
 *  3. Target user is active
 *  4. Sender is not messaging themselves
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

    // ── Create or retrieve existing DM channel ──
    const channel = await channelService.getOrCreateDM(
      senderId,
      chatUserId,
      workspaceId,
    );

    res.status(200).json({
      success: true,
      data: { channel },
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
 * Get aggregated members for a channel.
 * For project channels: board members + task assignees + channel members (deduplicated).
 * For other channels: channel members.
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
    data: { members, total: members.length },
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
