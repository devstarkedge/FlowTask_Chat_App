import mongoose from "mongoose";

const { Schema, model } = mongoose;

const categorySchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['department', 'custom'],
      required: true,
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
    order: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
      required: true,
    },
    channelIds: [{
      type: Schema.Types.ObjectId,
      ref: "Channel",
    }],
    lastActivity: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

categorySchema.index({ workspaceId: 1, createdBy: 1, name: 1 }, { unique: true });
categorySchema.index({ workspaceId: 1, createdBy: 1, order: 1 });
categorySchema.index(
  { workspaceId: 1, createdBy: 1, departmentId: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'department', departmentId: { $type: 'objectId' } },
  },
);

const Category = mongoose.models.Category || model("Category", categorySchema);

export default Category;
