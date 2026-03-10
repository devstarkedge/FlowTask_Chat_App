import crypto from 'node:crypto';
import workspaceRepository from './workspace.repository.js';
import { WORKSPACE_ROLES, WORKSPACE_LIMITS, DEFAULT_CHANNELS, CHANNEL_VISIBILITY, CHANNEL_MEMBER_ROLES } from '../../config/constants.js';
import env from '../../config/environment.js';
import logger from '../../utils/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';

/**
 * Workspace Service — business logic for workspace management.
 */

class WorkspaceService {
  // ─── FlowTask Integration ───────────────────────────────────────────────

  /**
   * Find or create a workspace linked to the FlowTask instance.
   * Used during FlowTask SSO login to auto-provision workspace.
   * Always assigns plan = 'enterprise' for FlowTask workspaces.
   *
   * @param {string} creatorId - ChatUser _id of the FlowTask user
   * @param {string} [workspaceName] - Name override from FlowTask
   * @returns {Promise<object>} workspace document
   */
  async findOrCreateFlowTaskWorkspace(creatorId, workspaceName) {
    // Check for existing FlowTask-linked workspace
    const existing = await workspaceRepository.findFlowTaskWorkspace();
    if (existing) {
      // Ensure user is a member
      const isMember = await workspaceRepository.isMember(existing._id, creatorId);
      if (!isMember) {
        await workspaceRepository.addMember(
          existing._id,
          creatorId,
          WORKSPACE_ROLES.MEMBER,
        );
        logger.info('FlowTask user auto-added to workspace', {
          userId: creatorId,
          workspaceId: existing._id,
        });
      }
      return existing;
    }

    // Create new workspace for FlowTask integration
    const name = workspaceName || env.DEFAULT_WORKSPACE_NAME || 'FlowTask Workspace';
    const workspace = await this.createWorkspace({
      name,
      description: 'Auto-created workspace for FlowTask integration',
      plan: 'enterprise',
      source: 'flowtask',
    }, creatorId);

    // Enable FlowTask integration settings
    await workspaceRepository.update(workspace._id, {
      'settings.flowtaskIntegration': {
        enabled: true,
        apiUrl: env.FLOWTASK_API_URL || '',
        webhookSecret: env.FLOWTASK_WEBHOOK_SECRET || '',
      },
    });

    logger.info('FlowTask workspace auto-created', {
      workspaceId: workspace._id,
      name: workspace.name,
      creatorId,
    });

    return workspace;
  }
  // ─── Workspace CRUD ──────────────────────────────────────────────────

