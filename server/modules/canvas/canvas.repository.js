import Canvas from "./canvas.model.js";

class CanvasRepository {
  async create(data) {
    return Canvas.create(data);
  }

  // ── Find single canvas by channel ─────────────────────────────────────────
  async findByChannel(channelId, workspaceId) {
    return Canvas.findOne({ channelId, workspaceId });
  }

  // ── Find all canvases for a channel ───────────────────────────────────────
  async findAllByChannel(channelId, workspaceId) {
    return Canvas.find({ channelId, workspaceId }).sort({ updatedAt: -1 });
  }

  // ── Find by ID (scoped to workspace for security) ─────────────────────────
  async findById(canvasId, workspaceId) {
    return Canvas.findOne({ _id: canvasId, workspaceId });
  }

  // ── Update ────────────────────────────────────────────────────────────────
  async update(canvasId, updates) {
    return Canvas.findByIdAndUpdate(canvasId, updates, { new: true });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async delete(canvasId) {
    return Canvas.findByIdAndDelete(canvasId);
  }
}

export default new CanvasRepository();
