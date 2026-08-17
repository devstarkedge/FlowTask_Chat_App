import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import ChatUser from '../users/ChatUser.model.js';
import Channel from '../channels/Channel.model.js';
import ChannelMember from '../channels/ChannelMember.model.js';
import UserGroup from './UserGroup.model.js';
import WorkspaceInvite from '../workspaces/WorkspaceInvite.model.js';
import { injectWorkspaceFilter } from '../../middleware/workspaceContext.js';
import mongoose from 'mongoose';

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

    // ─── Include pending guest invites ──────────────────────────────────────
    // Guest invites that haven't been accepted yet should appear in the directory
    // with isPendingInvite=true so the UI can show a "Pending Invitation" badge.
    try {
      const inviteFilter = {
        workspaceId,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      };
      if (search) {
        const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        inviteFilter.email = regex;
      }
      const pendingInvites = await WorkspaceInvite.find(inviteFilter)
        .populate('invitedBy', 'name avatar')
        .sort({ createdAt: -1 })
        .lean();

      const existingEmails = new Set(users.map((u) => (u.email || '').toLowerCase()));
      for (const inv of pendingInvites) {
        // Don't duplicate if user already accepted and appears in member list
        if (existingEmails.has(inv.email)) continue;
        users.push({
          _id: inv._id,
          name: inv.email.split('@')[0],
          email: inv.email,
          avatar: null,
          role: inv.inviteType === 'guest' ? 'guest' : (inv.role || 'member'),
          onlineStatus: 'offline',
          customStatus: null,
          workspaceRole: inv.inviteType === 'guest' ? 'guest' : (inv.role || 'member'),
          joinedAt: null,
          isPendingInvite: true,
          inviteId: inv._id,
          invitedBy: inv.invitedBy ? { name: inv.invitedBy.name, avatar: inv.invitedBy.avatar } : null,
          expiresAt: inv.expiresAt,
        });
      }
    } catch (err) {
      // Non-fatal — continue without pending invites
    }

    // Treat accepted guest invites as guests even if membership.role is member
    try {
      const { userIds, emails } = await WorkspaceInvite.getAcceptedGuestIdentities(workspaceId);
      if (userIds.size || emails.size) {
        for (const u of users) {
          if (u.workspaceRole === 'guest' || u.workspaceRole === 'owner' || u.workspaceRole === 'admin') continue;
          const id = u._id?.toString();
          const email = (u.email || '').toLowerCase();
          if ((id && userIds.has(id)) || (email && emails.has(email))) {
            u.workspaceRole = 'guest';
          }
        }
      }
    } catch {
      // Non-fatal
    }

    return { users, total: users.length, page, limit };
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
      { returnDocument: 'after' },
    );
  }

  /**
   * Soft-delete a user group.
   */
  async deleteUserGroup(groupId, workspaceId) {
    return UserGroup.findOneAndUpdate(
      { _id: groupId, workspaceId, isActive: true },
      { $set: { isActive: false } },
      { returnDocument: 'after' },
    );
  }

  /**
   * Get external/guest users in the workspace.
   *
   * A user is a guest if any of:
   *   - WorkspaceMembership.role === 'guest'
   *   - they accepted an invite with inviteType 'guest' or role 'guest'
   *   - they have a pending invite with inviteType 'guest' or role 'guest'
   *
   * Uses find()+populate (not aggregate) so Mongoose casts workspaceId/userId.
   */
  async getExternalUsers(workspaceId, { search, status, page = 1, limit = 50 } = {}) {
    const skip = (page - 1) * limit;
    const searchRegex = search
      ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : null;

    const { userIds: acceptedGuestIds, emails: acceptedGuestEmails } =
      await WorkspaceInvite.getAcceptedGuestIdentities(workspaceId);

    if (acceptedGuestEmails.size) {
      const extraUsers = await ChatUser.find({
        email: { $in: [...acceptedGuestEmails] },
      }).select('_id').lean();
      for (const u of extraUsers) acceptedGuestIds.add(String(u._id));
    }

    const membershipOr = [{ role: 'guest' }];
    if (acceptedGuestIds.size) {
      const guestObjectIds = [...acceptedGuestIds]
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      if (guestObjectIds.length) {
        membershipOr.push({
          userId: { $in: guestObjectIds },
          role: { $nin: ['owner', 'admin'] },
        });
      }
    }

    const membershipFilter = { workspaceId, $or: membershipOr };
    if (status === 'active') {
      membershipFilter.isActive = true;
    } else if (status === 'pending') {
      membershipFilter.isActive = false;
    }

    const memberships = await WorkspaceMembership.find(membershipFilter)
      .populate('userId', 'name email avatar')
      .populate('invitedBy', 'name avatar')
      .lean();

    const activeGuests = [];
    for (const m of memberships) {
      const user = m.userId;
      if (!user || typeof user !== 'object' || (!user.email && !user.name)) continue;
      if (searchRegex) {
        const name = user.name || '';
        const email = user.email || '';
        if (!searchRegex.test(name) && !searchRegex.test(email)) continue;
      }
      activeGuests.push({
        _id: user._id,
        membershipId: m._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: 'guest',
        workspaceRole: 'guest',
        status: m.isActive ? 'active' : 'pending',
        invitedBy: m.invitedBy
          ? { name: m.invitedBy.name, avatar: m.invitedBy.avatar }
          : null,
        joinedAt: m.joinedAt,
        isPendingInvite: false,
      });
    }

    let allGuests = [...activeGuests];

    // Include pending guest invites if not specifically filtering for active
    if (status !== 'active') {
      const inviteFilter = {
        workspaceId,
        status: 'pending',
        expiresAt: { $gt: new Date() },
        $or: [{ inviteType: 'guest' }, { role: 'guest' }],
      };

      if (searchRegex) {
        inviteFilter.email = searchRegex;
      }

      const pendingInvites = await WorkspaceInvite.find(inviteFilter)
        .populate('invitedBy', 'name avatar')
        .sort({ createdAt: -1 })
        .lean();

      const existingEmails = new Set(activeGuests.map((g) => (g.email || '').toLowerCase()));

      for (const inv of pendingInvites) {
        const email = (inv.email || '').toLowerCase();
        if (!email || existingEmails.has(email)) continue;
        allGuests.push({
          _id: inv._id,
          membershipId: null,
          name: email.split('@')[0],
          email: inv.email,
          avatar: null,
          role: 'guest',
          workspaceRole: 'guest',
          status: 'pending',
          invitedBy: inv.invitedBy ? { name: inv.invitedBy.name, avatar: inv.invitedBy.avatar } : null,
          joinedAt: inv.createdAt,
          isPendingInvite: true,
          inviteId: inv._id,
          expiresAt: inv.expiresAt,
        });
      }
    }

    // Sort by joinedAt descending
    allGuests.sort((a, b) => {
      const dateA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
      const dateB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
      return dateB - dateA;
    });

    const total = allGuests.length;
    const paginatedGuests = allGuests.slice(skip, skip + limit);

    // Fetch "own workspace" for paginated active guests
    const guestUserIds = paginatedGuests
      .filter((g) => g._id && !g.isPendingInvite)
      .map((g) => g._id);

    if (guestUserIds.length > 0) {
      const ownWorkspaces = await WorkspaceMembership.find({
        userId: { $in: guestUserIds },
        role: 'owner',
      })
        .populate('workspaceId', 'name')
        .lean();

      const ownWorkspaceMap = {};
      for (const ow of ownWorkspaces) {
        if (ow.workspaceId && ow.workspaceId.name) {
          ownWorkspaceMap[ow.userId.toString()] = ow.workspaceId.name;
        }
      }

      for (const g of paginatedGuests) {
        if (g._id && ownWorkspaceMap[g._id.toString()]) {
          g.ownWorkspaceName = ownWorkspaceMap[g._id.toString()];
        }
      }
    }

    return {
      users: paginatedGuests,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    };
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
