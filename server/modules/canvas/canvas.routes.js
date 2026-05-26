import express from "express";
import canvasController from "./canvas.controller.js";

const router = express.Router();

// ── Specific Canvas routes (must be defined before /:channelId or /:canvasId params)
router.get(
  "/by-id/:canvasId",
  canvasController.getCanvasById
);

router.post(
  "/duplicate/:canvasId",
  canvasController.duplicateCanvas
);

router.get(
  "/history/:canvasId",
  canvasController.getCanvasHistory
);

router.post(
  "/history/restore/:canvasId/:historyId",
  canvasController.restoreCanvasVersion
);

router.get(
  "/channel/all/:channelId",
  canvasController.getChannelCanvases
);

router.put(
  "/update/:canvasId",
  canvasController.updateCanvas
);

// router.delete(
//   "/:canvasId",
//   canvasController.deleteCanvas
// );

// ── Dynamic parameter fallback routes
router.get(
  "/:channelId",
  canvasController.getCanvas
);

router.post(
  "/:channelId",
  canvasController.createCanvas
);

export default router;