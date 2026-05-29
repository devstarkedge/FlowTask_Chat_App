import canvasService from "./canvas.service.js";
import asyncHandler from "../../middleware/asyncHandler.js";

// ── Get Canvas metadata (returns existing canvas or null; no auto-create)
const getCanvas = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const workspaceId = req.workspaceId;

  const canvas = await canvasService.getCanvas(channelId, workspaceId);

  return res.status(200).json({
    success: true,
    data: canvas,
  });
});

// ── Get Canvas with Blocks & Comments
const getCanvasById = asyncHandler(async (req, res) => {
  const { canvasId } = req.params;
  const workspaceId = req.workspaceId;

  const details = await canvasService.getCanvasById(canvasId, workspaceId);

  return res.status(200).json({
    success: true,
    data: details,
  });
});

// ── Create Canvas
const createCanvas = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const workspaceId = req.workspaceId;
  const userId = req.user._id;

  const canvas = await canvasService.createCanvas(
    {
      ...req.body,
      channelId,
    },
    userId,
    workspaceId
  );

  return res.status(201).json({
    success: true,
    data: canvas,
  });
});

// ── Update Canvas (Title / Cover)
const updateCanvas = asyncHandler(async (req, res) => {
  const { canvasId } = req.params;
  const workspaceId = req.workspaceId;
  const userId = req.user._id;

  const canvas = await canvasService.updateCanvas(
    canvasId,
    req.body,
    userId,
    workspaceId
  );

  return res.status(200).json({
    success: true,
    data: canvas,
  });
});

// ── Delete Canvas
// const deleteCanvas = asyncHandler(async (req, res) => {
//   const { canvasId } = req.params;
//   const workspaceId = req.workspaceId;
//   const userId = req.user._id;

//   const result = await canvasService.deleteCanvas(
//     canvasId,
//     userId,
//     workspaceId
//   );

//   return res.status(200).json({
//     success: true,
//     data: result,
//   });
// });

// ── Get All Channel Canvases
const getChannelCanvases = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const workspaceId = req.workspaceId;

  const canvases = await canvasService.getChannelCanvases(
    channelId,
    workspaceId
  );

  return res.status(200).json({
    success: true,
    data: canvases,
  });
});

// ── Duplicate Canvas
const duplicateCanvas = asyncHandler(async (req, res) => {
  const { canvasId } = req.params;
  const workspaceId = req.workspaceId;
  const userId = req.user._id;

  const canvas = await canvasService.duplicateCanvas(
    canvasId,
    userId,
    workspaceId
  );

  return res.status(201).json({
    success: true,
    data: canvas,
  });
});

// ── Get Canvas Version Snapshots
const getCanvasHistory = asyncHandler(async (req, res) => {
  const { canvasId } = req.params;
  const workspaceId = req.workspaceId;

  const history = await canvasService.getCanvasHistory(canvasId, workspaceId);

  return res.status(200).json({
    success: true,
    data: history,
  });
});

// ── Restore Canvas snapshot version
const restoreCanvasVersion = asyncHandler(async (req, res) => {
  const { canvasId, historyId } = req.params;
  const workspaceId = req.workspaceId;
  const userId = req.user._id;

  const result = await canvasService.restoreCanvasVersion(
    canvasId,
    historyId,
    userId,
    workspaceId
  );

  return res.status(200).json({
    success: true,
    data: result,
  });
});

export default {
  getCanvas,
  getCanvasById,
  createCanvas,
  updateCanvas,
  // deleteCanvas,
  getChannelCanvases,
  duplicateCanvas,
  getCanvasHistory,
  restoreCanvasVersion,
};