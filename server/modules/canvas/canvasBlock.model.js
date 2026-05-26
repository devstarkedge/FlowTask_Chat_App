import mongoose from "mongoose";

const { Schema, model } = mongoose;

const reactionSchema = new Schema({
  emoji: {
    type: String,
    required: true,
  },
  userIds: [{
    type: Schema.Types.ObjectId,
    ref: "ChatUser",
  }],
}, { _id: false });

const canvasBlockSchema = new Schema(
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

    type: {
      type: String,
      required: true,
      enum: [
        "paragraph",
        "heading-1",
        "heading-2",
        "heading-3",
        "code",
        "code-block",
        "bullet-list",
        "ordered-list",
        "number-list",
        "checklist",
        "table",
        "callout",
        "quote",
        "divider",
        "columns",
        "attachment",
        "image",
        "embed",
        "mention",
        "date",
        "reminder",
        "reaction",
        "comment-thread",
        "task",
      ],
      default: "paragraph",
    },

    content: {
      type: Schema.Types.Mixed,
      default: "",
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    order: {
      type: Number,
      required: true,
      default: 0,
    },

    columnId: {
      type: String,
      default: null,
    },

    colIndex: {
      type: Number,
      default: null,
    },

    reactions: {
      type: [reactionSchema],
      default: [],
    },

    comments: [{
      type: Schema.Types.ObjectId,
      ref: "CanvasComment",
    }],

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
    },

    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
    },

    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Index to quickly fetch and sort blocks for a canvas
canvasBlockSchema.index({ canvasId: 1, order: 1 });
canvasBlockSchema.index({ workspaceId: 1, channelId: 1, canvasId: 1 });

export default model("CanvasBlock", canvasBlockSchema);
