import ChannelMember from "../channels/ChannelMember.model.js";
import Channel from "../channels/Channel.model.js";
import WorkspaceMembership from "../workspaces/WorkspaceMembership.model.js";

/**
 * CanvasPermissionService — Centralized enterprise permission engine.
 *
 * Resolves canvas permissions from the full hierarchy:
 *   Workspace → Channel Visibility → Channel Membership → Canvas Settings → User Role
 *
 * This is the SINGLE SOURCE OF TRUTH for all canvas access decisions,
 * consumed by both frontend (via API) and backend middleware/service layer.
 */

class CanvasPermissionService {
  /**
   * Extract a user ID string from a field that may be a populated
   * object `{ _id, name, avatar }` or a plain ObjectId / string.
   */
  _extractUserId(field) {
    if (!field) return null;
    if (typeof field === "object" && field._id) return field._id.toString();
    return field.toString();
  }

  /**
   * Resolve full channel info including visibility and the
   * `allowAllMembersEditCanvas` toggle.
   */
  async _resolveChannel(channelId) {
    if (!channelId) return null;
    const channel = await Channel.findById(channelId).lean();
    return channel;
  }

  /**
   * Check if a user is a member of a channel.
   */
  async _isChannelMember(channelId, userId) {
    if (!channelId || !userId) return false;
    return ChannelMember.isMember(channelId, userId);
  }

  /**
   * Get the user's role in a channel (owner, admin, member, null).
   */
  async _getChannelRole(channelId, userId) {
    if (!channelId || !userId) return null;
    const role = await ChannelMember.getMemberRole(channelId, userId);
    return role;
  }

  /**
   * Check if a user is a workspace member.
   */
  async _isWorkspaceMember(workspaceId, userId) {
    if (!workspaceId || !userId) return false;
    const membership = await WorkspaceMembership.findOne({
      userId,
      workspaceId,
      isActive: true,
    }).lean();
    return !!membership;
  }

  /**
   * Check if user is workspace owner or admin.
   */
  async _isWorkspaceAdmin(workspaceId, userId) {
    if (!workspaceId || !userId) return false;
    const membership = await WorkspaceMembership.findOne({
      userId,
      workspaceId,
      isActive: true,
    }).select("role").lean();
    return membership?.role === "owner" || membership?.role === "admin";
  }

  /**
   * Check if user is the canvas owner.
   */
  _isCanvasOwner(canvas, userId) {
    if (!canvas || !userId) return false;
    const ownerId = this._extractUserId(canvas.createdBy);
    return ownerId === userId;
  }

  /**
   * Check if user has explicit editor permission on the canvas.
   */
  _hasExplicitEditorPermission(canvas, userId) {
    const users = canvas.permissions?.users || [];
    const userPerm = users.find((u) => {
      const uid = this._extractUserId(u.userId);
      return uid === userId;
    });
    return userPerm?.role === "editor";
  }

  /**
   * Check if user has explicit viewer permission on the canvas.
   */
  _hasExplicitViewerPermission(canvas, userId) {
    const users = canvas.permissions?.users || [];
    const userPerm = users.find((u) => {
      const uid = this._extractUserId(u.userId);
      return uid === userId;
    });
    if (userPerm?.role === "viewer") return true;

    // Legacy allowedUserIds
    const legacyIds = canvas.permissions?.allowedUserIds || [];
    return legacyIds.some((id) => this._extractUserId(id) === userId);
  }

  /**
   * Determine channel type: "public" or "private".
   * A channel is considered public if visibility is "public" or type is "public".
   */
  _isChannelPublic(channel) {
    if (!channel) return false;
    return (
      channel.visibility === "public" ||
      channel.type === "public" ||
      (!channel.visibility && channel.type !== "private" && channel.type !== "dm")
    );
  }

