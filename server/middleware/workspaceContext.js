import Workspace from '../modules/workspaces/Workspace.model.js';
import WorkspaceMembership from '../modules/workspaces/WorkspaceMembership.model.js';
import { WORKSPACE_ROLES } from '../config/constants.js';
import env from '../config/environment.js';

/**
 * resolveWorkspace — extracts workspace from JWT or header and attaches to req.
 *
 * Resolution order:
 *   1. req.user.workspaceId (set by auth middleware from JWT claim)
 *   2. x-workspace-id header (for API clients / workspace switching)
 *
 * Sets:
 *   req.workspaceId  — ObjectId string
 *   req.workspace    — lean workspace document
 *   req.membership   — user's WorkspaceMembership in this workspace
 *
 * Called AFTER protect() middleware so req.user is available.
 */
export const resolveWorkspace = async (req, res, next) => {
  try {
    const workspaceId =
      req.user?.workspaceId ||
      req.headers['x-workspace-id'];

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        message: 'Workspace context is required. Provide workspaceId in token or x-workspace-id header.',
      });
    }

    // Validate ObjectId format to prevent injection
    if (!/^[0-9a-fA-F]{24}$/.test(workspaceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid workspace ID format.',
      });
    }

    // Validate workspace exists and is active
    const workspace = await Workspace.findById(workspaceId).lean();
    if (!workspace || !workspace.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Workspace not found or inactive.',
      });
    }

    // Verify user is a member of this workspace
    const membership = await WorkspaceMembership.findOne({
      userId: req.user._id,
      workspaceId,
      isActive: true,
    }).lean();

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this workspace.',
      });
    }

    req.workspaceId = workspaceId.toString();
    req.workspace = workspace;
    req.membership = membership;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * requireWorkspaceRole — checks that the user's workspace role meets minimum level.
 *
 * Role hierarchy: owner > admin > member > guest
 *
 * @param  {...string} roles  Allowed roles
 * @returns {Function}        Express middleware
 */
export const requireWorkspaceRole = (...roles) => {
  return (req, res, next) => {
    if (!req.membership) {
      return res.status(403).json({
        success: false,
        message: 'Workspace membership required.',
      });
    }

    if (!roles.includes(req.membership.role)) {
      return res.status(403).json({
        success: false,
        message: `Requires one of: ${roles.join(', ')}. Your role: ${req.membership.role}`,
      });
    }

    next();
  };
};

/**
 * resolveDefaultWorkspace — for FlowTask-authenticated requests, auto-resolve
 * to the default 'flowtask' workspace if no workspace header is present.
 *
 * Useful for webhook/FlowTask-originated requests that don't know about workspaces.
 */
export const resolveDefaultWorkspace = async (req, res, next) => {
  try {
    // If workspace already set, skip
    if (req.workspaceId || req.user?.workspaceId || req.headers['x-workspace-id']) {
      return next();
    }

    // Auto-resolve to default workspace
    const defaultWorkspace = await Workspace.findBySlug(env.DEFAULT_WORKSPACE_SLUG);
    if (defaultWorkspace) {
      req.workspaceId = defaultWorkspace._id.toString();
      req.workspace = defaultWorkspace;

      // If user is authenticated, check/create membership
      if (req.user) {
        let membership = await WorkspaceMembership.findOne({
          userId: req.user._id,
          workspaceId: defaultWorkspace._id,
          isActive: true,
        }).lean();

        if (!membership) {
          // Auto-join users to the default workspace
          membership = await WorkspaceMembership.addMember(
            req.user._id,
            defaultWorkspace._id,
            WORKSPACE_ROLES.MEMBER,
          );
          membership = membership.toObject();
        }

        req.membership = membership;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * injectWorkspaceFilter — utility to add workspaceId to any query filter object.
 * Used as a helper in repositories.
 *
 * @param {Object} filter     Existing query filter
 * @param {string} workspaceId  The workspace ObjectId string
 * @returns {Object}          Filter with workspaceId injected
 */
export const injectWorkspaceFilter = (filter, workspaceId) => {
  if (!workspaceId) return filter;
  return { ...filter, workspaceId };
};
