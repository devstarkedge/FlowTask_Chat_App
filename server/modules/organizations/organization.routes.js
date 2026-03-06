import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import * as ctrl from './organization.controller.js';

const router = Router();

// All organization routes require authentication
router.use(protect);

router.post('/', ctrl.createOrganization);
router.get('/', ctrl.getMyOrganizations);
router.get('/:orgId', ctrl.getOrganization);
router.put('/:orgId', ctrl.updateOrganization);
router.get('/:orgId/workspaces', ctrl.getOrgWorkspaces);
router.get('/:orgId/members', ctrl.getOrgMembers);
router.post('/:orgId/members', ctrl.addOrgMember);
router.delete('/:orgId/members/:userId', ctrl.removeOrgMember);

export default router;
