import express from "express";
import canvasController from "./canvas.controller.js";
import { protect } from "../auth/auth.middleware.js";
import { resolveWorkspace } from "../../middleware/workspaceContext.js";

const router = express.Router();

// All canvas routes require authentication + workspace context
router.use(protect, resolveWorkspace);

// ── Read routes ─────────────────────────────────────────────────────────────
router.get(
  "/by-id/:canvasId",
  canvasController.getCanvasById
);

router.get(
  "/history/:canvasId",
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

// ── Write routes — all authenticated users can edit ─────────────────────────
router.post(
  "/duplicate/:canvasId",
  canvasController.duplicateCanvas
);

router.post(
  "/history/restore/:canvasId/:historyId",
  canvasController.restoreCanvasVersion
);

router.put(
  "/update/:canvasId",
  canvasController.updateCanvas
);

router.post(
  "/save-later/:canvasId",
  canvasController.toggleCanvasSaveForLater
);

router.patch(
  "/save-later/:canvasId/status",
  canvasController.updateCanvasSavedStatus
);

router.post(
  "/:channelId",
  canvasController.createCanvas
);

// ── Delete routes — all authenticated users can delete ──────────────────────
router.delete(
  "/:canvasId",
  canvasController.deleteCanvas
);

export default router;
