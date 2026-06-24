import Canvas from "./canvas.model.js";

const USER_FIELDS = "createdBy updatedBy lastEditedBy";
const USER_SELECT = "name avatar email";

class CanvasRepository {
  async create(data) {
    const canvas = await Canvas.create(data);
    // Populate user fields before returning
    return Canvas.findById(canvas._id)
      .populate(USER_FIELDS, USER_SELECT)
      .lean();
  }

  // ── Find single canvas by channel ─────────────────────────────────────────
  async findByChannel(channelId, workspaceId) {
    return Canvas.findOne({ channelId, workspaceId })
      .populate(USER_FIELDS, USER_SELECT)
      .lean();
  }

  // ── Find all canvases for a channel ───────────────────────────────────────
  async findAllByChannel(channelId, workspaceId) {
    return Canvas.find({ channelId, workspaceId })
      .populate(USER_FIELDS, USER_SELECT)
      .sort({ updatedAt: -1 })
      .lean();
  }

  // ── Find by ID (scoped to workspace for security) ─────────────────────────
  async findById(canvasId, workspaceId) {
    const query = workspaceId
      ? Canvas.findOne({ _id: canvasId, workspaceId })
      : Canvas.findById(canvasId);
    return query.populate(USER_FIELDS, USER_SELECT).lean();
  }

  // ── Update ────────────────────────────────────────────────────────────────
  async update(canvasId, updates) {
    return Canvas.findByIdAndUpdate(canvasId, updates, { returnDocument: 'after' })
      .populate(USER_FIELDS, USER_SELECT)
      .lean();
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async delete(canvasId) {
    return Canvas.findByIdAndDelete(canvasId);
  }
}

export default new CanvasRepository();
