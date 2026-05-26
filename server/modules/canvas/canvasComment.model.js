import mongoose from "mongoose";

const { Schema, model } = mongoose;

const replySchema = new Schema({
  authorId: {
    type: Schema.Types.ObjectId,
    ref: "ChatUser",
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const canvasCommentSchema = new Schema(
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

    blockId: {
      type: Schema.Types.ObjectId,
      ref: "CanvasBlock",
      required: true,
      index: true,
    },

    authorId: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
      required: true,
    },

    content: {
      type: String,
      required: true,
    },

    replies: {
      type: [replySchema],
      default: [],
    },

    mentions: [{
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
    }],

    reactions: [{
      emoji: { type: String, required: true },
      userIds: [{
        type: Schema.Types.ObjectId,
        ref: "ChatUser",
      }],
    }],

    resolved: {
      type: Boolean,
      default: false,
    },

    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

canvasCommentSchema.index({ workspaceId: 1, channelId: 1, canvasId: 1, resolved: 1 });

export default model("CanvasComment", canvasCommentSchema);
