import mongoose from "mongoose";

const { Schema, model } = mongoose;

const customGroupSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
      required: true,
    },
    channels: [
      {
        type: Schema.Types.ObjectId,
        ref: "Channel",
      },
    ],
  },
  {
    timestamps: true,
  }
);

customGroupSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

const CustomGroup = mongoose.models.CustomGroup || model("CustomGroup", customGroupSchema);

export default CustomGroup;
