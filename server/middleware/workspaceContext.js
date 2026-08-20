import Workspace from '../modules/workspaces/Workspace.model.js';
import WorkspaceMembership from '../modules/workspaces/WorkspaceMembership.model.js';
import { WORKSPACE_ROLES } from '../config/constants.js';
import { BadRequestError } from './errorHandler.js';

/**
 * resolveWorkspace — extracts workspace from header and attaches to req.
 *
 * Resolution:
 *   x-workspace-id header (workspace switching / API calls)
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
    const workspaceId = req.headers['x-workspace-id'];

    if (!workspaceId) {
      console.error('[resolveWorkspace] 400: Workspace context is required. Headers:', req.headers);
      return res.status(400).json({
        success: false,
        message: 'Workspace context is required. Provide x-workspace-id header.',
      });
    }

    // Validate ObjectId format to prevent injection
    if (!/^[0-9a-fA-F]{24}$/.test(workspaceId)) {
      console.error(`[resolveWorkspace] 400: Invalid workspace ID format: "${workspaceId}"`);
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
 * injectWorkspaceFilter — utility to add workspaceId to any query filter object.
 * Used as a helper in repositories.
 *
 * Fails closed: throws rather than silently returning an unscoped
 * cross-workspace filter. This used to `return filter` unchanged when
 * workspaceId was falsy — every current caller always has a real
 * workspaceId by the time it reaches here (resolveWorkspace/webhook
 * resolution already guarantee it upstream), so this never changes
 * behavior for a working call site. It only removes the landmine: any
 * future/misordered caller that forgets to pass workspaceId no longer
 * silently queries every tenant's data for a shared value (e.g. the
 * `#announcements` slug, which multiple workspaces reuse) — it now fails
 * loudly instead, matching injectWorkspaceFilterRequired below.
 *
 * @param {Object} filter     Existing query filter
 * @param {string} workspaceId  The workspace ObjectId string
 * @returns {Object}          Filter with workspaceId injected
 */
export const injectWorkspaceFilter = (filter, workspaceId) => {
  if (!workspaceId) {
    throw new BadRequestError('workspaceId is required for this query — refusing to run it unscoped across workspaces.');
  }
  return { ...filter, workspaceId };
};

/**
 * injectWorkspaceFilterRequired — utility to enforce workspace scope.
 * Throws if workspaceId is missing.
 *
 * @param {Object} filter
 * @param {string} workspaceId
 * @param {string} [context='query']
 * @returns {Object}
 */
export const injectWorkspaceFilterRequired = (filter, workspaceId, context = 'query') => {
  if (!workspaceId) {
    throw new BadRequestError(`workspaceId is required for ${context}`);
  }
  return { ...filter, workspaceId };
};
