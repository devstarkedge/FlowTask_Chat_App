import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import { resolveWorkspace, requireWorkspaceRole } from '../../middleware/workspaceContext.js';
import { WORKSPACE_ROLES } from '../../config/constants.js';
import { validate } from '../../middleware/validate.js';
import { 
  createWorkspaceSchema,
  inviteByEmailSchema,
  getAllInvitesSchema,
  updateDomainRestrictionsSchema,
  updateGuestSettingsSchema,
  updateSecuritySettingsSchema,
  updateNotificationSettingsSchema,
  updateIntegrationSettingsSchema,
} from '../../middleware/schemas.js';
import * as ctrl from './workspace.controller.js';

const router = Router();

// ─── Public-ish (requires auth, but no workspace context) ──────────────────
router.get('/mine', protect, ctrl.getMyWorkspaces);
router.post('/', protect, validate({ body: createWorkspaceSchema }), ctrl.createWorkspace);
router.post('/join', protect, ctrl.joinByInviteCode);
router.get('/slug/:slug', protect, ctrl.getWorkspaceBySlug);
router.post('/accept-invite', protect, ctrl.acceptInvite);

// ─── Public (no auth required) ───────────────────────────────────────────────
router.get('/invite-info/:token', ctrl.getInviteInfo);

// ─── Workspace-scoped routes ───────────────────────────────────────────────
router.get('/:id', protect, resolveWorkspace, ctrl.getWorkspace);
router.patch('/:id', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.updateWorkspace);
router.delete('/:id', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER), ctrl.deleteWorkspace);

// ─── Membership ──────────────────────────────────────────────────────────────
router.get('/:id/members', protect, resolveWorkspace, ctrl.getMembers);
router.post('/:id/members', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.inviteMember);
router.delete('/:id/members/:userId', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.removeMember);
router.patch('/:id/members/:userId/role', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER), ctrl.updateMemberRole);
router.post('/:id/leave', protect, resolveWorkspace, ctrl.leaveWorkspace);

// ─── Invite Code ─────────────────────────────────────────────────────────────
router.post('/:id/invite-code/regenerate', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.regenerateInviteCode);
// Compatibility alias used by the client: POST /workspaces/:id/invite-code
router.post('/:id/invite-code', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.regenerateInviteCode);

// ─── Email Invites ─────────────────────────────────────────────────────────────────
router.post('/:id/invite-email', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), validate({ body: inviteByEmailSchema }), ctrl.inviteByEmail);
router.get('/:id/invites', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), validate({ query: getAllInvitesSchema }), ctrl.getAllInvites);
router.get('/:id/invites/pending', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.getPendingInvites);
router.post('/:id/invites/:inviteId/resend', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.resendInvite);
router.delete('/:id/invites/:inviteId', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.revokeInvite);

// ─── Workspace Settings ─────────────────────────────────────────────────────────────
router.patch('/:id/settings/domain-restrictions', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), validate({ body: updateDomainRestrictionsSchema }), ctrl.updateDomainRestrictions);
router.patch('/:id/settings/guest-settings', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER), validate({ body: updateGuestSettingsSchema }), ctrl.updateGuestSettings);

// ─── Security Settings ──────────────────────────────────────────────────────
router.get('/:id/settings/security', protect, resolveWorkspace, ctrl.getSecuritySettings);
router.patch('/:id/settings/security', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), validate({ body: updateSecuritySettingsSchema }), ctrl.updateSecuritySettings);

// ─── Notification Settings ─────────────────────────────────────────────────
router.get('/:id/settings/notifications', protect, resolveWorkspace, ctrl.getNotificationSettings);
router.patch('/:id/settings/notifications', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), validate({ body: updateNotificationSettingsSchema }), ctrl.updateNotificationSettings);

// ─── Integration Settings ──────────────────────────────────────────────────
router.get('/:id/settings/integrations', protect, resolveWorkspace, ctrl.getIntegrationSettings);
router.patch('/:id/settings/integrations', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), validate({ body: updateIntegrationSettingsSchema }), ctrl.updateIntegrationSettings);

// ─── Active Sessions ──────────────────────────────────────────────────────
router.get('/:id/sessions', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.getActiveSessions);
router.post('/:id/sessions/logout-all', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER), ctrl.logoutAllSessions);

// ─── Billing & Plan ──────────────────────────────────────────────────────────
router.get('/:id/billing', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.getWorkspaceBilling);
router.post('/:id/upgrade-plan', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER), ctrl.upgradePlan);

export default router;
