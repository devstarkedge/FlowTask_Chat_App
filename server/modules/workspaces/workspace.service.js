import crypto from 'node:crypto';
import mongoose from 'mongoose';
import workspaceRepository from './workspace.repository.js';
import { WORKSPACE_ROLES, WORKSPACE_LIMITS, DEFAULT_CHANNELS, CHANNEL_VISIBILITY, CHANNEL_MEMBER_ROLES } from '../../config/constants.js';
import env from '../../config/environment.js';
import logger from '../../utils/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../../middleware/errorHandler.js';

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
    const name = workspaceName || env.DEFAULT_WORKSPACE_NAME || 'FlowTask Workspace';
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    let workspace = await workspaceRepository.findFlowTaskWorkspace();
    let created = false;

    if (!workspace) {
      try {
        workspace = await workspaceRepository.create({
          name,
          slug,
          description: 'Auto-created workspace for FlowTask integration',
          plan: 'enterprise',
          source: 'flowtask',
          owner: creatorId,
          memberCount: 0,
          inviteCode: crypto.randomBytes(16).toString('hex'),
          settings: {
            defaultChannelVisibility: 'private',
            flowtaskIntegration: {
              enabled: true,
              apiUrl: env.FLOWTASK_API_URL || '',
              webhookSecret: env.FLOWTASK_WEBHOOK_SECRET || '',
            },
          },
        });
        created = true;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        workspace = await workspaceRepository.findFlowTaskWorkspace()
          || await workspaceRepository.findBySlug(slug);
        if (!workspace) throw error;
        logger.info('Concurrent FlowTask workspace create resolved by unique mapping', {
          workspaceId: workspace._id,
          creatorId,
        });
      }
    }

    const currentMembership = await workspaceRepository.getMembership(creatorId, workspace._id);
    await workspaceRepository.addMember(
      creatorId,
      workspace._id,
      currentMembership?.role || (created ? WORKSPACE_ROLES.OWNER : WORKSPACE_ROLES.MEMBER),
    );

    workspace = await workspaceRepository.update(workspace._id, {
      source: 'flowtask',
      plan: 'enterprise',
      'settings.flowtaskIntegration': {
        enabled: true,
        apiUrl: env.FLOWTASK_API_URL || '',
        webhookSecret: env.FLOWTASK_WEBHOOK_SECRET || '',
      },
    });

    if (created) {
      await this._createDefaultChannels(workspace._id, creatorId);
    }

    logger.info(created ? 'FlowTask workspace auto-created' : 'FlowTask workspace membership resolved', {
      workspaceId: workspace._id,
      name: workspace.name,
      creatorId,
    });

    return workspace;
  }
  // ─── Workspace CRUD ──────────────────────────────────────────────────

  /**
   * Create a new workspace. Creator becomes the owner.
   * Auto-creates system channels via FlowTask sync if enabled.
   * Uses a MongoDB transaction so workspace + owner membership are atomic.
   */
  async createWorkspace(data, creatorId) {
    const { name, description, logo, plan = 'free', source = 'independent' } = data;
    const slug = (data.slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // Check slug uniqueness
    const existing = await workspaceRepository.findBySlug(slug);
    if (existing) {
      throw new BadRequestError(`Workspace slug "${slug}" is already taken.`);
    }

    // Atomic: workspace creation + owner membership
    const session = await mongoose.startSession();
    let workspace;
    try {
      await session.withTransaction(async () => {
        const [ws] = await mongoose.model('Workspace').create([{
          name,
          slug,
          description,
          logo,
          plan,
          source,
          owner: creatorId,
          memberCount: 1,
          inviteCode: crypto.randomBytes(16).toString('hex'),
        }], { session });
        workspace = ws;

        await mongoose.model('WorkspaceMembership').create([{
          userId: creatorId,
          workspaceId: ws._id,
          role: WORKSPACE_ROLES.OWNER,
          isActive: true,
          joinedAt: new Date(),
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    // Default channels are non-critical — create outside transaction
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
    const { default: ChannelMember } = await import('../channels/ChannelMember.model.js');

    for (const ch of DEFAULT_CHANNELS) {
      try {
        const exists = await channelRepository.findBySlug(ch.slug, workspaceId);
        if (exists) continue;

        const channel = await channelRepository.create({
          name: ch.name,
          slug: ch.slug,
          type: ch.type,
          description: ch.description,
          visibility: ch.visibility === 'public' ? CHANNEL_VISIBILITY.PUBLIC : CHANNEL_VISIBILITY.PRIVATE,
          members: [{ userId: creatorId, role: CHANNEL_MEMBER_ROLES.OWNER }],
          memberCount: 1,
          createdBy: creatorId,
          workspaceId,
        });

        // Write to ChannelMember collection (source of truth for findByMember)
        await ChannelMember.addMember(
          channel._id.toString(),
          creatorId,
          workspaceId.toString(),
          CHANNEL_MEMBER_ROLES.OWNER,
        );

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
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
    if (!role || ![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(role)) {
      throw new ForbiddenError('Only workspace owner or admin can update settings.');
    }

    // Prevent changing slug after creation (too many side effects)
    delete updateData.slug;
    delete updateData.owner;

    return workspaceRepository.update(workspaceId, updateData);
  }

  /**
   * Delete a workspace and all associated data. Only owner can do this.
   * Performs cascading deletion of all channels, messages, threads, files,
   * memberships, invites, and other workspace-scoped data.
   */
  async deleteWorkspace(workspaceId, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);

    if (workspace.owner.toString() !== requesterId.toString()) {
      throw new ForbiddenError('Only the workspace owner can delete it.');
    }

    await this._cascadeDeleteWorkspace(workspaceId, workspace.slug, requesterId);

    return { message: 'Workspace deleted successfully.' };
  }

  /**
   * Perform cascading deletion of all workspace data.
   * @private
   */
  async _cascadeDeleteWorkspace(workspaceId, workspaceSlug, requesterId) {
    const wsId = workspaceId.toString();
    const wsObjectId = new mongoose.Types.ObjectId(wsId);

    logger.info(`Starting cascading deletion for workspace ${workspaceSlug} (${wsId}) by user ${requesterId}`);

    try {
      // 1. Delete all messages in the workspace
      const { default: Message } = await import('../messages/Message.model.js');
      const messageResult = await Message.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${messageResult.deletedCount} messages`);

      // 2. Delete all file references
      const { default: FileReference } = await import('../files/FileReference.model.js');
      const fileRefResult = await FileReference.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${fileRefResult.deletedCount} file references`);

      // 3. Delete all threads
      const { default: Thread } = await import('../threads/Thread.model.js');
      const threadResult = await Thread.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${threadResult.deletedCount} threads`);

      // 4. Delete all channels and channel members
      const { default: Channel } = await import('../channels/Channel.model.js');
      const { default: ChannelMember } = await import('../channels/ChannelMember.model.js');
      const channelResult = await Channel.deleteMany({ workspaceId: wsObjectId });
      const channelMemberResult = await ChannelMember.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${channelResult.deletedCount} channels and ${channelMemberResult.deletedCount} channel members`);

      // 5. Delete all categories/departments
      const { default: Department } = await import('../categories/Department.model.js');
      const deptResult = await Department.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${deptResult.deletedCount} categories`);

      // 6. Delete all canvases
      const { default: Canvas } = await import('../canvas/canvas.model.js');
      const canvasResult = await Canvas.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${canvasResult.deletedCount} canvases`);

      // 7. Delete all read receipts
      const { default: ReadReceipt } = await import('../readReceipts/ReadReceipt.model.js');
      const readReceiptResult = await ReadReceipt.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${readReceiptResult.deletedCount} read receipts`);

      // 8. Delete all notifications
      const { default: Notification } = await import('../notifications/Notification.model.js');
      const { default: NotificationPreference } = await import('../notifications/NotificationPreference.model.js');
      const notifResult = await Notification.deleteMany({ workspaceId: wsObjectId });
      const notifPrefResult = await NotificationPreference.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${notifResult.deletedCount} notifications`);

      // 9. Delete all drafts
      const { default: Draft } = await import('../drafts/Draft.model.js');
      const draftResult = await Draft.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${draftResult.deletedCount} drafts`);

      // 10. Delete all workspace invites
      const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
      const inviteResult = await WorkspaceInvite.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${inviteResult.deletedCount} workspace invites`);

      // 11. Delete all workspace memberships
      const { default: WorkspaceMembership } = await import('./WorkspaceMembership.model.js');
      const membershipResult = await WorkspaceMembership.deleteMany({ workspaceId: wsObjectId });
      logger.info(`[CASCADE] Deleted ${membershipResult.deletedCount} workspace memberships`);

      // 12. Delete the workspace itself
      const { default: Workspace } = await import('./Workspace.model.js');
      await Workspace.findByIdAndDelete(wsObjectId);
      logger.info(`[CASCADE] Workspace ${workspaceSlug} deleted`);

      // 13. Emit socket event to notify all connected clients
      try {
        const { emitToWorkspace } = await import('../../sockets/socketManager.js');
        const { SOCKET_EVENTS } = await import('../../config/constants.js');
        emitToWorkspace(wsId, SOCKET_EVENTS.WORKSPACE_DELETED, {
          workspaceId: wsId,
          deletedBy: requesterId,
        });
      } catch (err) {
        logger.warn('[CASCADE] Failed to emit workspace deleted socket event', { error: err.message });
      }

      logger.info(`Cascading deletion complete for workspace ${workspaceSlug}`);
    } catch (error) {
      logger.error(`[CASCADE] Failed to delete workspace ${workspaceSlug}`, { error: error.message });
      throw error;
    }
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

    if (workspace.plan !== 'enterprise' && limit > 0 && currentCount >= limit) {
      throw new BadRequestError(
        `Workspace has reached the member limit (${limit}) for the ${workspace.plan} plan.`,
      );
    }

    // Check if already a member
    const isMember = await workspaceRepository.isMember(userId, workspaceId);
    if (isMember) {
      throw new BadRequestError('User is already a member of this workspace.');
    }

    const membership = await workspaceRepository.addMember(userId, workspaceId, role, invitedBy);
    logger.info(`User ${userId} invited to workspace ${workspaceId} as ${role}`);

    // Auto-add to all public channels in this workspace
    await this._autoJoinPublicChannels(userId, workspaceId);

    return membership;
  }

  /**
   * Remove a member from a workspace.
   */
  async removeMember(workspaceId, userId, requesterId) {
    const requesterRole = await workspaceRepository.getUserRole(requesterId, workspaceId);
    const targetRole = await workspaceRepository.getUserRole(userId, workspaceId);

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

    await workspaceRepository.removeMember(userId, workspaceId);
    logger.info(`User ${userId} removed from workspace ${workspaceId} by ${requesterId}`);

    return { message: 'Member removed successfully.' };
  }

  /**
   * Update a member's role.
   */
  async updateMemberRole(workspaceId, userId, newRole, requesterId) {
    const requesterRole = await workspaceRepository.getUserRole(requesterId, workspaceId);

    // Only owner can change roles
    if (requesterRole !== WORKSPACE_ROLES.OWNER) {
      throw new ForbiddenError('Only the workspace owner can change member roles.');
    }

    // Can't change own role
    if (userId.toString() === requesterId.toString()) {
      throw new BadRequestError('Cannot change your own role.');
    }

    return workspaceRepository.updateMemberRole(userId, workspaceId, newRole);
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
    const isMember = await workspaceRepository.isMember(userId, workspace._id);
    if (isMember) {
      return { workspace, alreadyMember: true };
    }

    // Check plan limits
    const currentCount = await workspaceRepository.countMembers(workspace._id);
    const limit = WORKSPACE_LIMITS[workspace.plan]?.maxMembers || WORKSPACE_LIMITS.free.maxMembers;

    if (workspace.plan !== 'enterprise' && limit > 0 && currentCount >= limit) {
      throw new BadRequestError(
        `Workspace has reached the member limit (${limit}) for the ${workspace.plan} plan.`,
      );
    }

    const membership = await workspaceRepository.addMember(
      userId,
      workspace._id,
      WORKSPACE_ROLES.MEMBER,
    );

    logger.info(`User ${userId} joined workspace ${workspace.slug} via invite code`);

    // Auto-add to all public channels in this workspace
    await this._autoJoinPublicChannels(userId, workspace._id);

    return { workspace, membership, alreadyMember: false };
  }

  /**
   * Regenerate the invite code for a workspace.
   */
  async regenerateInviteCode(workspaceId, requesterId) {
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
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
  async inviteByEmail(workspaceId, email, role = WORKSPACE_ROLES.MEMBER, invitedBy, options = {}) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    const { default: emailService } = await import('../auth/email.service.js');
    const { default: ChatUser } = await import('../users/ChatUser.model.js');
    const { default: auditLogService } = await import('../../services/auditLog.service.js');
    const { SOCKET_EVENTS } = await import('../../config/constants.js');
    const { emitToWorkspace } = await import('../../sockets/socketManager.js');

    const { channels = [], inviteType = 'member', domainRestriction } = options;

    // 1. Check workspace exists.
    const workspace = await this.getWorkspace(workspaceId);

    // 2. Check inviter has permission.
    const inviterRole = await workspaceRepository.getUserRole(invitedBy, workspaceId);
    const { hasPermission } = await import('../../middleware/permissions.js');
    if (!inviterRole || !hasPermission(inviterRole, 'member:invite')) {
      throw new ForbiddenError('You do not have permission to invite members to this workspace.');
    }

    // Guest invites validation on input parameters (done early)
    if (inviteType === 'guest' && (!channels || channels.length === 0)) {
      throw new BadRequestError('Guest invites must specify at least one channel.');
    }

    // 3. Check if user is already an ACTIVE workspace member.
    const existingUser = await ChatUser.findOne({ email: email.toLowerCase() }).lean();
    if (existingUser) {
      const isActiveMember = await workspaceRepository.isMember(existingUser._id, workspaceId);
      if (isActiveMember) {
        throw new BadRequestError('This user is already a member of this workspace.');
      }
    }

    // 4. Check if a PENDING invitation already exists.
    const existingInvite = await WorkspaceInvite.findOne({
      workspaceId,
      email: email.toLowerCase(),
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });
    if (existingInvite) {
      throw new ConflictError(
        'You have already sent an invitation to this user.',
        'INVITATION_ALREADY_PENDING',
      );
    }

    // Check domain restrictions if enabled
    if (workspace.settings?.domainRestrictions?.enabled) {
      const allowedDomains = workspace.settings.domainRestrictions.allowedDomains || [];
      if (allowedDomains.length > 0) {
        const emailDomain = `@${email.split('@')[1]}`.toLowerCase();
        const isAllowed = allowedDomains.some(d => d.toLowerCase() === emailDomain);
        if (!isAllowed) {
          throw new BadRequestError(
            `Email domain ${emailDomain} is not allowed for this workspace. Allowed domains: ${allowedDomains.join(', ')}`,
          );
        }
      }
    }

    // 5. If Enterprise plan: Skip member limit validation entirely.
    if (workspace.plan !== 'enterprise') {
      const planConfig = WORKSPACE_LIMITS[workspace.plan] || WORKSPACE_LIMITS.free;

      // Check guest access / limits if inviteType is guest
      if (inviteType === 'guest') {
        if (!planConfig.features.guestAccess) {
          throw new ForbiddenError(`Guest invites are not available on the ${workspace.plan} plan.`);
        }

        // Check guest count limit
        const maxGuests = workspace.settings?.guestSettings?.maxGuests ?? planConfig.maxGuests;
        if (maxGuests >= 0) {
          const { default: WorkspaceMembership } = await import('./WorkspaceMembership.model.js');
          const guestCount = await WorkspaceMembership.countDocuments({
            workspaceId,
            role: WORKSPACE_ROLES.GUEST,
            isActive: true,
          });
          if (guestCount >= maxGuests) {
            throw new BadRequestError(
              `Workspace has reached the guest limit (${maxGuests}) for the ${workspace.plan} plan.`,
            );
          }
        }
      } else {
        // Check plan member limits
        const currentCount = await workspaceRepository.countMembers(workspaceId);
        const limit = planConfig.maxMembers;
        if (limit > 0 && currentCount >= limit) {
          throw new BadRequestError(
            `Workspace has reached the member limit (${limit}) for the ${workspace.plan} plan.`,
          );
        }
      }
    }

    // Filter DM/group_dm channels from the channels list before storing
    const filteredChannels = channels.length > 0
      ? await this._filterNonDMChannels(channels, workspaceId)
      : [];

    // Generate token and hash upfront — only the hash is stored in DB
    const { token: plainToken, tokenHash } = WorkspaceInvite.generateTokenPair();

    // Get inviter name
    const inviter = await ChatUser.findById(invitedBy).lean();
    const inviterName = inviter?.name || 'A team member';

    // Send invite email with plain token (never stored in DB)
    try {
      await emailService.sendWorkspaceInviteEmail(
        email,
        workspace.name,
        inviterName,
        plainToken,
      );
    } catch (emailErr) {
      logger.error(`Invite email failed for ${email} (workspace ${workspace.slug})`, { error: emailErr.message });
      throw new Error(`Failed to send invite email: ${emailErr.message}`);
    }

    // Create invite record ONLY after successful email delivery
    const invite = await WorkspaceInvite.create({
      workspaceId,
      email: email.toLowerCase(),
      role,
      inviteType,
      invitedBy,
      channels: filteredChannels,
      tokenHash,
    });

    // Non-blocking audit log — never fails the invitation flow
    this._safeAudit(() => auditLogService.logInviteCreated(invite, invitedBy, inviterName, workspaceId));

    // Emit socket event
    try {
      emitToWorkspace(workspaceId.toString(), SOCKET_EVENTS.INVITE_CREATED, {
        invite: {
          _id: invite._id,
          email: invite.email,
          role: invite.role,
          inviteType: invite.inviteType,
          status: invite.status,
          expiresAt: invite.expiresAt,
        },
      });
    } catch (err) {
      logger.warn('Failed to emit INVITE_CREATED socket event', { error: err.message });
    }

    logger.info(`Invite email sent to ${email} for workspace ${workspace.slug}`);
    return {
      type: 'email_invite',
      invite: {
        _id: invite._id,
        email: invite.email,
        role: invite.role,
        inviteType: invite.inviteType,
        status: invite.status,
        expiresAt: invite.expiresAt,
      },
    };
  }

  /**
   * Accept a workspace invite by token.
   */
  async acceptInvite(token, userId) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    const { default: ChatUser } = await import('../users/ChatUser.model.js');
    const { default: auditLogService } = await import('../../services/auditLog.service.js');
    const { SOCKET_EVENTS } = await import('../../config/constants.js');
    const { emitToWorkspace } = await import('../../sockets/socketManager.js');

    const invite = await WorkspaceInvite.findValidByToken(token);
    if (!invite) {
      throw new NotFoundError('Invalid or expired invite.');
    }

    // Verify email matches (security: prevent invite link sharing)
    const user = await ChatUser.findById(userId).lean();
    if (!user) {
      throw new NotFoundError('User not found.');
    }
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenError(
        'This invite was sent to a different email address. Please sign in with the correct account.',
      );
    }

    // Check plan limits
    const workspace = invite.workspaceId;
    if (workspace.plan !== 'enterprise') {
      const currentCount = await workspaceRepository.countMembers(workspace._id);
      const planConfig = WORKSPACE_LIMITS[workspace.plan] || WORKSPACE_LIMITS.free;
      const limit = planConfig.maxMembers;
      if (limit > 0 && currentCount >= limit) {
        throw new BadRequestError(
          `Workspace has reached the member limit (${limit}) for the ${workspace.plan} plan.`,
        );
      }
    }

    // Check if already a member
    const isMember = await workspaceRepository.isMember(userId, workspace._id);
    if (isMember) {
      await WorkspaceInvite.markAccepted(token, userId);
      return {
        workspace,
        workspaceId: workspace._id.toString(),
        workspaceSlug: workspace.slug,
        redirectTo: `/workspace/${workspace._id}`,
        alreadyMember: true,
      };
    }

    // Add as member with the invite's role
    const membership = await workspaceRepository.addMember(userId, workspace._id, invite.role);
    await WorkspaceInvite.markAccepted(token, userId);

    // Auto-join channels based on invite type
    if (invite.inviteType === 'guest' && invite.channels && invite.channels.length > 0) {
      await this._joinSpecificChannels(userId, invite.channels, workspace._id);
    } else {
      await this._autoJoinPublicChannels(userId, workspace._id);
    }

    // Non-blocking audit log — never fails the invitation flow
    this._safeAudit(() => auditLogService.logInviteAccepted(invite._id, userId, workspace._id));

    // Emit socket event
    try {
      emitToWorkspace(workspace._id.toString(), SOCKET_EVENTS.INVITE_ACCEPTED, {
        userId: userId.toString(),
        workspaceId: workspace._id.toString(),
      });
    } catch (err) {
      logger.warn('Failed to emit INVITE_ACCEPTED socket event', { error: err.message });
    }

    logger.info(`User ${userId} accepted invite to workspace ${workspace.slug}`);
    return {
      workspace,
      workspaceId: workspace._id.toString(),
      workspaceSlug: workspace.slug,
      redirectTo: `/workspace/${workspace._id}`,
      membership,
      alreadyMember: false,
    };
  }

  /**
   * Get pending invites for a workspace.
   */
  async getPendingInvites(workspaceId) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    return WorkspaceInvite.getPendingInvites(workspaceId);
  }

  /**
   * Get all invites for a workspace with filters and pagination.
   */
  async getAllInvites(workspaceId, { status, inviteType, page = 1, limit = 20 }) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    return WorkspaceInvite.findAll(workspaceId, { status, inviteType, page, limit });
  }

  /**
   * Resend a pending invite with a new token.
   */
  async resendInvite(inviteId, workspaceId, requesterId) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    const { default: emailService } = await import('../auth/email.service.js');
    const { default: ChatUser } = await import('../users/ChatUser.model.js');
    const { default: auditLogService } = await import('../../services/auditLog.service.js');
    const { SOCKET_EVENTS } = await import('../../config/constants.js');
    const { emitToWorkspace } = await import('../../sockets/socketManager.js');

    // Find the invite first
    const existingInvite = await WorkspaceInvite.findOne({
      _id: inviteId,
      workspaceId,
      status: 'pending',
    });

    if (!existingInvite) {
      throw new NotFoundError('Invite not found or already used.');
    }

    // Check resend limit (max 3 resends)
    if (existingInvite.resendCount >= 3) {
      throw new BadRequestError(
        'This invite has reached the maximum resend limit. Please revoke and create a new invite.',
      );
    }

    // Resend with new token
    const { invite, newToken } = await WorkspaceInvite.resend(inviteId, workspaceId);

    // Get workspace and inviter info
    const workspace = await this.getWorkspace(workspaceId);
    const inviter = await ChatUser.findById(requesterId).lean();
    const inviterName = inviter?.name || 'A team member';

    // Send email with new token
    try {
      await emailService.sendWorkspaceInviteEmail(
        invite.email,
        workspace.name,
        inviterName,
        newToken,
      );
    } catch (emailErr) {
      logger.error(`Resend email failed for ${invite.email}`, { error: emailErr.message });
      await WorkspaceInvite.findByIdAndUpdate(inviteId, { status: 'email_failed' });
      throw new Error(`Resend failed — email delivery error: ${emailErr.message}`);
    }

    // Non-blocking audit log — never fails the invitation flow
    this._safeAudit(() => auditLogService.logInviteResent(inviteId, requesterId, inviterName, workspaceId));

    // Emit socket event
    try {
      emitToWorkspace(workspaceId.toString(), SOCKET_EVENTS.INVITE_RESENT, {
        inviteId: inviteId.toString(),
        email: invite.email,
      });
    } catch (err) {
      logger.warn('Failed to emit INVITE_RESENT socket event', { error: err.message });
    }

    logger.info(`Invite resent to ${invite.email} for workspace ${workspace.slug}`);
    return {
      _id: invite._id,
      email: invite.email,
      role: invite.role,
      inviteType: invite.inviteType,
      status: invite.status,
      expiresAt: invite.expiresAt,
      resendCount: invite.resendCount,
    };
  }

  /**
   * Revoke a pending invite.
   */
  async revokeInvite(inviteId, workspaceId, revokedBy) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    const { default: auditLogService } = await import('../../services/auditLog.service.js');
    const { SOCKET_EVENTS } = await import('../../config/constants.js');
    const { emitToWorkspace } = await import('../../sockets/socketManager.js');

    const invite = await WorkspaceInvite.revoke(inviteId, workspaceId, revokedBy);
    if (!invite) {
      throw new NotFoundError('Invite not found or already used.');
    }

    // Non-blocking audit log — never fails the invitation flow
    this._safeAudit(() => auditLogService.logInviteRevoked(inviteId, revokedBy, 'Admin', workspaceId));

    // Emit socket event
    try {
      emitToWorkspace(workspaceId.toString(), SOCKET_EVENTS.INVITE_REVOKED, {
        inviteId: inviteId.toString(),
        email: invite.email,
      });
    } catch (err) {
      logger.warn('Failed to emit INVITE_REVOKED socket event', { error: err.message });
    }

    return invite;
  }

  /**
   * Get public invite info by token (no auth required).
   */
  async getInviteInfoByToken(token) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    const { default: ChatUser } = await import('../users/ChatUser.model.js');

    const invite = await WorkspaceInvite.findValidByToken(token);
    if (!invite) {
      throw new NotFoundError('Invalid or expired invite.');
    }

    const inviter = await ChatUser.findById(invite.invitedBy).lean();
    const workspace = invite.workspaceId;

    return {
      workspaceName: workspace.name,
      workspaceLogo: workspace.logo,
      workspaceSlug: workspace.slug,
      inviterName: inviter?.name || 'A team member',
      inviteType: invite.inviteType,
      role: invite.role,
      expiresAt: invite.expiresAt,
      workspaceId: workspace._id,
    };
  }

  // ─── Workspace Settings ─────────────────────────────────────────────

  /**
   * Update domain restriction settings for a workspace.
   */
  async updateDomainRestrictions(workspaceId, { enabled, allowedDomains }, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);

    // Only owner/admin can update
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
    if (!role || ![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(role)) {
      throw new ForbiddenError('Only workspace owner or admin can update domain restrictions.');
    }

    const updated = await workspaceRepository.update(workspaceId, {
      'settings.domainRestrictions.enabled': enabled,
      'settings.domainRestrictions.allowedDomains': allowedDomains || [],
    });

    logger.info(`Domain restrictions updated for workspace ${workspace.slug}`, {
      enabled,
      allowedDomains,
      updatedBy: requesterId,
    });

    return updated;
  }

  /**
   * Update guest settings for a workspace.
   */
  async updateGuestSettings(workspaceId, { maxGuests, guestChannelRestriction }, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);

    // Only owner can update guest settings
    if (workspace.owner.toString() !== requesterId.toString()) {
      throw new ForbiddenError('Only the workspace owner can update guest settings.');
    }

    const updates = {};
    if (maxGuests !== undefined) {
      updates['settings.guestSettings.maxGuests'] = maxGuests;
    }
    if (guestChannelRestriction !== undefined) {
      updates['settings.guestSettings.guestChannelRestriction'] = guestChannelRestriction;
    }

    const updated = await workspaceRepository.update(workspaceId, updates);

    logger.info(`Guest settings updated for workspace ${workspace.slug}`, {
      maxGuests,
      guestChannelRestriction,
      updatedBy: requesterId,
    });

    return updated;
  }

  // ─── Billing & Plan ────────────────────────────────────────────────

  /**
   * Get workspace billing information.
   */
  async getWorkspaceBilling(workspaceId, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
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
  // ─── Security Settings ──────────────────────────────────────────────

  async getSecuritySettings(workspaceId, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
    if (!role) {
      throw new ForbiddenError('You are not a member of this workspace.');
    }
    return {
      requireEmailVerification: workspace.settings?.requireEmailVerification ?? true,
      sessionTimeout: workspace.settings?.sessionTimeout || '7d',
      twoFactorEnabled: workspace.settings?.twoFactorEnabled ?? false,
      passwordPolicy: workspace.settings?.passwordPolicy || {
        minLength: 8,
        requireSpecialChar: true,
        requireNumber: true,
        requireUppercase: true,
      },
      activeSessions: 0,
    };
  }

  async updateSecuritySettings(workspaceId, updates, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
    if (!role || ![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(role)) {
      throw new ForbiddenError('Only workspace owner or admin can update security settings.');
    }

    const setFields = {};
    if (updates.requireEmailVerification !== undefined) {
      setFields['settings.requireEmailVerification'] = updates.requireEmailVerification;
    }
    if (updates.sessionTimeout !== undefined) {
      setFields['settings.sessionTimeout'] = updates.sessionTimeout;
    }
    if (updates.twoFactorEnabled !== undefined) {
      setFields['settings.twoFactorEnabled'] = updates.twoFactorEnabled;
    }
    if (updates.passwordPolicy !== undefined) {
      setFields['settings.passwordPolicy'] = updates.passwordPolicy;
    }

    const updated = await workspaceRepository.update(workspaceId, setFields);

    // Emit socket event for real-time sync
    try {
      const { emitToWorkspace } = await import('../../sockets/socketManager.js');
      const { SOCKET_EVENTS } = await import('../../config/constants.js');
      emitToWorkspace(workspaceId.toString(), SOCKET_EVENTS.WORKSPACE_SECURITY_UPDATED, {
        workspaceId: workspaceId.toString(),
        settings: await this.getSecuritySettings(workspaceId, requesterId),
      });
    } catch (err) {
      logger.warn('Failed to emit security settings update event', { error: err.message });
    }

    logger.info(`Security settings updated for workspace ${workspace.slug}`, { updatedBy: requesterId });
    return updated;
  }

  // ─── Notification Settings ─────────────────────────────────────────

  async getNotificationSettings(workspaceId, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
    if (!role) {
      throw new ForbiddenError('You are not a member of this workspace.');
    }
    return {
      mentions: workspace.settings?.notificationSettings?.mentions ?? true,
      directMessages: workspace.settings?.notificationSettings?.directMessages ?? true,
      threadReplies: workspace.settings?.notificationSettings?.threadReplies ?? true,
      taskUpdates: workspace.settings?.notificationSettings?.taskUpdates ?? true,
      workspaceAnnouncements: workspace.settings?.notificationSettings?.workspaceAnnouncements ?? true,
      channelNotifications: workspace.settings?.notificationSettings?.channelNotifications ?? true,
      emailNotifications: workspace.settings?.notificationSettings?.emailNotifications ?? true,
      pushNotifications: workspace.settings?.notificationSettings?.pushNotifications ?? true,
      notificationDigest: workspace.settings?.notificationSettings?.notificationDigest || 'all',
    };
  }

  async updateNotificationSettings(workspaceId, updates, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
    if (!role || ![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(role)) {
      throw new ForbiddenError('Only workspace owner or admin can update notification settings.');
    }

    const setFields = {};
    for (const key of ['mentions', 'directMessages', 'threadReplies', 'taskUpdates', 'workspaceAnnouncements', 'channelNotifications', 'emailNotifications', 'pushNotifications', 'notificationDigest']) {
      if (updates[key] !== undefined) {
        setFields[`settings.notificationSettings.${key}`] = updates[key];
      }
    }

    const updated = await workspaceRepository.update(workspaceId, setFields);

    // Emit socket event for real-time sync
    try {
      const { emitToWorkspace } = await import('../../sockets/socketManager.js');
      const { SOCKET_EVENTS } = await import('../../config/constants.js');
      emitToWorkspace(workspaceId.toString(), SOCKET_EVENTS.WORKSPACE_NOTIFICATION_SETTINGS_UPDATED, {
        workspaceId: workspaceId.toString(),
        settings: await this.getNotificationSettings(workspaceId, requesterId),
      });
    } catch (err) {
      logger.warn('Failed to emit notification settings update event', { error: err.message });
    }

    logger.info(`Notification settings updated for workspace ${workspace.slug}`, { updatedBy: requesterId });
    return updated;
  }

  // ─── Integration Settings ──────────────────────────────────────────

  async getIntegrationSettings(workspaceId, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
    if (!role) {
      throw new ForbiddenError('You are not a member of this workspace.');
    }
    return {
      integrationEnabled: workspace.settings?.flowtaskIntegration?.enabled ?? false,
      autoCreateChannels: workspace.settings?.integrationSettings?.autoCreateChannels ?? true,
      syncMembers: workspace.settings?.integrationSettings?.syncMembers ?? true,
      lastSyncAt: workspace.settings?.integrationSettings?.lastSyncAt || null,
      apiUrl: workspace.settings?.flowtaskIntegration?.apiUrl || '',
    };
  }

  async updateIntegrationSettings(workspaceId, updates, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
    if (!role || ![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(role)) {
      throw new ForbiddenError('Only workspace owner or admin can update integration settings.');
    }

    const setFields = {};
    if (updates.autoCreateChannels !== undefined) {
      setFields['settings.integrationSettings.autoCreateChannels'] = updates.autoCreateChannels;
    }
    if (updates.syncMembers !== undefined) {
      setFields['settings.integrationSettings.syncMembers'] = updates.syncMembers;
    }
    if (updates.integrationEnabled !== undefined) {
      setFields['settings.flowtaskIntegration.enabled'] = updates.integrationEnabled;
    }

    const updated = await workspaceRepository.update(workspaceId, setFields);

    // Emit socket event for real-time sync
    try {
      const { emitToWorkspace } = await import('../../sockets/socketManager.js');
      const { SOCKET_EVENTS } = await import('../../config/constants.js');
      emitToWorkspace(workspaceId.toString(), SOCKET_EVENTS.WORKSPACE_INTEGRATION_UPDATED, {
        workspaceId: workspaceId.toString(),
        settings: await this.getIntegrationSettings(workspaceId, requesterId),
      });
    } catch (err) {
      logger.warn('Failed to emit integration update event', { error: err.message });
    }

    logger.info(`Integration settings updated for workspace ${workspace.slug}`, { updatedBy: requesterId });
    return updated;
  }

  // ─── Active Sessions ─────────────────────────────────────────────

  async getActiveSessions(workspaceId, requesterId) {
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
    if (!role || ![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(role)) {
      throw new ForbiddenError('Only workspace owner or admin can view active sessions.');
    }
    // Return placeholder - real session tracking would query a sessions collection
    return { sessions: [], total: 0 };
  }

  async logoutAllSessions(workspaceId, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);
    if (workspace.owner.toString() !== requesterId.toString()) {
      throw new ForbiddenError('Only the workspace owner can logout all sessions.');
    }
    // Placeholder - real implementation would invalidate all refresh tokens
    logger.info(`All sessions logged out for workspace ${workspace.slug} by ${requesterId}`);
    return { message: 'All sessions logged out successfully.' };
  }

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
   * Auto-add a user to all public channels in a workspace.
   * Called when a user first joins a workspace (invite, invite code, or email accept).
   * Skips for guest users (they only get access to explicitly assigned channels).
   * Non-critical — logs errors but does not fail the join operation.
   * @private
   */
  async _autoJoinPublicChannels(userId, workspaceId) {
    // Check if user is a guest — guests don't auto-join public channels
    const role = await workspaceRepository.getUserRole(userId, workspaceId);
    if (role === WORKSPACE_ROLES.GUEST) {
      logger.info('[WORKSPACE_JOIN] Skipping auto-join for guest user', {
        userId,
        workspaceId,
      });
      return;
    }

    try {
      const { default: channelRepository } = await import('../channels/channel.repository.js');
      const { default: ChannelMember } = await import('../channels/ChannelMember.model.js');
      const { default: Channel } = await import('../channels/Channel.model.js');
      const { emitToUser, joinChannelRoom } = await import('../../sockets/socketManager.js');
      const { SOCKET_EVENTS } = await import('../../config/constants.js');

      const publicChannels = await channelRepository.findPublicChannels(workspaceId);
      if (publicChannels.length === 0) return;

      const wsId = workspaceId.toString();
      const uid = userId.toString();

      for (const channel of publicChannels) {
        // Skip if user is already a member (idempotent, but avoid extra work)
        if (channel.hasMember(userId)) continue;

        const channelId = channel._id.toString();

        // Upsert into ChannelMember collection (source of truth)
        await ChannelMember.addMember(channelId, userId, wsId, CHANNEL_MEMBER_ROLES.MEMBER);

        // Update embedded members array for backward compat
        await Channel.findOneAndUpdate(
          { _id: channel._id, 'members.userId': { $ne: userId } },
          {
            $push: { members: { userId, role: CHANNEL_MEMBER_ROLES.MEMBER, joinedAt: new Date() } },
            $inc: { memberCount: 1 },
          },
        );

        // Notify user's connected sockets
        const channelPayload = {
          _id: channel._id,
          name: channel.name,
          slug: channel.slug,
          type: channel.type,
          visibility: channel.visibility,
          description: channel.description,
          memberCount: (channel.memberCount || 0) + 1,
          workspaceId: channel.workspaceId,
          createdBy: channel.createdBy,
        };
        emitToUser(uid, SOCKET_EVENTS.CHANNEL_ADDED, { channel: channelPayload }, wsId);
        joinChannelRoom(uid, channelId, wsId);
      }

      logger.info('[WORKSPACE_JOIN] Auto-added user to public channels', {
        userId: uid,
        workspaceId: wsId,
        channelCount: publicChannels.length,
      });
    } catch (error) {
      logger.error('[WORKSPACE_JOIN] Failed to auto-join public channels', {
        userId,
        workspaceId,
        error: error.message,
      });
    }
  }

  /**
   * Add a user to specific channels (for guest invites).
   * Non-critical — logs errors but does not fail the join operation.
   * @private
   */
  async _joinSpecificChannels(userId, channelIds, workspaceId) {
    if (!channelIds || channelIds.length === 0) return;

    try {
      const { default: ChannelMember } = await import('../channels/ChannelMember.model.js');
      const { default: Channel } = await import('../channels/Channel.model.js');
      const { emitToUser, joinChannelRoom } = await import('../../sockets/socketManager.js');
      const { SOCKET_EVENTS } = await import('../../config/constants.js');

      const wsId = workspaceId.toString();
      const uid = userId.toString();

      for (const channelId of channelIds) {
        // Upsert into ChannelMember collection
        await ChannelMember.addMember(channelId, userId, wsId, CHANNEL_MEMBER_ROLES.MEMBER);

        // Update embedded members array for backward compat
        const channel = await Channel.findOneAndUpdate(
          { _id: channelId, 'members.userId': { $ne: userId } },
          {
            $push: { members: { userId, role: CHANNEL_MEMBER_ROLES.MEMBER, joinedAt: new Date() } },
            $inc: { memberCount: 1 },
          },
          { returnDocument: 'after' },
        );

        if (channel) {
          // Notify user's connected sockets
          const channelPayload = {
            _id: channel._id,
            name: channel.name,
            slug: channel.slug,
            type: channel.type,
            visibility: channel.visibility,
            description: channel.description,
            memberCount: channel.memberCount || 1,
            workspaceId: channel.workspaceId,
            createdBy: channel.createdBy,
          };
          emitToUser(uid, SOCKET_EVENTS.CHANNEL_ADDED, { channel: channelPayload }, wsId);
          joinChannelRoom(uid, channelId.toString(), wsId);
        }
      }

      logger.info('[WORKSPACE_JOIN] Added user to specific channels', {
        userId: uid,
        workspaceId: wsId,
        channelCount: channelIds.length,
      });
    } catch (error) {
      logger.error('[WORKSPACE_JOIN] Failed to join specific channels', {
        userId,
        workspaceId,
        error: error.message,
      });
    }
  }

  /**
   * Leave a workspace (self-remove).
   * - Regular members: simply leave the workspace (no effect on others).
   * - Owner: leaving triggers automatic workspace deletion with all associated data.
   */
  async leaveWorkspace(workspaceId, userId) {
    const role = await workspaceRepository.getUserRole(userId, workspaceId);

    if (!role) {
      throw new BadRequestError('You are not a member of this workspace.');
    }

    if (role === WORKSPACE_ROLES.OWNER) {
      // Owner leaving = auto-delete the workspace with all data
      const workspace = await this.getWorkspace(workspaceId);
      await this._cascadeDeleteWorkspace(workspaceId, workspace.slug, userId);
      return { message: 'Workspace deleted successfully because the owner left.' };
    }

    // Regular member: simply leave
    await workspaceRepository.removeMember(userId, workspaceId);
    logger.info(`User ${userId} left workspace ${workspaceId}`);

    return { message: 'Left workspace successfully.' };
  }

  // ─── Enterprise Invite Helpers ───────────────────────────────────────────

  /**
   * Fire a synchronous audit log without breaking the calling flow.
   * Audit failures are caught, logged, and swallowed — never thrown.
   * @param {Function} auditFn - Function that calls auditLogService
   * @private
   */
  _safeAudit(auditFn) {
    try {
      auditFn();
    } catch (err) {
      logger.warn('AuditLog: non-blocking audit failed (swallowed)', {
        error: err.message,
      });
    }
  }

  /**
   * Filter out DM and group DM channels from a list of channel IDs.
   * Only returns channels where type is NOT 'dm' and NOT 'group_dm'.
   * @param {string[]} channelIds - Array of channel ObjectId strings
   * @param {string} workspaceId - Workspace ObjectId string
   * @returns {Promise<string[]>} Filtered channel IDs
   * @private
   */
  async _filterNonDMChannels(channelIds, workspaceId) {
    if (!channelIds || channelIds.length === 0) return [];

    try {
      const { default: Channel } = await import('../channels/Channel.model.js');
      const channels = await Channel.find({
        _id: { $in: channelIds },
        workspaceId,
        type: { $nin: ['dm', 'group_dm'] },
      }).select('_id').lean();

      return channels.map(ch => ch._id.toString());
    } catch (err) {
      logger.error('[INVITE] Failed to filter DM channels', { error: err.message });
      // Fallback: return original list if filtering fails (non-critical)
      return channelIds;
    }
  }
}

export default new WorkspaceService();