  /**
   * RESOLVE FULL PERMISSIONS — the main entry point.
   *
   * @param {Object}  params
   * @param {Object}  params.user         - The requesting user document (must have _id)
   * @param {Object}  [params.workspace]  - Workspace document (optional)
   * @param {string}  params.workspaceId  - Workspace ID
   * @param {Object}  [params.channel]    - Channel document (fetched if not provided)
   * @param {string}  params.channelId    - Channel ID
   * @param {Object}  params.canvas       - Canvas document
   * @returns {Promise<{
   *   canView: boolean,
   *   canEdit: boolean,
   *   canDelete: boolean,
   *   canComment: boolean,
   *   canShare: boolean,
   *   canManagePermissions: boolean,
   *   role: string|null,
   *   isViewOnly: boolean,
   * }>}
   */
  async getPermissions({ user, workspace, workspaceId, channel, channelId, canvas }) {
    // Default: no access
    const result = {
      canView: false,
      canEdit: false,
      canDelete: false,
      canComment: false,
      canShare: false,
      canManagePermissions: false,
      role: null,
      isViewOnly: true,
    };

    if (!user || !canvas) return result;

    const userId = this._extractUserId(user._id || user.id);
    if (!userId) return result;

    // Resolve channel if not provided
    const resolvedChannel = channel || (channelId ? await this._resolveChannel(channelId) : null);
    if (!resolvedChannel) {
      // Canvas without a channel - fall back to explicit permissions
      return this._resolveExplicitOnly(result, canvas, userId);
    }

    const channelIdStr = (resolvedChannel._id || resolvedChannel.id).toString();
    const isPublic = this._isChannelPublic(resolvedChannel);
    const isChannelMember = await this._isChannelMember(channelIdStr, userId);
    const channelRole = isChannelMember ? await this._getChannelRole(channelIdStr, userId) : null;
    const isCanvasOwner = this._isCanvasOwner(canvas, userId);
    const isWorkspaceAdmin = workspaceId ? await this._isWorkspaceAdmin(workspaceId, userId) : false;

    // ──── Visibility Check ──────────────────────────────────────────
    // Non-members cannot view/access canvas in either public or private channels
    if (!isChannelMember && !isCanvasOwner && !isWorkspaceAdmin) {
      // Check explicit share permissions for non-members
      if (this._hasExplicitEditorPermission(canvas, userId) || this._hasExplicitViewerPermission(canvas, userId)) {
        // Explicitly shared users get their assigned permissions
        const isEditor = this._hasExplicitEditorPermission(canvas, userId);
        result.canView = true;
        result.canEdit = isEditor;
        result.canComment = true;
        result.canShare = isEditor || isCanvasOwner;
        result.canManagePermissions = isCanvasOwner;
        result.role = isEditor ? "editor" : "viewer";
        result.isViewOnly = !isEditor;
        return result;
      }

      // Non-members with no explicit permissions get no access
      return result;
    }

    // ──── Canvas Owner ─────────────────────────────────────────────
    // Owner has full access regardless of all other settings
    if (isCanvasOwner) {
      result.canView = true;
      result.canEdit = true;
      result.canDelete = true;
      result.canComment = true;
      result.canShare = true;
      result.canManagePermissions = true;
      result.role = "owner";
      result.isViewOnly = false;
      return result;
    }

    // ──── Channel Admin / Owner ────────────────────────────────────
    // Channel owner or admin has full edit access
    if (channelRole === "owner" || channelRole === "admin") {
      result.canView = true;
      result.canEdit = true;
      result.canDelete = false; // Only canvas owner can delete
      result.canComment = true;
      result.canShare = true;
      result.canManagePermissions = true;
      result.role = "editor";
      result.isViewOnly = false;
      return result;
    }

    // ──── Public Channel ───────────────────────────────────────────
    // All members can edit in public channels
    if (isPublic && isChannelMember) {
      result.canView = true;
      result.canEdit = true;
      result.canComment = true;
      result.canShare = true;
      result.canDelete = false;
      result.canManagePermissions = false;
      result.role = "editor";
      result.isViewOnly = false;
      return result;
    }

    // ──── Private Channel ──────────────────────────────────────────
    if (!isPublic && isChannelMember) {
      // Check if channel has the "Allow Members To Edit Canvas" toggle
      const allowEdit = resolvedChannel.allowAllMembersEditCanvas !== false; // default to true

      if (allowEdit) {
        // Toggle ON: all members can edit
        result.canView = true;
        result.canEdit = true;
        result.canComment = true;
        result.canShare = true;
        result.canDelete = false;
        result.canManagePermissions = false;
        result.role = "editor";
        result.isViewOnly = false;
        return result;
      }

      // Toggle OFF: members can view but cannot edit
      result.canView = true;
      result.canEdit = false;
      result.canComment = true; // can still comment
      result.canShare = false;
      result.canDelete = false;
      result.canManagePermissions = false;
      result.role = "viewer";
      result.isViewOnly = true;
      return result;
    }

    return result;
  }

