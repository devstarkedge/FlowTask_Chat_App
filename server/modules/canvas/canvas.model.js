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

    savedForLaterBy: [{
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
    }],
    savedForLaterStatus: {
      type: String,
      enum: ["in_progress", "archived", "completed"],
      default: "in_progress",
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    viewedBy: [{
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
    }],

    sharing: {
      isPublic: {
        type: Boolean,
        default: false,
      },
      publicToken: {
        type: String,
        default: null,
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
