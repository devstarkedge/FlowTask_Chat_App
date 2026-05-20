import canvasService from "./canvas.service.js";

import asyncHandler from "../../middleware/asyncHandler.js";

// ─────────────────────────────────────────────────────────────
// Get Canvas
// ─────────────────────────────────────────────────────────────

const getCanvas = asyncHandler(async (req, res) => {

  const { channelId } = req.params;

  const workspaceId = req.workspaceId;

  const canvas = await canvasService.getCanvas(
    channelId,
    workspaceId,
  );

  return res.status(200).json({
    success: true,
    data: canvas,
  });
});

// ─────────────────────────────────────────────────────────────
// Create Canvas
// ─────────────────────────────────────────────────────────────

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
    workspaceId,
  );

  return res.status(201).json({
    success: true,
    data: canvas,
  });
});

// ─────────────────────────────────────────────────────────────
// Update Canvas
// ─────────────────────────────────────────────────────────────

const updateCanvas = asyncHandler(async (req, res) => {

  const { canvasId } = req.params;

  const workspaceId = req.workspaceId;

  const userId = req.user._id;

  const canvas = await canvasService.updateCanvas(
    canvasId,
    req.body,
    userId,
    workspaceId,
  );

  return res.status(200).json({
    success: true,
    data: canvas,
  });
});

// ─────────────────────────────────────────────────────────────
// Delete Canvas
// ─────────────────────────────────────────────────────────────

const deleteCanvas = asyncHandler(async (req, res) => {

  const { canvasId } = req.params;

  const workspaceId = req.workspaceId;

  const userId = req.user._id;

  const result = await canvasService.deleteCanvas(
    canvasId,
    userId,
    workspaceId,
  );

  return res.status(200).json({
    success: true,
    data: result,
  });
});

// ─────────────────────────────────────────────────────────────
// Get All Channel Canvases
// ─────────────────────────────────────────────────────────────

const getChannelCanvases = asyncHandler(async (req, res) => {

  const { channelId } = req.params;

  const workspaceId = req.workspaceId;

  const canvases = await canvasService.getChannelCanvases(
    channelId,
    workspaceId,
  );

  return res.status(200).json({
    success: true,
    data: canvases,
  });
});

export default {
  getCanvas,
  createCanvas,
  updateCanvas,
  deleteCanvas,
  getChannelCanvases,
};