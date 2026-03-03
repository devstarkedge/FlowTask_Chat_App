import crypto from 'node:crypto';
import workspaceRepository from './workspace.repository.js';
import { WORKSPACE_ROLES, WORKSPACE_LIMITS } from '../../config/constants.js';
import env from '../../config/environment.js';
import logger from '../../utils/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';

/**
 * Workspace Service — business logic for workspace management.
 */

class WorkspaceService {
  // ─── Workspace CRUD ──────────────────────────────────────────────────

  /**
   * Create a new workspace. Creator becomes the owner.
   */
  async createWorkspace(data, creatorId) {
    const { name, slug, description, logo } = data;

    // Check slug uniqueness
    const existing = await workspaceRepository.findBySlug(slug);
    if (existing) {
      throw new BadRequestError(`Workspace slug "${slug}" is already taken.`);
    }

    // Create workspace
    const workspace = await workspaceRepository.create({
      name,
      slug: slug.toLowerCase(),
      description,
      logo,
      owner: creatorId,
      inviteCode: crypto.randomBytes(16).toString('hex'),
    });

    // Add creator as owner member
    await workspaceRepository.addMember(
      workspace._id,
      creatorId,
      WORKSPACE_ROLES.OWNER,
    );

    logger.info(`Workspace created: ${workspace.name} (${workspace.slug}) by user ${creatorId}`);

    return workspace;
  }

  /**
   * Get workspace by ID.
   */
  async getWorkspace(workspaceId) {
    const workspace = await workspaceRepository.findById(workspaceId);
    if (!workspace || !workspace.isActive) {
      throw new NotFoundError('Workspace not found.');
    }
    return workspace;
  }

  /**
   * Get workspace by slug.
   */
  async getWorkspaceBySlug(slug) {
    const workspace = await workspaceRepository.findBySlug(slug);
    if (!workspace || !workspace.isActive) {
      throw new NotFoundError('Workspace not found.');
    }
    return workspace;
  }

  /**
   * Update workspace settings.
   */
  async updateWorkspace(workspaceId, updateData, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);

    // Only owner/admin can update
    const role = await workspaceRepository.getUserRole(workspaceId, requesterId);
    if (!role || ![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(role)) {
      throw new ForbiddenError('Only workspace owner or admin can update settings.');
    }

    // Prevent changing slug after creation (too many side effects)
    delete updateData.slug;
    delete updateData.owner;

    return workspaceRepository.update(workspaceId, updateData);
  }

  /**
   * Delete (deactivate) a workspace. Only owner can do this.
   */
  async deleteWorkspace(workspaceId, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);

    if (workspace.owner.toString() !== requesterId.toString()) {
      throw new ForbiddenError('Only the workspace owner can delete it.');
    }

    await workspaceRepository.deactivate(workspaceId);
    logger.info(`Workspace deactivated: ${workspace.slug} by user ${requesterId}`);