  /**
   * Create a new workspace. Creator becomes the owner.
   * Auto-creates #general and #random default channels.
   */
  async createWorkspace(data, creatorId) {
    const { name, description, logo, plan = 'free', source = 'independent' } = data;
    const slug = (data.slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // Check slug uniqueness
    const existing = await workspaceRepository.findBySlug(slug);
    if (existing) {
      throw new BadRequestError(`Workspace slug "${slug}" is already taken.`);
    }

    // Create workspace
    const workspace = await workspaceRepository.create({
      name,
      slug,
      description,
      logo,
      plan,
      source,
      owner: creatorId,
      inviteCode: crypto.randomBytes(16).toString('hex'),
    });

    // Add creator as owner member
    await workspaceRepository.addMember(
      workspace._id,
      creatorId,
      WORKSPACE_ROLES.OWNER,
    );

    // Auto-create default channels (#general, #random)
    await this._createDefaultChannels(workspace._id, creatorId);

    logger.info(`Workspace created: ${workspace.name} (${workspace.slug}) by user ${creatorId}`);

    return workspace;
  }

  /**
   * Create default channels for a new workspace.
   * @private
   */
  async _createDefaultChannels(workspaceId, creatorId) {
    const { default: channelRepository } = await import('../channels/channel.repository.js');

    for (const ch of DEFAULT_CHANNELS) {
      try {
        const exists = await channelRepository.findBySlug(ch.slug, workspaceId);
        if (exists) continue;

        await channelRepository.create({
          name: ch.name,
          slug: ch.slug,
          type: ch.type,
          description: ch.description,
          visibility: ch.visibility === 'public' ? CHANNEL_VISIBILITY.PUBLIC : CHANNEL_VISIBILITY.PRIVATE,
          members: [{ userId: creatorId, role: CHANNEL_MEMBER_ROLES.OWNER }],
          memberCount: 1,
          workspaceId,
        });

        logger.info(`Default channel #${ch.slug} created for workspace ${workspaceId}`);
      } catch (err) {
        logger.error(`Failed to create default channel #${ch.slug}: ${err.message}`);
      }
    }
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

  // ─── Email Invites ──────────────────────────────────────────────────

  /**
   * Invite a user to a workspace by email.
   * - If user exists in this workspace: error (already member)
   * - If user exists in system but not workspace: add directly + email notification
   * - If user doesn't exist: create invite record + send invite email with signup link
   */
  async inviteByEmail(workspaceId, email, role = WORKSPACE_ROLES.MEMBER, invitedBy) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    const { default: emailService } = await import('../auth/email.service.js');
    const { default: ChatUser } = await import('../users/ChatUser.model.js');

    const workspace = await this.getWorkspace(workspaceId);

    // Check plan limits
    const currentCount = await workspaceRepository.countMembers(workspaceId);
    const limit = WORKSPACE_LIMITS[workspace.plan]?.maxMembers || WORKSPACE_LIMITS.free.maxMembers;
    if (limit > 0 && currentCount >= limit) {
      throw new BadRequestError(
        `Workspace has reached the member limit (${limit}) for the ${workspace.plan} plan.`,
      );
    }

    // Check if user exists and already in workspace
    const existingUser = await ChatUser.findOne({ email: email.toLowerCase() }).lean();
    if (existingUser) {
      const isMember = await workspaceRepository.isMember(workspaceId, existingUser._id);
      if (isMember) {
        throw new BadRequestError('This user is already a member of this workspace.');
      }
      // User exists but not in workspace — add directly
      const membership = await workspaceRepository.addMember(workspaceId, existingUser._id, role, invitedBy);
      await emailService.sendWorkspaceInviteEmail(
        email,
        workspace.name,
        (await ChatUser.findById(invitedBy).lean())?.name || 'A team member',
        null, // No token needed — user already exists
      );
      logger.info(`Existing user ${email} added to workspace ${workspace.slug}`);
      return { type: 'direct_add', membership };
    }

    // Check for existing pending invite
    const existingInvite = await WorkspaceInvite.findOne({
      workspaceId,
      email: email.toLowerCase(),
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });
    if (existingInvite) {
      throw new BadRequestError('An invite is already pending for this email.');
    }

    // Create invite record
    const invite = await WorkspaceInvite.create({
      workspaceId,
      email: email.toLowerCase(),
      role,
      invitedBy,
    });

    // Get inviter name
    const inviter = await ChatUser.findById(invitedBy).lean();
    const inviterName = inviter?.name || 'A team member';

    // Send invite email
    await emailService.sendWorkspaceInviteEmail(
      email,
      workspace.name,
      inviterName,
      invite.token,
    );

    logger.info(`Invite email sent to ${email} for workspace ${workspace.slug}`);
    return { type: 'email_invite', invite: { _id: invite._id, email: invite.email, role: invite.role, status: invite.status, expiresAt: invite.expiresAt } };
  }

  /**
   * Accept a workspace invite by token.
   */
  async acceptInvite(token, userId) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');

    const invite = await WorkspaceInvite.findValidByToken(token);
    if (!invite) {
      throw new NotFoundError('Invalid or expired invite.');
    }

    // Check plan limits
    const workspace = invite.workspaceId;
    const currentCount = await workspaceRepository.countMembers(workspace._id);
    const limit = WORKSPACE_LIMITS[workspace.plan]?.maxMembers || WORKSPACE_LIMITS.free.maxMembers;
    if (limit > 0 && currentCount >= limit) {
      throw new BadRequestError(
        `Workspace has reached the member limit (${limit}) for the ${workspace.plan} plan.`,
      );
    }

    // Check if already a member
    const isMember = await workspaceRepository.isMember(workspace._id, userId);
    if (isMember) {
      await WorkspaceInvite.markAccepted(token, userId);
      return { workspace, alreadyMember: true };
    }

    // Add as member with the invite's role
    const membership = await workspaceRepository.addMember(workspace._id, userId, invite.role);
    await WorkspaceInvite.markAccepted(token, userId);

    logger.info(`User ${userId} accepted invite to workspace ${workspace.slug}`);
    return { workspace, membership, alreadyMember: false };
  }

  /**
   * Get pending invites for a workspace.
   */
  async getPendingInvites(workspaceId) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    return WorkspaceInvite.getPendingInvites(workspaceId);
  }

  /**
   * Revoke a pending invite.
   */
  async revokeInvite(inviteId, workspaceId) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    const invite = await WorkspaceInvite.revoke(inviteId, workspaceId);
    if (!invite) {
      throw new NotFoundError('Invite not found or already used.');
    }
    return invite;
  }

  // ─── Billing & Plan ────────────────────────────────────────────────

  /**
   * Get workspace billing information.
   */
  async getWorkspaceBilling(workspaceId, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);
    const role = await workspaceRepository.getUserRole(workspaceId, requesterId);
    if (!role || ![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(role)) {
      throw new ForbiddenError('Only workspace owner or admin can view billing.');
    }

    const memberCount = await workspaceRepository.countMembers(workspaceId);
    const planConfig = WORKSPACE_LIMITS[workspace.plan] || WORKSPACE_LIMITS.free;

    return {
      plan: workspace.plan,
      billing: workspace.billing || {},
      limits: planConfig,
      usage: { members: memberCount },
    };
  }

  /**
   * Upgrade workspace plan (schema only — no actual payment processing).
   */
  async upgradePlan(workspaceId, newPlan, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);

    if (workspace.owner.toString() !== requesterId.toString()) {
      throw new ForbiddenError('Only the workspace owner can change the plan.');
    }

    if (!WORKSPACE_LIMITS[newPlan]) {
      throw new BadRequestError(`Invalid plan: ${newPlan}`);
    }

    if (workspace.plan === newPlan) {
      throw new BadRequestError(`Workspace is already on the ${newPlan} plan.`);
    }

    // Validate current usage against the new plan's limits before applying the change
    const targetLimits = WORKSPACE_LIMITS[newPlan];
    if (targetLimits.maxMembers > 0 && workspace.memberCount > targetLimits.maxMembers) {
      throw new BadRequestError(
        `Cannot change to ${newPlan} plan: workspace has ${workspace.memberCount} members but the plan allows a maximum of ${targetLimits.maxMembers}.`,
      );
    }

    const updated = await workspaceRepository.update(workspaceId, { plan: newPlan });
    logger.info(`Workspace ${workspace.slug} plan changed from ${workspace.plan} to ${newPlan} by user ${requesterId}`);

    return updated;
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
