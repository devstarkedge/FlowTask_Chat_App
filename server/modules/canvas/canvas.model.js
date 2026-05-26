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
      enum: ["notes", "meeting", "brainstorm", "template", "project", "incident", "knowledge"],
      default: "notes",
    },

    content: {
      type: Object,
      default: () => ({
        type: "doc",
        content: [{ type: "paragraph" }],
      }),
    },

    collaborationState: {
      type: Buffer,
      default: null,
      select: false,
    },

    cover: {
      type: {
        type: String,
        enum: ["color", "gradient", "image"],
      },
      value: {
        type: String,
      },
      yOffset: {
        type: Number,
        default: 50,
      },
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
      required: false,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
    },

    lastEditedBy: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
    },

    permissions: {
      visibility: {
        type: String,
        enum: ["channel", "workspace", "private"],
        default: "channel",
      },
      inheritFromChannel: {
        type: Boolean,
        default: true,
      },
      allowedUserIds: [{
        type: Schema.Types.ObjectId,
        ref: "ChatUser",
      }],
      allowedRoleIds: [{
        type: String,
      }],
    },

    templateMeta: {
      isTemplate: {
        type: Boolean,
        default: false,
      },
      category: {
        type: String,
        default: null,
      },
      favoriteFor: [{
        type: Schema.Types.ObjectId,
        ref: "ChatUser",
      }],
      usageCount: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  },
);

canvasSchema.index({
  workspaceId: 1,
  channelId: 1,
});

const Canvas = mongoose.models.Canvas || model("Canvas", canvasSchema);

export default Canvas;
