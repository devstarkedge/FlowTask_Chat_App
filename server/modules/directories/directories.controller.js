import directoriesService from './directories.service.js';
import asyncHandler from '../../middleware/asyncHandler.js';

/**
 * GET /api/chat/directories/users
 * People tab — workspace members.
 */
export const getUsers = asyncHandler(async (req, res) => {
  const { search, title, location, sort, page, limit } = req.query;

  // Prefer FlowTask token from auth middleware or explicit header
  const flowTaskToken = req.flowTaskToken || req.headers['x-flowtask-token'] || null;

  const result = await directoriesService.getUsers(req.user._id, req.workspaceId, {
    search,
    title,
    location,
    sort,
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? Math.min(parseInt(limit, 10), 100) : 50,
  }, flowTaskToken);

  res.json({ success: true, data: result });
});

/**
 * GET /api/chat/directories/channels
 * Channels tab — all workspace channels with isJoined flag.
 */
export const getChannels = asyncHandler(async (req, res) => {
  const { search, type, sort, page, limit } = req.query;

  const result = await directoriesService.getChannels(req.user._id, req.workspaceId, {
    search,
    type,
    sort,
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? Math.min(parseInt(limit, 10), 100) : 50,
  });

  res.json({ success: true, data: result });
});

/**
 * GET /api/chat/directories/groups
 * User Groups tab — list user groups.
 */
export const getGroups = asyncHandler(async (req, res) => {
  const { search, sort } = req.query;
  const groups = await directoriesService.getGroups(req.workspaceId, { search, sort });

  res.json({ success: true, data: { groups } });
});

/**
 * GET /api/chat/directories/groups/:id
 * Single user group with members.
 */
export const getGroupById = asyncHandler(async (req, res) => {
  const group = await directoriesService.getGroupById(req.params.id, req.workspaceId);

  res.json({ success: true, data: { group } });
});

/**
 * POST /api/chat/directories/groups
 * Create a user group (admin/owner only).
 */
export const createGroup = asyncHandler(async (req, res) => {
  const group = await directoriesService.createGroup(req.body, req.user._id, req.workspaceId);

  res.status(201).json({ success: true, data: { group } });
});

/**
 * PUT /api/chat/directories/groups/:id
 * Update a user group (admin/owner only).
 */
export const updateGroup = asyncHandler(async (req, res) => {
  const group = await directoriesService.updateGroup(req.params.id, req.body, req.workspaceId);

  res.json({ success: true, data: { group } });
});

/**
 * DELETE /api/chat/directories/groups/:id
 * Delete a user group (admin/owner only).
 */
export const deleteGroup = asyncHandler(async (req, res) => {
  await directoriesService.deleteGroup(req.params.id, req.workspaceId);

  res.json({ success: true, data: { message: 'Group deleted' } });
});

/**
 * GET /api/chat/directories/external
 * External/guest users in the workspace.
 */
export const getExternalUsers = asyncHandler(async (req, res) => {
  const { search, status, page, limit } = req.query;
  const result = await directoriesService.getExternalUsers(req.workspaceId, { 
    search, 
    status,
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? Math.min(parseInt(limit, 10), 100) : 50,
  });

  res.json({ success: true, data: result });
});

/**
 * GET /api/chat/directories/invitations
 * Workspace invitations list.
 */
export const getInvitations = asyncHandler(async (req, res) => {
  const invitations = await directoriesService.getInvitations(req.workspaceId);

  res.json({ success: true, data: { invitations } });
});
