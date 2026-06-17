import Canvas from "./canvas.model.js";
import ChannelMember from "../channels/ChannelMember.model.js";
import WorkspaceMembership from "../workspaces/WorkspaceMembership.model.js";
import { ForbiddenError, NotFoundError } from "../../middleware/errorHandler.js";

/**
 * checkCanvasAccess — verifies the authenticated user can access the canvas.
 * Attaches `req.canvasRole` ("owner" | "editor" | "viewer") and `req.canvasDoc`.
 *
 * Resolution order:
 *   1. Owner — canvas.createdBy === userId
 *   2. Explicit per-user permission (permissions.users[])
 *   3. accessLevel-based access:
 *      - "invite_only": only owner + explicitly added users
 *      - "view": channel members can view (viewer role)
 *      - "edit": channel members can edit (editor role)
 *   4. Legacy visibility-based access
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
    const userIdStr = userId.toString();

    // 1. Owner check — full access
    if (canvas.createdBy && canvas.createdBy.toString() === userIdStr) {
      req.canvasRole = "owner";
      return next();
    }

    // 2. Explicit per-user permission check (permissions.users[])
    const permUsers = canvas.permissions?.users || [];
    const userEntry = permUsers.find((u) => {
      if (!u.userId) return false;
      const uid = typeof u.userId === "object" ? (u.userId._id?.toString() || u.userId.toString()) : u.userId.toString();
      return uid === userIdStr;
    });

    if (userEntry) {
      req.canvasRole = userEntry.role === "editor" ? "editor" : "viewer";
      return next();
    }

    // 3. Backward compat: legacy allowedUserIds (treated as viewer)
    const legacyIds = canvas.permissions?.allowedUserIds || [];
    if (legacyIds.some((id) => id.toString() === userIdStr)) {
      req.canvasRole = "viewer";
      return next();
    }

    // 4. Access level based access
    const accessLevel = canvas.permissions?.accessLevel || "view";

    // invite_only: only owner + explicitly added users (already checked above)
    if (accessLevel === "invite_only") {
      return next(new ForbiddenError("You do not have access to this canvas. Only invited users can access it."));
    }

    // Check channel membership for view/edit access levels
    const isChannelMember = await ChannelMember.isMember(canvas.channelId, userId);

    if (accessLevel === "edit" && isChannelMember) {
      // Channel members can edit
      req.canvasRole = "editor";
      return next();
    }

    if (accessLevel === "view" && isChannelMember) {
      // Channel members can view
      req.canvasRole = "viewer";
      return next();
    }

    // 5. Fallback: Check legacy visibility-based access
    const visibility = canvas.permissions?.visibility || "channel";

    if (visibility === "workspace") {
      const membership = await WorkspaceMembership.findOne({
        userId,
        workspaceId: req.workspaceId,
        isActive: true,
      }).lean();
      if (membership) {
        req.canvasRole = "viewer";
        return next();
      }
    }

    if (visibility === "channel" || visibility === "workspace") {
      const isMember = await ChannelMember.isMember(canvas.channelId, userId);
      if (isMember && !isChannelMember) {
        req.canvasRole = "viewer";
        return next();
      }
    }

    // No access
    return next(new ForbiddenError("You do not have access to this canvas"));
  } catch (error) {
    next(error);
  }
}

/**
 * requireCanvasRole — ensures req.canvasRole is one of the allowed roles.
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
