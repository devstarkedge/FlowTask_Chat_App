import express from "express";

import canvasController from "./canvas.controller.js";

// import { protect } from "../../middleware/authMiddleware.js";
// import { resolveWorkspace } from "../../middleware/workspaceMiddleware.js";
// import { requireChannelAccess } from "../channels/channel.middleware.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────

// router.use(protect);
// router.use(resolveWorkspace);

// ─────────────────────────────────────────────────────────────
// Get Canvas By Channel
// GET /api/chat/canvas/:channelId
// ─────────────────────────────────────────────────────────────

router.get(
  "/:channelId",
  // requireChannelAccess(),
  canvasController.getCanvas,
);

// ─────────────────────────────────────────────────────────────
// Create Canvas
// POST /api/chat/canvas/:channelId
// ─────────────────────────────────────────────────────────────

router.post(
  "/:channelId",
//   requireChannelAccess(),
  canvasController.createCanvas,
);

// ─────────────────────────────────────────────────────────────
// Update Canvas
// PUT /api/chat/canvas/:canvasId
// ─────────────────────────────────────────────────────────────

router.put(
  "/update/:canvasId",
  canvasController.updateCanvas,
);

// ─────────────────────────────────────────────────────────────
// Delete Canvas
// DELETE /api/chat/canvas/:canvasId
// ─────────────────────────────────────────────────────────────

router.delete(
  "/:canvasId",
  canvasController.deleteCanvas,
);

// ─────────────────────────────────────────────────────────────
// Get All Channel Canvases
// GET /api/chat/canvas/channel/all/:channelId
// ─────────────────────────────────────────────────────────────

router.get(
  "/channel/all/:channelId",
//   requireChannelAccess(),
  canvasController.getChannelCanvases,
);

export default router;
