import workspaceService from './workspace.service.js';
import asyncHandler from '../../middleware/asyncHandler.js';

/**
 * Workspace Controller — HTTP handlers for workspace management.
 */

// ─── Workspace CRUD ──────────────────────────────────────────────────────────

export const createWorkspace = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.createWorkspace(req.body, req.user._id);
  res.status(201).json({ success: true, data: workspace });
});

export const getWorkspace = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.getWorkspace(req.params.id);
  res.json({ success: true, data: workspace });
});

export const getWorkspaceBySlug = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.getWorkspaceBySlug(req.params.slug);
  res.json({ success: true, data: workspace });
});

export const updateWorkspace = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.updateWorkspace(
    req.params.id,
    req.body,
    req.user._id,
  );
  res.json({ success: true, data: workspace });
});

export const deleteWorkspace = asyncHandler(async (req, res) => {
  const result = await workspaceService.deleteWorkspace(req.params.id, req.user._id);
  res.json({ success: true, ...result });
});

// ─── User's Workspaces ──────────────────────────────────────────────────────

export const getMyWorkspaces = asyncHandler(async (req, res) => {
  const workspaces = await workspaceService.getUserWorkspaces(req.user._id);
  res.json({ success: true, data: workspaces });
});

// ─── Membership ─────────────────────────────────────────────────────────────

export const getMembers = asyncHandler(async (req, res) => {
  const members = await workspaceService.getWorkspaceMembers(
    req.params.id,
    { role: req.query.role },
  );
  res.json({ success: true, data: members });
});

export const inviteMember = asyncHandler(async (req, res) => {
  const membership = await workspaceService.inviteMember(
    req.params.id,
    req.body.userId,
    req.body.role,
    req.user._id,
  );
  res.status(201).json({ success: true, data: membership });
});

export const removeMember = asyncHandler(async (req, res) => {
  const result = await workspaceService.removeMember(
    req.params.id,
    req.params.userId,
    req.user._id,
  );
  res.json({ success: true, ...result });
});

export const updateMemberRole = asyncHandler(async (req, res) => {
  const membership = await workspaceService.updateMemberRole(
    req.params.id,
    req.params.userId,
    req.body.role,
    req.user._id,
  );
  res.json({ success: true, data: membership });
});

export const leaveWorkspace = asyncHandler(async (req, res) => {
  const result = await workspaceService.leaveWorkspace(req.params.id, req.user._id);
  res.json({ success: true, ...result });
});

// ─── Invite Code ────────────────────────────────────────────────────────────

export const joinByInviteCode = asyncHandler(async (req, res) => {
  const result = await workspaceService.joinByInviteCode(req.body.inviteCode, req.user._id);
  res.json({ success: true, data: result });
});

export const regenerateInviteCode = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.regenerateInviteCode(req.params.id, req.user._id);
  res.json({ success: true, data: { inviteCode: workspace.inviteCode } });
});

// ─── Email Invites ──────────────────────────────────────────────────────────────────

export const inviteByEmail = asyncHandler(async (req, res) => {
  const result = await workspaceService.inviteByEmail(
    req.params.id,
    req.body.email,
    req.body.role,
    req.user._id,
  );
  res.status(201).json({ success: true, data: result });
});

export const acceptInvite = asyncHandler(async (req, res) => {
  const result = await workspaceService.acceptInvite(req.body.token, req.user._id);
  res.json({ success: true, data: result });
});

export const getPendingInvites = asyncHandler(async (req, res) => {
  const invites = await workspaceService.getPendingInvites(req.params.id);
  res.json({ success: true, data: invites });
});

export const revokeInvite = asyncHandler(async (req, res) => {
  const invite = await workspaceService.revokeInvite(req.params.inviteId, req.params.id);
  res.json({ success: true, data: invite });
});

// ─── Billing & Plan ───────────────────────────────────────────────────────────

export const getWorkspaceBilling = asyncHandler(async (req, res) => {
  const billing = await workspaceService.getWorkspaceBilling(req.params.id, req.user._id);
  res.json({ success: true, data: billing });
});

export const upgradePlan = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.upgradePlan(
    req.params.id,
    req.body.plan,
    req.user._id,
  );
  res.json({ success: true, data: workspace });
});
