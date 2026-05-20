import Canvas from "./Canvas.model.js";

class CanvasRepository {
  async create(data) {
    return Canvas.create(data);
  }

  async findByChannel(channelId, workspaceId) {
    return Canvas.findOne({
      channelId,
      workspaceId,
    });
  }

  async update(canvasId, updates) {
    return Canvas.findByIdAndUpdate(
      canvasId,
      updates,
      { new: true }
    );
  }
}

export default new CanvasRepository();