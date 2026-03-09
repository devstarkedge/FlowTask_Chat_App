import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import { resolveWorkspace, requireWorkspaceRole } from '../../middleware/workspaceContext.js';
import { WORKSPACE_ROLES } from '../../config/constants.js';
import * as ctrl from './workspace.controller.js';

const router = Router();

// ─── Public-ish (requires auth, but no workspace context) ──────────────────
router.get('/mine', protect, ctrl.getMyWorkspaces);
router.post('/', protect, ctrl.createWorkspace);
router.post('/join', protect, ctrl.joinByInviteCode);
router.get('/slug/:slug', protect, ctrl.getWorkspaceBySlug);

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
// ─── Email Invites ─────────────────────────────────────────────────────────────────
router.post('/:id/invite-email', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.inviteByEmail);
router.get('/:id/invites', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.getPendingInvites);
router.delete('/:id/invites/:inviteId', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.revokeInvite);
router.post('/accept-invite', protect, ctrl.acceptInvite);

// ─── Billing & Plan ──────────────────────────────────────────────────────────
router.get('/:id/billing', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN), ctrl.getWorkspaceBilling);
router.post('/:id/upgrade-plan', protect, resolveWorkspace, requireWorkspaceRole(WORKSPACE_ROLES.OWNER), ctrl.upgradePlan);

export default router;
