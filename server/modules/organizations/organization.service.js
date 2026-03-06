import Organization from './Organization.model.js';
import OrganizationMembership from './OrganizationMembership.model.js';
import Workspace from '../workspaces/Workspace.model.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import logger from '../../utils/logger.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';

/**
 * Organization Service — business logic for managing organizations.
 */
class OrganizationService {
  /**
   * Create a new organization with the creator as owner.
   */
  async create({ name, slug, plan = 'free', ownerId }) {
    const existing = await Organization.findBySlug(slug);
    if (existing) {
      throw new ValidationError('An organization with this slug already exists');
    }

    const org = await Organization.create({
      name,
      slug,
      plan,
      ownerId,
      memberCount: 1,
    });

    // Add creator as org owner
    await OrganizationMembership.addMember(ownerId, org._id, 'owner');

    logger.info('Organization created', { orgId: org._id, slug, ownerId });
    return org;
  }

  /**
   * Get organization by ID.
   */
  async getById(orgId) {
    const org = await Organization.findById(orgId);
    if (!org || !org.isActive) {
      throw new NotFoundError('Organization');
    }
    return org;
  }

  /**
   * Get all organizations a user belongs to.
   */
  async getUserOrgs(userId) {
    const memberships = await OrganizationMembership.findUserOrgs(userId);
    return memberships.map((m) => ({
      ...m.organizationId,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  /**
   * Update organization settings.
   */
  async update(orgId, updates, userId) {
    const membership = await OrganizationMembership.isMember(userId, orgId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenError('Only org owners and admins can update settings');
    }

    const org = await Organization.findByIdAndUpdate(orgId, updates, { new: true });
    if (!org) throw new NotFoundError('Organization');
    return org;
  }

  /**
   * Get all workspaces in an organization.
   */
  async getWorkspaces(orgId) {
    return Workspace.find({ organizationId: orgId, isActive: true })
      .sort({ name: 1 })
      .lean();
  }

  /**
   * Get all members of an organization.
   */
  async getMembers(orgId, { limit = 100, skip = 0 } = {}) {
    return OrganizationMembership.find({ organizationId: orgId, isActive: true })
      .populate('userId', 'name email avatar role onlineStatus')
      .sort({ role: 1, joinedAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  /**
   * Add a member to the organization.
   */
  async addMember(orgId, userId, role = 'member', invitedBy = null) {
    // Check if already an active member before incrementing
    const existing = await OrganizationMembership.isMember(userId, orgId);
    const membership = await OrganizationMembership.addMember(userId, orgId, role, invitedBy);
    if (!existing) {
      await Organization.findByIdAndUpdate(orgId, { $inc: { memberCount: 1 } });
    }
    return membership;
  }

  /**
   * Remove a member from the organization.
   */
  async removeMember(orgId, userId) {
    // Prevent removing the last owner
    const target = await OrganizationMembership.isMember(userId, orgId);
    if (target?.role === 'owner') {
      const ownerCount = await OrganizationMembership.countDocuments({
        organizationId: orgId,
        role: 'owner',
        isActive: true,
      });
      if (ownerCount <= 1) {
        throw new ForbiddenError('Cannot remove the last organization owner');
      }
    }

    const membership = await OrganizationMembership.removeMember(userId, orgId);
    if (membership) {
      await Organization.findByIdAndUpdate(orgId, { $inc: { memberCount: -1 } });
    }
    return membership;
  }

  /**
   * Ensure default organization exists (for migration/bootstrap).
   * Creates one if not present.
   */
  async ensureDefaultOrg() {
    let org = await Organization.findBySlug('default');
    if (!org) {
      org = await Organization.create({
        name: 'Default Organization',
        slug: 'default',
        plan: 'enterprise',
      });
      logger.info('Default organization created', { orgId: org._id });
    }
    return org;
  }
}

export default new OrganizationService();
