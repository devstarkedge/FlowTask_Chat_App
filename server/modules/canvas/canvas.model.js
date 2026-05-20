import mongoose from "mongoose";

const { Schema, model } = mongoose;

const canvasSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
    },

    title: {
      type: String,
      default: "Untitled Canvas",
    },

    type: {
      type: String,
      enum: ["notes", "meeting", "brainstorm"],
      default: "notes",
    },

    content: {
      type: Object,
      default: {},
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
      required: true,
    },

    lastEditedBy: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
    },
  },
  {
    timestamps: true,
  }
);

canvasSchema.index({
  workspaceId: 1,
  channelId: 1,
});

export default model("Canvas", canvasSchema);