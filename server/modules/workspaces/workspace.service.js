import crypto from 'node:crypto';
import mongoose from 'mongoose';
import workspaceRepository from './workspace.repository.js';
import WorkspaceMapping from '../flowtask/WorkspaceMapping.model.js';
import { WORKSPACE_ROLES, WORKSPACE_LIMITS, DEFAULT_CHANNELS, CHANNEL_VISIBILITY, CHANNEL_MEMBER_ROLES, mapFlowTaskPlanToChatPlan } from '../../config/constants.js';
import env from '../../config/environment.js';
import logger from '../../utils/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../../middleware/errorHandler.js';

/**
 * Workspace Service — business logic for workspace management.
 */

class WorkspaceService {
  _assertMembershipManagedOutsideChatApp(workspace) {
    if (workspace?.source === 'flowtask') {
      throw new ForbiddenError('Workspace membership and roles are managed by FlowTask for this workspace.');
    }
  }

  // ─── FlowTask Integration ───────────────────────────────────────────────

  /**
   * Find or create the ChatApp workspace linked to ONE specific FlowTask
   * workspace, keyed by FlowTask's real workspace id via WorkspaceMapping.
   * Used during FlowTask SSO login to auto-provision a workspace on first
   * "Open Chat" click from a given FlowTask workspace.
   *
   * `plan` is the FlowTask workspace's actual plan slug (free/pro/enterprise/
   * legacy — see mapFlowTaskPlanToChatPlan), read from the SSO JWT's `plan`
   * claim by the caller. Defaults to 'free' (fail CLOSED) if omitted —
   * previously this always hardcoded plan:'enterprise' regardless of the
   * real FlowTask plan, which silently gave every FlowTask-linked workspace
   * unlimited ChatApp access. A Free-plan workspace is rejected outright
   * below (see the entitlement gate) rather than ever being provisioned.
   *
   * Replaces the old singleton lookup (workspaceRepository.findFlowTaskWorkspace(),
   * which returned "the one" source:'flowtask' workspace regardless of which
   * FlowTask tenant asked) — that made every FlowTask workspace share the
   * same ChatApp workspace. See Workspace.model.js for the removed unique
   * index this replaces.
   *
   * @param {object} params
   * @param {string} params.creatorId - ChatUser _id of the FlowTask user
   * @param {string} params.flowTaskWorkspaceId - FlowTask's real workspace ObjectId (string)
   * @param {string} [params.workspaceName] - Display name hint from FlowTask
   * @param {string} [params.workspaceSlug] - Slug hint from FlowTask
   * @param {string} [params.plan] - ChatApp plan slug (already mapped from FlowTask's), free|pro|enterprise
   * @returns {Promise<object>} workspace document
   */
  async findOrCreateFlowTaskWorkspace({
    creatorId, flowTaskWorkspaceId, workspaceName, workspaceSlug, plan,
    membershipRole = WORKSPACE_ROLES.MEMBER,
  }) {
    if (!flowTaskWorkspaceId) {
      throw new BadRequestError('flowTaskWorkspaceId is required.');
    }
    const resolvedPlan = plan || 'free';

    const existingMapping = await WorkspaceMapping.findByFlowTaskWorkspaceId(flowTaskWorkspaceId);
    if (existingMapping) {
      let workspace = await workspaceRepository.findById(existingMapping.chatWorkspaceId);
      if (workspace?.isActive) {
        // Self-healing backstop: the WORKSPACE_PLAN_CHANGED webhook is the
        // fast/real-time sync path, but if it was ever missed (ChatApp
        // unreachable at the time, workspace never "connected" yet) this
        // reconciles the plan fresh from the JWT claim on every real login.
        if (plan && workspace.plan !== resolvedPlan) {
          workspace = await workspaceRepository.update(workspace._id, { plan: resolvedPlan });
          logger.info('FlowTask workspace plan self-healed on login', {
            workspaceId: workspace._id, flowTaskWorkspaceId, plan: resolvedPlan,
          });
        }

        if (workspace.plan === 'free') {
          throw new ForbiddenError('This FlowTask workspace is on the Free plan — ChatApp requires Pro or Enterprise. Ask your workspace owner to upgrade in FlowTask.');
        }

        existingMapping.lastSeenAt = new Date();
        existingMapping.save().catch((err) => {
          logger.warn('Failed to bump WorkspaceMapping.lastSeenAt', { error: err.message });
        });
        logger.info('FlowTask workspace membership resolved via mapping', {
          workspaceId: workspace._id,
          flowTaskWorkspaceId,
          creatorId,
        });
        return workspace;
      }
      // Mapping points at a workspace that no longer exists/is inactive —
      // log it loudly and provision a fresh one below (the stale row must
      // be removed first: flowTaskWorkspaceId is uniquely indexed).
      logger.error('WorkspaceMapping points at a missing/inactive Workspace — reprovisioning', {
        flowTaskWorkspaceId,
        chatWorkspaceId: existingMapping.chatWorkspaceId,
      });
      await WorkspaceMapping.deleteOne({ _id: existingMapping._id });
    }

    // Gate BEFORE provisioning anything — a Free-plan FlowTask workspace
    // must never get a ChatApp counterpart created at all, not created-then-
    // rejected. Independent of (and a backstop for) the SSO layer's own
    // check in auth.service.js#loginFlowTask.
    if (resolvedPlan === 'free') {
      throw new ForbiddenError('This FlowTask workspace is on the Free plan — ChatApp requires Pro or Enterprise. Ask your workspace owner to upgrade in FlowTask.');
    }

    const name = workspaceName ;
    let slug = (workspaceSlug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'flowtask';

    // Deliberately NOT wrapped in a multi-document transaction
    // (session.withTransaction): that requires a replica set / mongos, and
    // the default local/dev deployment is a bare standalone
    // `mongodb://localhost:27017/...` instance (see .env.example) which
    // rejects transactions outright. A transaction failing here was
    // previously swallowed by the caller's try/catch (auth.controller.js),
    // so the login would silently succeed with wsId=null — "logged in, but
    // ChatApp shows no workspaces". Concurrency safety instead comes from
    // the unique indexes on Workspace.slug and
    // WorkspaceMapping.flowTaskWorkspaceId/chatWorkspaceId, with
    // compensating cleanup (_rollbackOrphanedWorkspace) if a race is lost
    // after partial creation.
    for (let attempt = 0; attempt < 5; attempt++) {
      let workspace = null;
      try {
        workspace = await mongoose.model('Workspace').create({
          name,
          slug,
          description: 'Auto-created workspace for FlowTask integration',
          plan: resolvedPlan,
          source: 'flowtask',
          owner: creatorId,
          memberCount: 1,
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

        await mongoose.model('WorkspaceMembership').create({
          userId: creatorId,
          workspaceId: workspace._id,
          // `Workspace.owner` remains a technical required field for the
          // ChatApp model, but FlowTask's membership role is authoritative
          // for access in this workspace. Never bootstrap a FlowTask user as
          // ChatApp owner merely because they opened Chat first.
          role: membershipRole,
          isActive: true,
          joinedAt: new Date(),
        });

        await WorkspaceMapping.create({
          chatWorkspaceId: workspace._id,
          flowTaskWorkspaceId,
          flowTaskWorkspaceSlug: workspaceSlug || null,
          flowTaskWorkspaceName: workspaceName || null,
          syncOrigin: 'user_initiated',
          createdByChatUserId: creatorId,
        });

        // Default channels are non-critical, matching createWorkspace()'s
        // existing pattern.
        await this._createDefaultChannels(workspace._id, creatorId);

        logger.info('FlowTask workspace auto-created', {
          workspaceId: workspace._id,
          flowTaskWorkspaceId,
          name: workspace.name,
          creatorId,
        });

        return workspace;
      } catch (error) {
        if (error?.code !== 11000) throw error;

        // Diagnostic: which unique index actually tripped (Workspace.slug vs
        // WorkspaceMapping.flowTaskWorkspaceId vs .chatWorkspaceId) — without
        // this, a persistent 11000 across every retry is very hard to tell
        // apart from "a genuine concurrent request" vs "a stale leftover row".
        logger.warn('findOrCreateFlowTaskWorkspace: unique-key collision, resolving', {
          attempt,
          flowTaskWorkspaceId,
          creatorId,
          hadPartialWorkspace: !!workspace,
          keyPattern: error.keyPattern,
          keyValue: error.keyValue,
        });

        const concurrentMapping = await WorkspaceMapping.findByFlowTaskWorkspaceId(flowTaskWorkspaceId);
        if (concurrentMapping) {
          // Another concurrent login for this same brand-new FlowTask
          // workspace won the race. Discard anything we managed to create
          // and adopt the winner's workspace instead.
          if (workspace) {
            await this._rollbackOrphanedWorkspace(workspace._id, creatorId);
          }
          const winnerWorkspace = await workspaceRepository.findById(concurrentMapping.chatWorkspaceId);
          if (winnerWorkspace?.isActive) {
            logger.info('Concurrent FlowTask workspace create resolved by unique mapping', {
              flowTaskWorkspaceId,
              chatWorkspaceId: concurrentMapping.chatWorkspaceId,
              creatorId,
            });
            return winnerWorkspace;
          }
          // The mapping's target workspace doesn't exist / isn't active — a
          // stale/orphaned row (e.g. left over from an earlier failed
          // attempt) rather than a genuine concurrent winner. It's holding
          // the flowTaskWorkspaceId unique slot hostage, so every retry
          // would fail identically forever unless we remove it here.
          logger.error('Stale WorkspaceMapping blocked provisioning — removing and retrying', {
            flowTaskWorkspaceId,
            chatWorkspaceId: concurrentMapping.chatWorkspaceId,
          });
          await WorkspaceMapping.deleteOne({ _id: concurrentMapping._id });
        } else if (workspace) {
          // No mapping race — most likely a Workspace.slug collision that
          // happened after we'd already created the workspace. Clean up
          // and retry with a suffixed slug.
          await this._rollbackOrphanedWorkspace(workspace._id, creatorId);
        }
        slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
      }
    }

    throw new Error(`Failed to provision FlowTask-linked workspace for flowTaskWorkspaceId=${flowTaskWorkspaceId} after retries.`);
  }

  /**
   * Compensating cleanup for findOrCreateFlowTaskWorkspace: deletes a
   * partially-created Workspace + its owner WorkspaceMembership when a
   * unique-index race means it can't be kept (either a concurrent request
   * already won the flowTaskWorkspaceId mapping, or a plain slug retry is
   * needed). Never throws — logs and moves on, since the caller always
   * retries or returns a different workspace afterward regardless.
   * @private
   */
  async _rollbackOrphanedWorkspace(workspaceId, creatorId) {
    try {
      await mongoose.model('Workspace').deleteOne({ _id: workspaceId });
      await mongoose.model('WorkspaceMembership').deleteOne({ workspaceId, userId: creatorId });
    } catch (err) {
      logger.error('Failed to roll back orphaned FlowTask workspace after a lost race', {
        workspaceId,
        creatorId,
        error: err.message,
      });
    }
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
      throw new BadRequestError(`Workspace "${slug}" is already taken.`);
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

    // Reverse-sync: best-effort announce to FlowTask so it can provision
    // its own counterpart workspace (see flowtaskInboundSync.service.js).
    // The .catch() ensures a FlowTask outage can never fail or throw out
    // of workspace creation itself — a workspace that fails this step
    // simply stays FlowTask-unlinked, exactly as it would have before this
    // feature existed. Deliberately calls ONLY this announce path, never
    // anything chatHooks-shaped — findOrCreateFlowTaskWorkspace() (the
    // FlowTask-SSO-triggered path) must remain the only other place a
    // workspace/mapping gets created, and it never calls this announce
    // function, which is what prevents a sync ping-pong loop.
    try {
      const { default: ChatUser } = await import('../users/ChatUser.model.js');
      const { default: flowtaskInboundSync } = await import('../flowtask/flowtaskInboundSync.service.js');
      const creator = await ChatUser.findById(creatorId).lean();
      await flowtaskInboundSync.announceWorkspaceCreated({ workspace, creator }).catch((err) => {
        logger.warn('Failed to announce new workspace to FlowTask — it will remain FlowTask-unlinked until retried', {
          workspaceId: workspace._id,
          error: err.message,
        });
      });
    } catch (err) {
      logger.warn('Reverse-sync announce to FlowTask threw unexpectedly — workspace creation unaffected', {
        workspaceId: workspace._id,
        error: err.message,
      });
    }

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

    // System channels (general/admin/managers/announcements) used to be
    // bootstrapped only once, at server boot, for a single hardcoded
    // "default" workspace (server/index.js) — meaning every OTHER
    // workspace never got them, and features that look these up by slug
    // (botNotifier.js, announcementEventHandler.js, userEventHandler.js)
    // would silently find nothing for any workspace but that one. Now
    // bootstrapped per-workspace, at actual creation time, for every
    // workspace equally — idempotent, safe even if called more than once.
    const { default: channelService } = await import('../channels/channel.service.js');
    await channelService.bootstrapSystemChannels(workspaceId).catch((err) => {
      logger.error('Failed to bootstrap system channels for new workspace', {
        workspaceId,
        error: err.message,
      });
    });

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
    this._assertMembershipManagedOutsideChatApp(workspace);

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
      const { default: ReadReceipt } = await import('../readReceipts/readReceipt.model.js');
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
    const members = await workspaceRepository.getWorkspaceMembers(workspaceId, options);
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
    const { userIds, emails } = await WorkspaceInvite.getAcceptedGuestIdentities(workspaceId);
    if (!userIds.size && !emails.size) return members;

    return members.map((m) => {
      if (m.role === WORKSPACE_ROLES.OWNER || m.role === WORKSPACE_ROLES.ADMIN || m.role === WORKSPACE_ROLES.GUEST) {
        return m;
      }
      const uid = (m.userId?._id || m.userId)?.toString();
      const email = (m.userId?.email || '').toLowerCase();
      if ((uid && userIds.has(uid)) || (email && emails.has(email))) {
        return { ...m, role: WORKSPACE_ROLES.GUEST };
      }
      return m;
    });
  }

  /**
   * Invite a user to a workspace.
   */
  async inviteMember(workspaceId, userId, role = WORKSPACE_ROLES.MEMBER, invitedBy) {
    // Check plan limits
    const workspace = await this.getWorkspace(workspaceId);
    this._assertMembershipManagedOutsideChatApp(workspace);
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
    this._assertMembershipManagedOutsideChatApp(await this.getWorkspace(workspaceId));
    const requesterRole = await workspaceRepository.getUserRole(requesterId, workspaceId);
    const targetRole = await workspaceRepository.getUserRole(userId, workspaceId);

    if (!requesterRole) {
      throw new ForbiddenError('You are not a member of this workspace.');
    }

    // Can't remove owner
    if (targetRole === WORKSPACE_ROLES.OWNER) {
      throw new ForbiddenError('Cannot remove the workspace owner.');
    }

    const { hasPermission } = await import('../../middleware/permissions.js');
    if (!hasPermission(requesterRole, 'member:remove')) {
      throw new ForbiddenError('You do not have permission to remove members.');
    }

    // Admin can't remove other admins (owner check logic)
    if (requesterRole === WORKSPACE_ROLES.ADMIN && targetRole === WORKSPACE_ROLES.ADMIN) {
      throw new ForbiddenError('Admins cannot remove other admins.');
    }

    // 1. Remove workspace membership
    await workspaceRepository.removeMember(userId, workspaceId);

    // 2. Remove from all channels in this workspace (both collections)
    try {
      const { default: ChannelMember } = await import('../channels/ChannelMember.model.js');
      const { default: Channel } = await import('../channels/Channel.model.js');
      await ChannelMember.deleteMany({ userId, workspaceId });
      await Channel.updateMany(
        { workspaceId, 'members.userId': userId },
        {
          $pull: { members: { userId } },
          $inc: { memberCount: -1 },
        },
      );
    } catch (err) {
      logger.error(`[removeMember] Failed to remove user ${userId} from channels in workspace ${workspaceId}`, { error: err.message });
    }

    // 3. Revoke any pending invites for this user's email
    try {
      const { default: ChatUser } = await import('../users/ChatUser.model.js');
      const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');
      const user = await ChatUser.findById(userId).select('email').lean();
      if (user?.email) {
        await WorkspaceInvite.updateMany(
          { workspaceId, email: user.email.toLowerCase(), status: 'pending' },
          { $set: { status: 'revoked', revokedBy: requesterId, revokedAt: new Date() } },
        );
      }
    } catch (err) {
      logger.error(`[removeMember] Failed to revoke invites for user ${userId}`, { error: err.message });
    }

    // 4. Emit socket event so all connected clients update in real-time
    try {
      const { emitToWorkspace, emitToUser } = await import('../../sockets/socketManager.js');
      const { SOCKET_EVENTS } = await import('../../config/constants.js');
      const wsId = workspaceId.toString();
      const uid = userId.toString();
      // Notify all workspace members (admin panels, member lists)
      emitToWorkspace(wsId, SOCKET_EVENTS.WORKSPACE_MEMBER_REMOVED, {
        workspaceId: wsId,
        userId: uid,
        removedBy: requesterId.toString(),
      });
      // Notify the removed user directly so their client can react
      emitToUser(uid, SOCKET_EVENTS.WORKSPACE_MEMBER_REMOVED, {
        workspaceId: wsId,
        userId: uid,
        removedBy: requesterId.toString(),
      }, wsId);
    } catch (err) {
      logger.warn(`[removeMember] Failed to emit socket event for user ${userId}`, { error: err.message });
    }

    logger.info(`User ${userId} fully removed from workspace ${workspaceId} by ${requesterId}`);
    return { message: 'Member removed successfully.' };
  }

  /**
   * Update a member's role.
   */
  async updateMemberRole(workspaceId, userId, newRole, requesterId) {
    this._assertMembershipManagedOutsideChatApp(await this.getWorkspace(workspaceId));
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
    this._assertMembershipManagedOutsideChatApp(workspace);

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
    this._assertMembershipManagedOutsideChatApp(await this.getWorkspace(workspaceId));
    const role = await workspaceRepository.getUserRole(requesterId, workspaceId);
    if (!role || ![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(role)) {
      throw new ForbiddenError('Only owner or admin can regenerate invite codes.');
    }

    const newCode = crypto.randomBytes(16).toString('hex');
    return workspaceRepository.update(workspaceId, { inviteCode: newCode });
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

    const { channels = [], inviteType: rawInviteType = 'member', domainRestriction } = options;

    const validInviteTypes = ['member', 'guest'];
    let inviteType = rawInviteType;
    // People-directory invites often send role=guest without inviteType.
    if (role === WORKSPACE_ROLES.GUEST) {
      inviteType = 'guest';
    }
    if (!validInviteTypes.includes(inviteType)) {
      throw new BadRequestError('Invalid invite type.');
    }

    const validRoles = Object.values(WORKSPACE_ROLES);
    let finalRole = role;
    if (inviteType === 'guest') {
      finalRole = WORKSPACE_ROLES.GUEST;
    } else if (!validRoles.includes(finalRole)) {
      throw new BadRequestError('Invalid role specified.');
    }

    // 1. Check workspace exists.
    const workspace = await this.getWorkspace(workspaceId);
    this._assertMembershipManagedOutsideChatApp(workspace);

    // 2. Check inviter has permission.
    const inviterRole = await workspaceRepository.getUserRole(invitedBy, workspaceId);
    const { hasPermission } = await import('../../middleware/permissions.js');
    if (!inviterRole || !hasPermission(inviterRole, 'member:invite')) {
      throw new ForbiddenError('You do not have permission to invite members to this workspace.');
    }

    // Guest channel assignment is preferred but not required for listing/invites
    // from the People directory (role=guest without a channel picker).
    if (inviteType === 'guest' && (!channels || channels.length === 0)) {
      logger.info('[INVITE] Guest invite with no channels — guest will have no channel access until assigned', {
        workspaceId: String(workspaceId),
        email,
      });
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
      role: finalRole,
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
    this._assertMembershipManagedOutsideChatApp(workspace);
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

    const isGuestInvite = invite.inviteType === 'guest' || invite.role === 'guest';
    const roleToAssign = isGuestInvite ? WORKSPACE_ROLES.GUEST : invite.role;

    // Check if already a member
    const isMember = await workspaceRepository.isMember(userId, workspace._id);
    if (isMember) {
      // FlowTask sync can create a member membership before the guest invite is
      // accepted. Promote only plain members — never downgrade owner/admin.
      const existingRole = isMember.role || isMember;
      if (isGuestInvite && existingRole === WORKSPACE_ROLES.MEMBER) {
        await workspaceRepository.updateMemberRole(userId, workspace._id, WORKSPACE_ROLES.GUEST);
        if (invite.channels && invite.channels.length > 0) {
          await this._joinSpecificChannels(userId, invite.channels, workspace._id);
        }
      }
      await WorkspaceInvite.markAccepted(token, userId);
      return {
        workspace,
        workspaceId: workspace._id.toString(),
        workspaceSlug: workspace.slug,
        redirectTo: `/workspace/${workspace._id}`,
        alreadyMember: true,
      };
    }

    // Add as member with the invite's role (guest invites always join as guest)
    const membership = await workspaceRepository.addMember(userId, workspace._id, roleToAssign);
    await WorkspaceInvite.markAccepted(token, userId);

    // Auto-join channels based on invite type
    if (invite.inviteType === 'guest') {
      if (invite.channels && invite.channels.length > 0) {
        await this._joinSpecificChannels(userId, invite.channels, workspace._id);
      }
    } else {
      const { default: channelRepository } = await import('../channels/channel.repository.js');
      const systemChannels = await channelRepository.findSystemChannels(workspace._id);
      
      const channelsToJoin = new Set();
      
      if (invite.channels && invite.channels.length > 0) {
        invite.channels.forEach(chId => channelsToJoin.add(chId.toString()));
      }
      
      if (systemChannels && systemChannels.length > 0) {
        systemChannels.forEach(ch => channelsToJoin.add(ch._id.toString()));
      }
      
      if (channelsToJoin.size > 0) {
        await this._joinSpecificChannels(userId, Array.from(channelsToJoin), workspace._id);
      }
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
   * Decline a workspace invite by token.
   * Can be called by unauthenticated users since the token acts as proof.
   */
  async declineInvite(token) {
    const { default: WorkspaceInvite } = await import('./WorkspaceInvite.model.js');

    const invite = await WorkspaceInvite.findValidByToken(token);
    if (!invite) {
      throw new NotFoundError('Invalid or expired invite.');
    }

    await WorkspaceInvite.markDeclined(token);
    
    logger.info(`Invite ${invite._id} to workspace ${invite.workspaceId.slug} was declined`);
    
    return { success: true };
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

    this._assertMembershipManagedOutsideChatApp(await this.getWorkspace(workspaceId));

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

    this._assertMembershipManagedOutsideChatApp(await this.getWorkspace(workspaceId));
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

    // First try it as an email invite token
    let invite = await WorkspaceInvite.findValidByToken(token);
    let inviter = null;
    let workspace = null;
    let inviteType = 'member';
    let role = WORKSPACE_ROLES.MEMBER;
    let expiresAt = null;

    if (invite) {
      inviter = await ChatUser.findById(invite.invitedBy).lean();
      workspace = invite.workspaceId;
      inviteType = invite.inviteType;
      role = invite.role;
      expiresAt = invite.expiresAt;
    } else {
      // If not found, try as a permanent workspace invite code
      workspace = await workspaceRepository.findByInviteCode(token);
      if (!workspace || !workspace.isActive) {
        throw new NotFoundError('Invalid or expired invite.');
      }
    }

    return {
      workspaceName: workspace.name,
      workspaceLogo: workspace.logo,
      workspaceSlug: workspace.slug,
      inviterName: inviter?.name || 'A team member',
      inviteType,
      role,
      expiresAt,
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
    this._assertMembershipManagedOutsideChatApp(workspace);
    if (workspace.owner.toString() !== requesterId.toString()) {
      throw new ForbiddenError('Only the workspace owner can logout all sessions.');
    }
    // Placeholder - real implementation would invalidate all refresh tokens
    logger.info(`All sessions logged out for workspace ${workspace.slug} by ${requesterId}`);
    return { message: 'All sessions logged out successfully.' };
  }

  async upgradePlan(workspaceId, newPlan, requesterId) {
    const workspace = await this.getWorkspace(workspaceId);

    // FlowTask-linked workspaces have their plan managed from FlowTask —
    // manually switching it here would drift out of sync with the source
    // of truth the next time a webhook or login reconciles it. Genuinely
    // standalone (source:'independent') workspaces are unaffected; this
    // endpoint remains their only way to change plan.
    if (workspace.source === 'flowtask') {
      throw new ForbiddenError("This workspace's plan is managed by FlowTask. Upgrade it from your FlowTask workspace settings — changes sync here automatically.");
    }

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
    this._assertMembershipManagedOutsideChatApp(await this.getWorkspace(workspaceId));
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
