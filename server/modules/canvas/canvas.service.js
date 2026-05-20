import canvasRepository from "./canvas.repository.js";
import channelRepository from "../channels/channel.repository.js";

import {
  emitToChannel,
} from "../../sockets/socketManager.js";

import logger from "../../utils/logger.js";

import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "../../middleware/errorHandler.js";

class CanvasService {

  // ─────────────────────────────────────────────────────────────
  // Get Canvas
  // ─────────────────────────────────────────────────────────────

  async getCanvas(channelId, workspaceId) {

    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const channel = await channelRepository.findById(
      channelId,
      { workspaceId }
    );

    if (!channel) {
      throw new NotFoundError("Channel not found");
    }

    let canvas = await canvasRepository.findByChannel(
      channelId,
      workspaceId
    );

    // Auto-create default canvas
    if (!canvas) {

      canvas = await canvasRepository.create({
        workspaceId,
        channelId,
        title: `${channel.name} Canvas`,
        type: "notes",
        content: {},
      });

      logger.info("[CANVAS] Auto-created canvas", {
        canvasId: canvas._id,
        channelId,
        workspaceId,
      });
    }

    return canvas;
  }

  // ─────────────────────────────────────────────────────────────
  // Create Canvas
  // ─────────────────────────────────────────────────────────────

  async createCanvas(data, userId, workspaceId) {

    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    if (!data.channelId) {
      throw new ValidationError("channelId is required");
    }

    const channel = await channelRepository.findById(
      data.channelId,
      { workspaceId }
    );

    if (!channel) {
      throw new NotFoundError("Channel not found");
    }

    // Prevent duplicate canvas per channel
    const existing = await canvasRepository.findByChannel(
      data.channelId,
      workspaceId
    );

    if (existing) {
      return existing;
    }

    const canvas = await canvasRepository.create({
      workspaceId,
      channelId: data.channelId,
      title: data.title || `${channel.name} Canvas`,
      type: data.type || "notes",
      content: data.content || {},
      createdBy: userId,
      lastEditedBy: userId,
    });

    logger.info("[CANVAS] Canvas created", {
      canvasId: canvas._id,
      channelId: data.channelId,
      workspaceId,
      createdBy: userId,
    });

    return canvas;
  }

  // ─────────────────────────────────────────────────────────────
  // Update Canvas
  // ─────────────────────────────────────────────────────────────

  async updateCanvas(
    canvasId,
    updates,
    userId,
    workspaceId,
  ) {

    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const canvas = await canvasRepository.findById(
      canvasId,
      workspaceId
    );

    if (!canvas) {
      throw new NotFoundError("Canvas not found");
    }

    const allowedUpdates = {};

    // Title
    if (updates.title !== undefined) {
      allowedUpdates.title = updates.title;
    }

    // Type
    if (updates.type !== undefined) {
      allowedUpdates.type = updates.type;
    }

    // Content
    if (updates.content !== undefined) {
      allowedUpdates.content = updates.content;
    }

    allowedUpdates.lastEditedBy = userId;
    allowedUpdates.updatedAt = new Date();

    const updatedCanvas = await canvasRepository.update(
      canvasId,
      allowedUpdates
    );

    // ─────────────────────────────────────────────────────────
    // Realtime Sync
    // ─────────────────────────────────────────────────────────

    emitToChannel(
      canvas.channelId.toString(),
      "canvas:updated",
      {
        canvasId: updatedCanvas._id,
        channelId: canvas.channelId,
        updates: {
          title: updatedCanvas.title,
          type: updatedCanvas.type,
          content: updatedCanvas.content,
          updatedAt: updatedCanvas.updatedAt,
          lastEditedBy: userId,
        },
      },
      workspaceId,
    );

    logger.info("[CANVAS] Canvas updated", {
      canvasId,
      workspaceId,
      updatedBy: userId,
    });

    return updatedCanvas;
  }

  // ─────────────────────────────────────────────────────────────
  // Delete Canvas
  // ─────────────────────────────────────────────────────────────

  async deleteCanvas(
    canvasId,
    userId,
    workspaceId,
  ) {

    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const canvas = await canvasRepository.findById(
      canvasId,
      workspaceId
    );

    if (!canvas) {
      throw new NotFoundError("Canvas not found");
    }

    await canvasRepository.delete(canvasId);

    emitToChannel(
      canvas.channelId.toString(),
      "canvas:deleted",
      {
        canvasId,
        channelId: canvas.channelId,
      },
      workspaceId,
    );

    logger.info("[CANVAS] Canvas deleted", {
      canvasId,
      workspaceId,
      deletedBy: userId,
    });

    return {
      success: true,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Get Channel Canvases
  // ─────────────────────────────────────────────────────────────

  async getChannelCanvases(
    channelId,
    workspaceId,
  ) {

    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const channel = await channelRepository.findById(
      channelId,
      { workspaceId }
    );

    if (!channel) {
      throw new NotFoundError("Channel not found");
    }

    return canvasRepository.findAllByChannel(
      channelId,
      workspaceId
    );
  }
}

export default new CanvasService();