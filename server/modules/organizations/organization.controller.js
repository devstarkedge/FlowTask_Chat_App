import asyncHandler from '../../middleware/asyncHandler.js';
import organizationService from './organization.service.js';

/**
 * Organization Controller — HTTP handlers for organization CRUD.
 */

/** POST /api/chat/organizations */
export const createOrganization = asyncHandler(async (req, res) => {
  const { name, slug, plan } = req.body;
  const org = await organizationService.create({
    name,
    slug,
    plan,
    ownerId: req.user._id,
  });
  res.status(201).json({ success: true, organization: org });
});

/** GET /api/chat/organizations */
export const getMyOrganizations = asyncHandler(async (req, res) => {
  const orgs = await organizationService.getUserOrgs(req.user._id);
  res.json({ success: true, organizations: orgs });
});

/** GET /api/chat/organizations/:orgId */
export const getOrganization = asyncHandler(async (req, res) => {
  const org = await organizationService.getById(req.params.orgId);
  res.json({ success: true, organization: org });
});

/** PUT /api/chat/organizations/:orgId */
export const updateOrganization = asyncHandler(async (req, res) => {
  const org = await organizationService.update(req.params.orgId, req.body, req.user._id);
  res.json({ success: true, organization: org });
});

/** GET /api/chat/organizations/:orgId/workspaces */
export const getOrgWorkspaces = asyncHandler(async (req, res) => {
  const workspaces = await organizationService.getWorkspaces(req.params.orgId);
  res.json({ success: true, workspaces });
});

/** GET /api/chat/organizations/:orgId/members */
export const getOrgMembers = asyncHandler(async (req, res) => {
  const { limit, skip } = req.query;
  const members = await organizationService.getMembers(req.params.orgId, {
    limit: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200),
    skip: Math.max(parseInt(skip, 10) || 0, 0),
  });
  res.json({ success: true, members });
});

/** POST /api/chat/organizations/:orgId/members */
export const addOrgMember = asyncHandler(async (req, res) => {
  const { userId, role } = req.body;
  const membership = await organizationService.addMember(
    req.params.orgId,
    userId,
    role,
    req.user._id,
  );
  res.status(201).json({ success: true, membership });
});

/** DELETE /api/chat/organizations/:orgId/members/:userId */
export const removeOrgMember = asyncHandler(async (req, res) => {
  if (req.params.userId === req.user._id.toString()) {
    return res.status(400).json({ success: false, error: { message: 'Cannot remove yourself from the organization' } });
  }
  await organizationService.removeMember(req.params.orgId, req.params.userId);
  res.json({ success: true, message: 'Member removed from organization.' });
});
