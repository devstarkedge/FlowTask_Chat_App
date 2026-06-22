import express from "express";
import canvasController from "./canvas.controller.js";
import { protect } from "../auth/auth.middleware.js";
import { resolveWorkspace } from "../../middleware/workspaceContext.js";
import { checkCanvasAccess, requireCanvasRole, requireCanvasPermission } from "./canvasPermission.middleware.js";

const router = express.Router();

// All canvas routes require authentication + workspace context
router.use(protect, resolveWorkspace);

// ── Permissions endpoint (returns resolved permissions for frontend) ─────
router.get(
  "/permissions/:canvasId",
  checkCanvasAccess,
  canvasController.getCanvasPermissions
);

// ── Read routes — viewer access allowed ─────────────────────────────────────
router.get(
  "/by-id/:canvasId",
  checkCanvasAccess,
  canvasController.getCanvasById
);

router.get(
  "/history/:canvasId",
  checkCanvasAccess,
  canvasController.getCanvasHistory
);

router.get(
  "/channel/all/:channelId",
  canvasController.getChannelCanvases
);

// ── Get all canvases accessible to the user across the workspace ─────
router.get(
  "/my/all",
  canvasController.getMyCanvases
);

router.get(
  "/saved/:channelId",
  canvasController.getSavedCanvases
);

router.get(
  "/:channelId",
  canvasController.getCanvas
);

// ── Write routes — editor or owner required ─────────────────────────────────
router.post(
  "/duplicate/:canvasId",
  checkCanvasAccess,
  requireCanvasRole("editor", "owner"),
  canvasController.duplicateCanvas
);

router.post(
  "/history/restore/:canvasId/:historyId",
  checkCanvasAccess,
  requireCanvasRole("editor", "owner"),
  canvasController.restoreCanvasVersion
);

router.put(
  "/update/:canvasId",
  checkCanvasAccess,
  requireCanvasRole("editor", "owner"),
  canvasController.updateCanvas
);

router.post(
  "/save-later/:canvasId",
  checkCanvasAccess,
  canvasController.toggleCanvasSaveForLater
);

router.patch(
  "/save-later/:canvasId/status",
  checkCanvasAccess,
  canvasController.updateCanvasSavedStatus
);

router.post(
  "/:channelId",
  canvasController.createCanvas
);

// ── Owner-only routes ───────────────────────────────────────────────────────
router.delete(
  "/:canvasId",
  checkCanvasAccess,
  requireCanvasRole("owner"),
  canvasController.deleteCanvas
);

export default router;
