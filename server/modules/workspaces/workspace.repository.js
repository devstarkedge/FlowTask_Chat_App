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
    return Workspace.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
  }

  async deactivate(id) {
    return Workspace.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }

  // ─── Membership ──────────────────────────────────────────────────────

  async getUserWorkspaces(userId) {
    return WorkspaceMembership.findUserWorkspaces(userId);
  }

  async getWorkspaceMembers(workspaceId, options = {}) {
    return WorkspaceMembership.findWorkspaceMembers(workspaceId, options);
  }

  async isMember(workspaceId, userId) {
    return WorkspaceMembership.isMember(workspaceId, userId);
  }

  async getUserRole(workspaceId, userId) {
    return WorkspaceMembership.getUserRole(workspaceId, userId);
  }

  async addMember(workspaceId, userId, role, invitedBy = null) {
    return WorkspaceMembership.addMember(workspaceId, userId, role, invitedBy);
  }

  async removeMember(workspaceId, userId) {
    return WorkspaceMembership.removeMember(workspaceId, userId);
  }

  async updateMemberRole(workspaceId, userId, newRole) {
    return WorkspaceMembership.findOneAndUpdate(
      { workspaceId, userId, isActive: true },
      { role: newRole },
      { new: true },
    );
  }

  async countMembers(workspaceId) {
    return WorkspaceMembership.countMembers(workspaceId);
  }

  async getMembership(workspaceId, userId) {
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
