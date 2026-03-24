import directoriesRepository from './directories.repository.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import flowtaskService from '../flowtask/flowtask.service.js';
import userRepository from '../users/user.repository.js';
import workspaceRepository from '../workspaces/workspace.repository.js';

class DirectoriesService {
  /**
   * People tab — workspace users with isCurrentUser flag.
   */
  async getUsers(userId, workspaceId, params, flowTaskToken = null) {
    // If a FlowTask token is available, attempt to fetch FlowTask users and
    // ensure they're upserted into ChatApp and added to this workspace. This
    // mirrors the behaviour of /users/dm-contacts so FlowTask users appear
    // in the Directories People tab.
    try {
      // Resolve a usable token: prefer provided token, otherwise check persisted
      // token on the ChatUser record (ignore expired persisted tokens).
      let token = flowTaskToken;
      if (!token) {
        const persisted = await userRepository.findById(userId);
        if (persisted) {
          const tokenExpiry = persisted.flowTaskTokenExpiry ? new Date(persisted.flowTaskTokenExpiry) : null;
          if (persisted.flowTaskToken && (!tokenExpiry || tokenExpiry > new Date())) {
            token = persisted.flowTaskToken;
          }
        }
      }

      if (token) {
        let ftUsers = [];
        try {
          ftUsers = await flowtaskService.getUsers(params.search ? { search: params.search } : {}, token);
        } catch (err) {
          // If FlowTask fetch fails, don't block — will fall back to workspace members
          logger.warn('Directories: failed to fetch FlowTask users', { error: err.message, workspaceId });
          ftUsers = [];
        }

        // Upsert FlowTask users and add as workspace members when missing.
        for (const ftu of ftUsers || []) {
          try {
            if (!ftu._id || !ftu.email) continue;
            const synced = await userRepository.upsertFromFlowTask(ftu);
            const isMember = await workspaceRepository.isMember(workspaceId, synced._id);
            if (!isMember) {
              await workspaceRepository.addMember(workspaceId, synced._id, 'member');
            }
          } catch (err) {
            logger.warn('Directories: failed to sync FlowTask user into workspace', {
              email: ftu.email,
              error: err.message,
              workspaceId,
            });
          }
        }
      }
    } catch (err) {
      // Protect the endpoint from unexpected errors during sync — continue to
      // return workspace members even if sync fails.
      logger.debug('Directories: flowtask sync encountered error', { error: err.message });
    }

    const result = await directoriesRepository.getWorkspaceUsers(workspaceId, params);
    const currentId = userId.toString();

    result.users = result.users.map((u) => ({
      ...u,
      isCurrentUser: u._id.toString() === currentId,
    }));

    return result;
  }

  /**
   * Channels tab — all workspace channels annotated with isJoined for requesting user.
   */
  async getChannels(userId, workspaceId, params) {
    const [result, joinedSet] = await Promise.all([
      directoriesRepository.getWorkspaceChannels(workspaceId, params),
      directoriesRepository.getUserChannelIds(userId, workspaceId),
    ]);

    result.channels = result.channels.map((ch) => ({
      ...ch,
      isJoined: joinedSet.has(ch._id.toString()),
    }));

    return result;
  }

  /**
   * User Groups tab — list groups.
   */
  async getGroups(workspaceId, params) {
    const groups = await directoriesRepository.getUserGroups(workspaceId, params);
    return groups.map((g) => ({
      ...g,
      memberCount: g.members?.length || 0,
    }));
  }

  /**
   * Single user group with members.
   */
  async getGroupById(groupId, workspaceId) {
    const group = await directoriesRepository.getUserGroupById(groupId);
    if (!group || group.workspaceId.toString() !== workspaceId) {
      throw new NotFoundError('User group not found');
    }
    return group;
  }

  /**
   * Create a user group (admin/owner only — enforced at route level).
   */
  async createGroup(data, userId, workspaceId) {
    if (!data.name?.trim()) {
      throw new ValidationError('Group name is required');
    }
    if (!data.handle?.trim()) {
      throw new ValidationError('Group handle is required');
    }

    const handle = data.handle.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

    const group = await directoriesRepository.createUserGroup({
      workspaceId,
      name: data.name.trim(),
      handle,
      description: data.description?.trim() || '',
      members: data.members || [],
      createdBy: userId,
    });

    logger.info('User group created', { groupId: group._id, workspaceId });
    return group;
  }

  /**
   * Update a user group.
   */
  async updateGroup(groupId, data, workspaceId) {
    const updates = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.handle !== undefined) updates.handle = data.handle.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (data.description !== undefined) updates.description = data.description.trim();
    if (data.members !== undefined) updates.members = data.members;

    const group = await directoriesRepository.updateUserGroup(groupId, workspaceId, updates);
    if (!group) throw new NotFoundError('User group not found');
    return group;
  }

  /**
   * Delete (soft) a user group.
   */
  async deleteGroup(groupId, workspaceId) {
    const group = await directoriesRepository.deleteUserGroup(groupId, workspaceId);
    if (!group) throw new NotFoundError('User group not found');
    logger.info('User group deleted', { groupId, workspaceId });
    return group;
  }

  /**
   * External/guest users.
   */
  async getExternalUsers(workspaceId, params) {
    return directoriesRepository.getExternalUsers(workspaceId, params);
  }

  /**
   * Workspace invitations.
   */
  async getInvitations(workspaceId) {
    return directoriesRepository.getInvitations(workspaceId);
  }
}

export default new DirectoriesService();
