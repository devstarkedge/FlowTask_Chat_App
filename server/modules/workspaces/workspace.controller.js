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
  const memberships = await workspaceService.getUserWorkspaces(req.user._id);
  const workspaces = memberships
    .filter((m) => m.workspaceId && m.workspaceId.isActive !== false)
    .map((m) => {
      const ws = { ...m.workspaceId };
      // Only owners/admins should receive the inviteCode via the workspace list
      if (!['owner', 'admin'].includes(m.role)) {
        delete ws.inviteCode;
      }
      return {
        ...ws,
        role: m.role,
        joinedAt: m.joinedAt,
      };
    });
  res.json({ success: true, data: { workspaces } });
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
    {
      channels: req.body.channels,
      inviteType: req.body.inviteType,
      domainRestriction: req.body.domainRestriction,
    },
  );
  res.status(201).json({ success: true, data: result });
});

export const acceptInvite = asyncHandler(async (req, res) => {
  const result = await workspaceService.acceptInvite(req.body.token, req.user._id);
  res.json({ success: true, data: result });
});

export const declineInvite = asyncHandler(async (req, res) => {
  const result = await workspaceService.declineInvite(req.body.token);
  res.json({ success: true, data: result });
});

export const getPendingInvites = asyncHandler(async (req, res) => {
  const invites = await workspaceService.getPendingInvites(req.params.id);
  res.json({ success: true, data: invites });
});

export const getAllInvites = asyncHandler(async (req, res) => {
  const result = await workspaceService.getAllInvites(req.params.id, req.query);
  res.json({ success: true, data: result });
});

export const resendInvite = asyncHandler(async (req, res) => {
  const result = await workspaceService.resendInvite(
    req.params.inviteId,
    req.params.id,
    req.user._id,
  );
  res.json({ success: true, data: result });
});

export const revokeInvite = asyncHandler(async (req, res) => {
  const invite = await workspaceService.revokeInvite(
    req.params.inviteId,
    req.params.id,
    req.user._id,
  );
  res.json({ success: true, data: invite });
});

export const getInviteInfo = asyncHandler(async (req, res) => {
  try {
    const info = await workspaceService.getInviteInfoByToken(req.params.token);
    res.json({ success: true, data: info });
  } catch (err) {
    // Ensure consistent error response for failed invite lookups
    const statusCode = err.statusCode || 404;
    const message = err.message || 'Invalid or expired invite.';
    res.status(statusCode).json({
      success: false,
      error: {
        message,
        code: 'INVITE_NOT_FOUND',
      },
    });
  }
});

// ─── Workspace Settings ─────────────────────────────────────────────────────────────

export const updateDomainRestrictions = asyncHandler(async (req, res) => {
  const result = await workspaceService.updateDomainRestrictions(
    req.params.id,
    req.body,
    req.user._id,
  );
  res.json({ success: true, data: result });
});

export const updateGuestSettings = asyncHandler(async (req, res) => {
  const result = await workspaceService.updateGuestSettings(
    req.params.id,
    req.body,
    req.user._id,
  );
  res.json({ success: true, data: result });
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

// ─── Workspace Security Settings ────────────────────────────────────────────

export const getSecuritySettings = asyncHandler(async (req, res) => {
  const settings = await workspaceService.getSecuritySettings(req.params.id, req.user._id);
  res.json({ success: true, data: settings });
});

export const updateSecuritySettings = asyncHandler(async (req, res) => {
  const result = await workspaceService.updateSecuritySettings(
    req.params.id,
    req.body,
    req.user._id,
  );
  res.json({ success: true, data: result });
});

// ─── Workspace Notification Settings ────────────────────────────────────────

export const getNotificationSettings = asyncHandler(async (req, res) => {
  const settings = await workspaceService.getNotificationSettings(req.params.id, req.user._id);
  res.json({ success: true, data: settings });
});

export const updateNotificationSettings = asyncHandler(async (req, res) => {
  const result = await workspaceService.updateNotificationSettings(
    req.params.id,
    req.body,
    req.user._id,
  );
  res.json({ success: true, data: result });
});

// ─── Workspace Integration Settings ─────────────────────────────────────────

export const getIntegrationSettings = asyncHandler(async (req, res) => {
  const settings = await workspaceService.getIntegrationSettings(req.params.id, req.user._id);
  res.json({ success: true, data: settings });
});

export const updateIntegrationSettings = asyncHandler(async (req, res) => {
  const result = await workspaceService.updateIntegrationSettings(
    req.params.id,
    req.body,
    req.user._id,
  );
  res.json({ success: true, data: result });
});

// ─── Active Sessions ─────────────────────────────────────────────────────

export const getActiveSessions = asyncHandler(async (req, res) => {
  const sessions = await workspaceService.getActiveSessions(req.params.id, req.user._id);
  res.json({ success: true, data: sessions });
});

export const logoutAllSessions = asyncHandler(async (req, res) => {
  const result = await workspaceService.logoutAllSessions(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});