    return { message: 'Workspace deactivated successfully.' };
  }

  // ─── Membership ──────────────────────────────────────────────────────

  /**
   * Get all workspaces a user belongs to.
   */
  async getUserWorkspaces(userId) {
    return workspaceRepository.getUserWorkspaces(userId);
  }

  /**
   * Get members of a workspace.
   */
  async getWorkspaceMembers(workspaceId, options = {}) {
    return workspaceRepository.getWorkspaceMembers(workspaceId, options);
  }

  /**
   * Invite a user to a workspace.
   */
  async inviteMember(workspaceId, userId, role = WORKSPACE_ROLES.MEMBER, invitedBy) {
    // Check plan limits
    const workspace = await this.getWorkspace(workspaceId);
    const currentCount = await workspaceRepository.countMembers(workspaceId);
    const limit = WORKSPACE_LIMITS[workspace.plan]?.maxMembers || WORKSPACE_LIMITS.free.maxMembers;

    if (currentCount >= limit) {
      throw new BadRequestError(
        `Workspace has reached the member limit (${limit}) for the ${workspace.plan} plan.`,
      );
    }

    // Check if already a member
    const isMember = await workspaceRepository.isMember(workspaceId, userId);
    if (isMember) {
      throw new BadRequestError('User is already a member of this workspace.');
    }

    const membership = await workspaceRepository.addMember(workspaceId, userId, role, invitedBy);
    logger.info(`User ${userId} invited to workspace ${workspaceId} as ${role}`);

    return membership;
  }

  /**
   * Remove a member from a workspace.
   */
  async removeMember(workspaceId, userId, requesterId) {
    const requesterRole = await workspaceRepository.getUserRole(workspaceId, requesterId);
    const targetRole = await workspaceRepository.getUserRole(workspaceId, userId);

    if (!requesterRole) {
      throw new ForbiddenError('You are not a member of this workspace.');
    }

    // Can't remove owner
    if (targetRole === WORKSPACE_ROLES.OWNER) {
      throw new ForbiddenError('Cannot remove the workspace owner.');
    }

    // Only owner/admin can remove members
    if (![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(requesterRole)) {
      throw new ForbiddenError('Only owner or admin can remove members.');
    }

    // Admin can't remove other admins
    if (requesterRole === WORKSPACE_ROLES.ADMIN && targetRole === WORKSPACE_ROLES.ADMIN) {
      throw new ForbiddenError('Admins cannot remove other admins.');
    }

    await workspaceRepository.removeMember(workspaceId, userId);
    logger.info(`User ${userId} removed from workspace ${workspaceId} by ${requesterId}`);

    return { message: 'Member removed successfully.' };
  }

  /**
   * Update a member's role.
   */
  async updateMemberRole(workspaceId, userId, newRole, requesterId) {
    const requesterRole = await workspaceRepository.getUserRole(workspaceId, requesterId);

    // Only owner can change roles
    if (requesterRole !== WORKSPACE_ROLES.OWNER) {
      throw new ForbiddenError('Only the workspace owner can change member roles.');
    }

    // Can't change own role
    if (userId.toString() === requesterId.toString()) {
      throw new BadRequestError('Cannot change your own role.');
    }

    return workspaceRepository.updateMemberRole(workspaceId, userId, newRole);
  }

  /**
   * Join workspace via invite code.
   */
  async joinByInviteCode(inviteCode, userId) {
    const workspace = await workspaceRepository.findByInviteCode(inviteCode);
    if (!workspace || !workspace.isActive) {
      throw new NotFoundError('Invalid invite code or workspace is inactive.');
    }

    // Check if already a member
    const isMember = await workspaceRepository.isMember(workspace._id, userId);
    if (isMember) {
      return { workspace, alreadyMember: true };
    }

    // Check plan limits
    const currentCount = await workspaceRepository.countMembers(workspace._id);
    const limit = WORKSPACE_LIMITS[workspace.plan]?.maxMembers || WORKSPACE_LIMITS.free.maxMembers;

    if (currentCount >= limit) {
      throw new BadRequestError(
        `Workspace has reached the member limit (${limit}) for the ${workspace.plan} plan.`,
      );
    }

    const membership = await workspaceRepository.addMember(
      workspace._id,
      userId,
      WORKSPACE_ROLES.MEMBER,
    );

    logger.info(`User ${userId} joined workspace ${workspace.slug} via invite code`);

    return { workspace, membership, alreadyMember: false };
  }

  /**
   * Regenerate the invite code for a workspace.
   */
  async regenerateInviteCode(workspaceId, requesterId) {
    const role = await workspaceRepository.getUserRole(workspaceId, requesterId);
    if (!role || ![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(role)) {
      throw new ForbiddenError('Only owner or admin can regenerate invite codes.');
    }

    const newCode = crypto.randomBytes(16).toString('hex');
    return workspaceRepository.update(workspaceId, { inviteCode: newCode });
  }

  /**
   * Ensure the default FlowTask workspace exists. Called at server startup.
   * Idempotent — safe to call repeatedly.
   */
  async ensureDefaultWorkspace() {
    let workspace = await workspaceRepository.findBySlug(env.DEFAULT_WORKSPACE_SLUG);

    if (!workspace) {
      workspace = await workspaceRepository.create({
        name: env.DEFAULT_WORKSPACE_NAME,
        slug: env.DEFAULT_WORKSPACE_SLUG,
        description: 'Default workspace for FlowTask integration',
        plan: 'enterprise',
        inviteCode: crypto.randomBytes(16).toString('hex'),
        settings: {
          flowtaskIntegration: {
            enabled: true,
          },
        },
      });

      logger.info(`Default workspace created: ${workspace.slug}`);
    }

    return workspace;
  }

  /**
   * Leave a workspace (self-remove).
   */
  async leaveWorkspace(workspaceId, userId) {
    const role = await workspaceRepository.getUserRole(workspaceId, userId);

    if (!role) {
      throw new BadRequestError('You are not a member of this workspace.');
    }

    if (role === WORKSPACE_ROLES.OWNER) {
      throw new ForbiddenError(
        'Workspace owner cannot leave. Transfer ownership first or delete the workspace.',
      );
    }

    await workspaceRepository.removeMember(workspaceId, userId);
    logger.info(`User ${userId} left workspace ${workspaceId}`);

    return { message: 'Left workspace successfully.' };
  }
}

export default new WorkspaceService();
