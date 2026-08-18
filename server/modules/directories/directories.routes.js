import { Router } from 'express';
import {
  getUsers,
  getChannels,
  getGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  getExternalUsers,
  getInvitations,
} from './directories.controller.js';
import { protect } from '../auth/auth.middleware.js';
import { resolveWorkspace, requireWorkspaceRole } from '../../middleware/workspaceContext.js';

const router = Router();

/**
 * Directories Routes — all protected + workspace-scoped
 *
 * GET    /users            — People tab
 * GET    /channels         — Channels tab
 * GET    /groups           — User Groups tab
 * GET    /groups/:id       — Single group with members
 * POST   /groups           — Create group (admin/owner)
 * PUT    /groups/:id       — Update group (admin/owner)
 * DELETE /groups/:id       — Delete group (admin/owner)
 * GET    /external         — External users tab
 * GET    /invitations      — Invitations tab
 */

router.use(protect);
router.use(resolveWorkspace);

router.get('/users', getUsers);
router.get('/channels', getChannels);

router.get('/groups', getGroups);
router.get('/groups/:id', getGroupById);
router.post('/groups', requireWorkspaceRole('owner', 'admin'), createGroup);
router.put('/groups/:id', requireWorkspaceRole('owner', 'admin'), updateGroup);
router.delete('/groups/:id', requireWorkspaceRole('owner', 'admin'), deleteGroup);

router.get('/external', requireWorkspaceRole('owner', 'admin'), getExternalUsers);
router.get('/invitations', getInvitations);

export default router;
