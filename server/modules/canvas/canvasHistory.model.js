import mongoose from "mongoose";

const { Schema, model } = mongoose;

const canvasHistorySchema = new Schema(
  {
    canvasId: {
      type: Schema.Types.ObjectId,
      ref: "Canvas",
      required: true,
      index: true,
    },

    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      index: true,
    },

    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      index: true,
    },

    snapshot: {
      title: { type: String },
      cover: { type: Schema.Types.Mixed },
      content: { type: Schema.Types.Mixed },
      blocks: { type: Array, default: [] },
    },

    diff: {
      type: Schema.Types.Mixed,
      default: null,
    },

    operationSummary: {
      type: String,
      default: "Canvas updated",
    },

    editorId: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
      required: true,
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

canvasHistorySchema.index({ workspaceId: 1, channelId: 1, canvasId: 1, timestamp: -1 });

export default model("CanvasHistory", canvasHistorySchema);
