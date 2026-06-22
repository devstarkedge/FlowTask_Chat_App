import Canvas from "./canvas.model.js";
import Channel from "../channels/Channel.model.js";
import CanvasPermissionService from "./canvasPermission.service.js";
import { ForbiddenError, NotFoundError } from "../../middleware/errorHandler.js";

/**
 * checkCanvasAccess — verifies the authenticated user can access the canvas
 * using the centralized CanvasPermissionService.
 *
 * Attaches `req.canvasPermissions` (full permission object) and `req.canvasDoc`.
 *
 * This is the SINGLE entry point; ALL route-level permission decisions
 * are delegated to CanvasPermissionService.
 */
export async function checkCanvasAccess(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) return next(new ForbiddenError("Authentication required"));

    // Extract canvasId from params (supports both :canvasId and nested routes)
    const canvasId = req.params.canvasId;
    if (!canvasId) return next();

    const canvas = await Canvas.findOne({ _id: canvasId, workspaceId: req.workspaceId }).lean();
    if (!canvas) return next(new NotFoundError("Canvas not found"));

    req.canvasDoc = canvas;

    // Resolve channel for permission context
    let channel = null;
    if (canvas.channelId) {
      channel = await Channel.findById(canvas.channelId).lean();
    }

    // Delegate to the centralized permission service
    const permissions = await CanvasPermissionService.getPermissions({
      user: req.user,
      workspaceId: req.workspaceId,
      channel,
      channelId: canvas.channelId,
      canvas,
    });

    // Attach permission result to request for downstream use
    req.canvasPermissions = permissions;
    req.canvasRole = permissions.role;

    // If user cannot view, deny access
    if (!permissions.canView) {
      return next(new ForbiddenError("You do not have access to this canvas"));
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * requireCanvasRole — ensures the user's resolved role is one of the allowed roles.
 * Must be used AFTER checkCanvasAccess.
 */
export function requireCanvasRole(...roles) {
  return (req, res, next) => {
    if (!req.canvasRole) {
      return next(new ForbiddenError("Canvas access not determined"));
    }
    if (!roles.includes(req.canvasRole)) {
      return next(
        new ForbiddenError(
          `Requires ${roles.join(" or ")} access. Your role: ${req.canvasRole}`
        )
      );
    }
    next();
  };
}

/**
 * requireCanvasPermission — fine-grained permission check based on the
 * full permission object (canView, canEdit, canDelete, etc.).
 * Must be used AFTER checkCanvasAccess.
 */
export function requireCanvasPermission(permissionName) {
  return (req, res, next) => {
    if (!req.canvasPermissions) {
      return next(new ForbiddenError("Canvas permissions not resolved"));
    }
    if (!req.canvasPermissions[permissionName]) {
      return next(
        new ForbiddenError(`You do not have "${permissionName}" permission for this canvas`)
      );
    }
    next();
  };
}
