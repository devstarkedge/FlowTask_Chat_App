import mongoose from "mongoose";

const { Schema, model } = mongoose;

const departmentSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    externalId: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['proofhub', 'trello', 'jira', 'asana', 'monday', 'custom'],
      default: 'proofhub',
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    icon: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: '',
    },
    lastSyncTime: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

departmentSchema.index({ workspaceId: 1, externalId: 1 }, { unique: true });

const Department = mongoose.models.Department || model("Department", departmentSchema);

export default Department;
