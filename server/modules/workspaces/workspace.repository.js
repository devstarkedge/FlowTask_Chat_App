import Workspace from './Workspace.model.js';
import WorkspaceMembership from './WorkspaceMembership.model.js';
import logger from '../../utils/logger.js';

/**
 * Workspace Repository — data-access layer for workspace operations.
 */

class WorkspaceRepository {
  // ─── CRUD ────────────────────────────────────────────────────────────

  async create(data) {
    return Workspace.create(data);
  }

  async findById(id) {
    return Workspace.findById(id);
  }

  async findBySlug(slug) {
    return Workspace.findBySlug(slug);
  }

  async findByInviteCode(code) {
    return Workspace.findByInviteCode(code);
  }

  async findByOwner(ownerId) {
    return Workspace.find({ owner: ownerId, isActive: true }).sort({ name: 1 }).lean();
  }

  async update(id, updateData) {
    return Workspace.findByIdAndUpdate(id, updateData, { returnDocument: 'after', runValidators: true });
  }

  async deactivate(id) {
    return Workspace.findByIdAndUpdate(id, { isActive: false }, { returnDocument: 'after' });
  }

  // ─── Membership ──────────────────────────────────────────────────────
  // NOTE: Model statics use signature (userId, workspaceId).
  // Repository methods also use (userId, workspaceId) to match.

  async getUserWorkspaces(userId) {
    return WorkspaceMembership.findUserWorkspaces(userId);
  }

  async getWorkspaceMembers(workspaceId, options = {}) {
    return WorkspaceMembership.findWorkspaceMembers(workspaceId, options);
  }

  async isMember(userId, workspaceId) {
    return WorkspaceMembership.isMember(userId, workspaceId);
  }

  async getUserRole(userId, workspaceId) {
    return WorkspaceMembership.getUserRole(userId, workspaceId);
  }

  async addMember(userId, workspaceId, role, invitedBy = null) {
    return WorkspaceMembership.addMember(userId, workspaceId, role, invitedBy);
  }

  async removeMember(userId, workspaceId) {
    return WorkspaceMembership.removeMember(userId, workspaceId);
  }

  async updateMemberRole(userId, workspaceId, newRole) {
    return WorkspaceMembership.findOneAndUpdate(
      { workspaceId, userId, isActive: true },
      { role: newRole },
      { returnDocument: 'after' },
    );
  }

  async countMembers(workspaceId) {
    return WorkspaceMembership.countMembers(workspaceId);
  }

  async getMembership(userId, workspaceId) {
    return WorkspaceMembership.findOne({
      workspaceId,
      userId,
      isActive: true,
    });
  }

  // ─── Search & List ───────────────────────────────────────────────────
  async findFlowTaskWorkspace() {
    return Workspace.findOne({
      'settings.flowtaskIntegration.enabled': true,
      isActive: true,
    }).lean();
  }
  async searchWorkspaces(query, limit = 20) {
    return Workspace.find({
      isActive: true,
      name: { $regex: query, $options: 'i' },
    })
      .select('name slug logo description memberCount plan')
      .limit(limit)
      .lean();
  }
}

export default new WorkspaceRepository();