  /**
   * Fallback resolver for canvases without a channel (explicit permissions only).
   */
  async _resolveExplicitOnly(result, canvas, userId) {
    const isCanvasOwner = this._isCanvasOwner(canvas, userId);
    if (isCanvasOwner) {
      result.canView = true;
      result.canEdit = true;
      result.canDelete = true;
      result.canComment = true;
      result.canShare = true;
      result.canManagePermissions = true;
      result.role = "owner";
      result.isViewOnly = false;
      return result;
    }

    if (this._hasExplicitEditorPermission(canvas, userId)) {
      result.canView = true;
      result.canEdit = true;
      result.canComment = true;
      result.canShare = true;
      result.canManagePermissions = false;
      result.role = "editor";
      result.isViewOnly = false;
      return result;
    }

    if (this._hasExplicitViewerPermission(canvas, userId)) {
      result.canView = true;
      result.canEdit = false;
      result.canComment = true;
      result.canShare = false;
      result.canManagePermissions = false;
      result.role = "viewer";
      result.isViewOnly = true;
      return result;
    }

    return result;
  }

  /**
   * Synchronous version for when channel data is already available.
   * Does NOT fetch from DB - relies on pre-loaded channel data.
   */
  getPermissionsSync({ user, channel, canvas, isChannelMember, channelRole }) {
    const result = {
      canView: false,
      canEdit: false,
      canDelete: false,
      canComment: false,
      canShare: false,
      canManagePermissions: false,
      role: null,
      isViewOnly: true,
    };

    if (!user || !canvas) return result;

    const userId = this._extractUserId(user._id || user.id);
    if (!userId) return result;

    if (!channel) {
      return this._resolveExplicitOnlySync(result, canvas, userId);
    }

    const isPublic = this._isChannelPublic(channel);
    const isCanvasOwner = this._isCanvasOwner(canvas, userId);

    // Owner
    if (isCanvasOwner) {
      result.canView = true;
      result.canEdit = true;
      result.canDelete = true;
      result.canComment = true;
      result.canShare = true;
      result.canManagePermissions = true;
      result.role = "owner";
      result.isViewOnly = false;
      return result;
    }

    // Non-member
    if (!isChannelMember) {
      if (this._hasExplicitEditorPermission(canvas, userId) || this._hasExplicitViewerPermission(canvas, userId)) {
        const isEditor = this._hasExplicitEditorPermission(canvas, userId);
        result.canView = true;
        result.canEdit = isEditor;
        result.canComment = true;
        result.canShare = isEditor;
        result.role = isEditor ? "editor" : "viewer";
        result.isViewOnly = !isEditor;
        return result;
      }
      return result;
    }

    // Channel admin/owner
    if (channelRole === "owner" || channelRole === "admin") {
      result.canView = true;
      result.canEdit = true;
      result.canComment = true;
      result.canShare = true;
      result.canManagePermissions = true;
      result.role = "editor";
      result.isViewOnly = false;
      return result;
    }

    // Public channel
    if (isPublic) {
      result.canView = true;
      result.canEdit = true;
      result.canComment = true;
      result.canShare = true;
      result.role = "editor";
      result.isViewOnly = false;
      return result;
    }

    // Private channel
    const allowEdit = channel.allowAllMembersEditCanvas !== false;
    if (allowEdit) {
      result.canView = true;
      result.canEdit = true;
      result.canComment = true;
      result.canShare = true;
      result.role = "editor";
      result.isViewOnly = false;
      return result;
    }

    // Private channel with editing disabled
    result.canView = true;
    result.canEdit = false;
    result.canComment = true;
    result.role = "viewer";
    result.isViewOnly = true;
    return result;
  }

  _resolveExplicitOnlySync(result, canvas, userId) {
    const isCanvasOwner = this._isCanvasOwner(canvas, userId);
    if (isCanvasOwner) {
      result.canView = true;
      result.canEdit = true;
      result.canDelete = true;
      result.canComment = true;
      result.canShare = true;
      result.canManagePermissions = true;
      result.role = "owner";
      result.isViewOnly = false;
      return result;
    }
    if (this._hasExplicitEditorPermission(canvas, userId)) {
      result.canView = true;
      result.canEdit = true;
      result.canComment = true;
      result.canShare = true;
      result.role = "editor";
      result.isViewOnly = false;
      return result;
    }
    if (this._hasExplicitViewerPermission(canvas, userId)) {
      result.canView = true;
      result.canEdit = false;
      result.canComment = true;
      result.role = "viewer";
      result.isViewOnly = true;
      return result;
    }
    return result;
  }
}

export default new CanvasPermissionService();