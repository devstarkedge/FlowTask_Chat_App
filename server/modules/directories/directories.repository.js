import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import ChatUser from '../users/ChatUser.model.js';
import Channel from '../channels/Channel.model.js';
import ChannelMember from '../channels/ChannelMember.model.js';
import UserGroup from './UserGroup.model.js';
import WorkspaceInvite from '../workspaces/WorkspaceInvite.model.js';
import { injectWorkspaceFilter } from '../../middleware/workspaceContext.js';

class DirectoriesRepository {
  /**
   * Get workspace users (People tab).
   * Joins WorkspaceMembership + ChatUser for the given workspace.
   */
  async getWorkspaceUsers(workspaceId, { search, title, location, sort = 'recommended', page = 1, limit = 50 } = {}) {
    const filter = { workspaceId, isActive: true };
    const skip = (page - 1) * limit;

    let sortOption;
    switch (sort) {
      case 'az': sortOption = { 'userId.name': 1 }; break;
      case 'za': sortOption = { 'userId.name': -1 }; break;
      default: sortOption = { role: 1, joinedAt: 1 };
    }

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'chatusers',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      { $match: { 'user.isActive': true } },
    ];

    // Search filter
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      pipeline.push({ $match: { $or: [{ 'user.name': regex }, { 'user.email': regex }] } });
    }

    // Title filter
    if (title) {
      const regex = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      pipeline.push({ $match: { 'user.role': regex } });
    }

    // Sort
    const mongoSort = sort === 'az' ? { 'user.name': 1 }
      : sort === 'za' ? { 'user.name': -1 }
      : { role: 1, joinedAt: 1 };
    pipeline.push({ $sort: mongoSort });

    // Count total
    const countPipeline = [...pipeline, { $count: 'total' }];
    const [countResult] = await WorkspaceMembership.aggregate(countPipeline);
    const total = countResult?.total || 0;

    // Paginate
    pipeline.push({ $skip: skip }, { $limit: limit });

    // Project
    pipeline.push({
      $project: {
        _id: '$user._id',
        name: '$user.name',
        email: '$user.email',
        avatar: '$user.avatar',
        role: '$user.role',
        onlineStatus: '$user.onlineStatus',
        customStatus: '$user.customStatus',
        workspaceRole: '$role',
        joinedAt: '$joinedAt',
      },
    });

    const users = await WorkspaceMembership.aggregate(pipeline);
    // Also include FlowTask-upserted ChatUser accounts (authProvider='flowtask')
    // that may not yet have a WorkspaceMembership. This helps show FlowTask
    // users in the Directories panel even when they haven't been explicitly
    // added as members yet (they may have been synced earlier by a background
    // job or DM contacts flow).
    try {
      const ftFilter = { authProvider: 'flowtask', isActive: true };
      if (search) {
        const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        ftFilter.$or = [{ name: regex }, { email: regex }];
      }
      const flowUsers = await ChatUser.find(ftFilter)
        .select('name email avatar role onlineStatus customStatus')
        .lean();

      const existingIds = new Set(users.map((u) => u._id.toString()));
      for (const fu of flowUsers) {
        if (!existingIds.has(fu._id.toString())) {
          users.push({
            _id: fu._id,
            name: fu.name,
            email: fu.email,
            avatar: fu.avatar,
            role: fu.role,
            onlineStatus: fu.onlineStatus,
            customStatus: fu.customStatus,
            workspaceRole: null,
            joinedAt: null,
          });
        }
      }
    } catch (err) {
      // Non-fatal — log and continue returning membership-based users
      // (logger not imported here to avoid cycles; caller may log)
    }

    return { users, total, page, limit };
  }

  /**
   * Get workspace channels (Channels tab).
   * All non-DM channels in the workspace (including ones user hasn't joined).
   */
  async getWorkspaceChannels(workspaceId, { search, type, sort = 'recommended', page = 1, limit = 50 } = {}) {
    const filter = injectWorkspaceFilter({
      isArchived: false,
      type: { $ne: 'dm' },
    }, workspaceId);

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { description: regex }];
    }

    if (type && type !== 'all') {
      if (type === 'public') {
        filter.visibility = 'public';
      } else if (type === 'private') {
        filter.visibility = 'private';
      } else {
        filter.type = type;
      }
    }

    const sortOption = sort === 'az' ? { name: 1 }
      : sort === 'za' ? { name: -1 }
      : { memberCount: -1, lastMessageAt: -1 };

    const total = await Channel.countDocuments(filter);
    const skip = (page - 1) * limit;

    const channels = await Channel.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .select('name slug type visibility description memberCount lastMessageAt createdBy')
      .lean();

    return { channels, total, page, limit };
  }

  /**
   * Get user groups (User Groups tab).
   */
  async getUserGroups(workspaceId, { search, sort = 'az' } = {}) {
    return UserGroup.findByWorkspace(workspaceId, { search, sort: sort === 'az' ? 'name' : 'createdAt' });
  }

  /**
   * Get single user group with populated members.
   */
  async getUserGroupById(groupId) {
    return UserGroup.findByIdWithMembers(groupId);
  }

  /**
   * Create a new user group.
   */
  async createUserGroup(data) {
    const group = new UserGroup(data);
    return group.save();
  }

  /**
   * Update a user group.
   */
  async updateUserGroup(groupId, workspaceId, updates) {
    return UserGroup.findOneAndUpdate(
      { _id: groupId, workspaceId, isActive: true },
      { $set: updates },
      { new: true },
    );
  }

  /**
   * Soft-delete a user group.
   */
  async deleteUserGroup(groupId, workspaceId) {
    return UserGroup.findOneAndUpdate(
      { _id: groupId, workspaceId, isActive: true },
      { $set: { isActive: false } },
      { new: true },
    );
  }

  /**
   * Get external/guest users in the workspace.
   */
  async getExternalUsers(workspaceId, { search, status } = {}) {
    const filter = { workspaceId, role: 'guest' };

    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'pending') {
      filter.isActive = false;
    } else {
      // Show all (both active and inactive guests)
    }

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'chatusers',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
    ];

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      pipeline.push({ $match: { $or: [{ 'user.name': regex }, { 'user.email': regex }] } });
    }

    // Lookup the inviter
    pipeline.push(
      {
        $lookup: {
          from: 'chatusers',
          localField: 'invitedBy',
          foreignField: '_id',
          as: 'inviter',
        },
      },
      { $unwind: { path: '$inviter', preserveNullAndEmptyArrays: true } },
    );

    pipeline.push({
      $project: {
        _id: '$user._id',
        membershipId: '$_id',
        name: '$user.name',
        email: '$user.email',
        avatar: '$user.avatar',
        status: { $cond: [{ $eq: ['$isActive', true] }, 'active', 'pending'] },
        invitedBy: {
          name: { $ifNull: ['$inviter.name', null] },
          avatar: { $ifNull: ['$inviter.avatar', null] },
        },
        joinedAt: '$joinedAt',
      },
    });

    pipeline.push({ $sort: { joinedAt: -1 } });

    return WorkspaceMembership.aggregate(pipeline);
  }

  /**
   * Get workspace invitations (invitations tab).
   */
  async getInvitations(workspaceId) {
    return WorkspaceInvite.find({ workspaceId })
      .sort({ createdAt: -1 })
      .populate('invitedBy', 'name email avatar')
      .lean();
  }

  /**
   * Get channel IDs the user has joined (for annotating isJoined).
   */
  async getUserChannelIds(userId, workspaceId) {
    const ids = await ChannelMember.getChannelIdsForUser(userId, workspaceId);
    return new Set(ids.map(String));
  }
}

export default new DirectoriesRepository();
