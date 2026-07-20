import Category from "./Category.model.js";
import Department from "./Department.model.js";
import Channel from "../channels/Channel.model.js";
import { syncDepartments } from "./syncDepartmentsService.js";
import asyncHandler from "../../middleware/asyncHandler.js";
import { AppError, NotFoundError, ForbiddenError, BadRequestError } from "../../middleware/errorHandler.js";

// @desc    Sync external departments
// @route   POST /api/categories/sync-departments
// @access  Private (Admin/Manager)
export const syncExternalDepartments = asyncHandler(async (req, res, next) => {
  const result = await syncDepartments(req.workspaceId);
  if (!result.success) {
    return next(new AppError(result.error || result.message, 500));
  }
  res.status(200).json(result);
});

// @desc    Get all synchronized departments
// @route   GET /api/categories/departments
// @access  Private
export const getDepartments = asyncHandler(async (req, res, next) => {
  const departments = await Department.find({ workspaceId: req.workspaceId });
  res.status(200).json({ success: true, data: departments });
});

// @desc    Get all categories
// @route   GET /api/categories
// @access  Private
export const getCategories = asyncHandler(async (req, res, next) => {
  const categories = await Category.find({ workspaceId: req.workspaceId, createdBy: req.user._id })
    .populate('departmentId')
    .sort({ order: 1 });
  res.status(200).json({ success: true, data: categories });
});

// @desc    Create a category
// @route   POST /api/categories
// @access  Private (Admin/Manager)
export const createCategory = asyncHandler(async (req, res, next) => {
  const { name, type, departmentId, icon, color, description } = req.body;

  // Get max order
  const lastCategory = await Category.findOne({ workspaceId: req.workspaceId }).sort({ order: -1 });
  const nextOrder = lastCategory ? (lastCategory.order || 0) + 1 : 0;

  const category = await Category.create({
    workspaceId: req.workspaceId,
    name,
    type,
    departmentId: departmentId || null,
    icon,
    color,
    description,
    order: nextOrder,
    createdBy: req.user._id,
  });

  req.app.get("io")
    ?.to(req.workspaceId.toString())
    .emit("category:created", category);

  res.status(201).json({ success: true, data: category });
});

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private (Admin/Manager)
export const updateCategory = asyncHandler(async (req, res, next) => {
  let category = await Category.findById(req.params.id);

  if (!category) {
    return next(new NotFoundError("Category"));
  }

  if (category.workspaceId.toString() !== req.workspaceId.toString()) {
    return next(new ForbiddenError("Not authorized to update this category"));
  }

  category = await Category.findByIdAndUpdate(
    req.params.id,
    { ...req.body, lastActivity: new Date() },
    { new: true, runValidators: true }
  ).populate('departmentId');

  req.app.get("io")
    ?.to(req.workspaceId.toString())
    .emit("category:updated", category);

  res.status(200).json({ success: true, data: category });
});

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private (Admin/Manager)
export const deleteCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new NotFoundError("Category"));
  }

  if (category.workspaceId.toString() !== req.workspaceId.toString()) {
    return next(new ForbiddenError("Not authorized to delete this category"));
  }

  // Remove category assignment from all channels
  await Channel.updateMany(
    { categoryId: req.params.id },
    { $set: { categoryId: null } }
  );

  await category.deleteOne();

  req.app.get("io")
    ?.to(req.workspaceId.toString())
    .emit("category:deleted", req.params.id);

  res.status(200).json({ success: true, data: {} });
});

// @desc    Reorder categories
// @route   PUT /api/categories/reorder
// @access  Private (Admin/Manager)
export const reorderCategories = asyncHandler(async (req, res, next) => {
  const { categoryOrders } = req.body; // [{ id: '...', order: 0 }, ...]

  if (!Array.isArray(categoryOrders)) {
    return next(new BadRequestError("categoryOrders must be an array"));
  }

  const bulkOps = categoryOrders.map(cat => ({
    updateOne: {
      filter: { _id: cat.id, workspaceId: req.workspaceId },
      update: { $set: { order: cat.order } }
    }
  }));

  await Category.bulkWrite(bulkOps);

  req.app.get("io")
    ?.to(req.workspaceId.toString())
    .emit("category:reordered", categoryOrders);

  res.status(200).json({ success: true, message: "Categories reordered successfully" });
});

// @desc    Suggest channels for a department
// @route   POST /api/categories/suggest-channels
// @access  Private
export const suggestChannels = asyncHandler(async (req, res, next) => {
  const { name } = req.body;
  if (!name) return res.status(200).json({ success: true, data: [] });

  const searchKeywords = name.toLowerCase().split(/\s+/);
  
  // Find channels without a category whose name or description matches keywords
  const channels = await Channel.find({
    workspaceId: req.workspaceId,
    isArchived: false,
    $or: searchKeywords.map(kw => ({ name: new RegExp(kw, 'i') }))
  }).select('_id name description type');

  res.status(200).json({ success: true, data: channels });
});

// @desc    Add a channel to a category
// @route   POST /api/categories/:id/channels
// @access  Private
export const addChannelToCategory = asyncHandler(async (req, res, next) => {
  const { channelId } = req.body;
  if (!channelId) return next(new BadRequestError("channelId is required"));


  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.workspaceId, createdBy: req.user._id },
    { $addToSet: { channelIds: channelId }, lastActivity: new Date() },
    { new: true }
  ).populate('departmentId');

  if (!category) return next(new NotFoundError("Category"));

  req.app.get("io")?.to(req.workspaceId.toString()).emit("category:updated", category);
  res.status(200).json({ success: true, data: category });
});

// @desc    Remove a channel from a category
// @route   DELETE /api/categories/:id/channels/:channelId
// @access  Private
export const removeChannelFromCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.workspaceId, createdBy: req.user._id },
    { $pull: { channelIds: req.params.channelId }, lastActivity: new Date() },
    { new: true }
  ).populate('departmentId');

  if (!category) return next(new NotFoundError("Category"));

  req.app.get("io")?.to(req.workspaceId.toString()).emit("category:updated", category);
  res.status(200).json({ success: true, data: category });
});

export const addBulkChannelsToCategory = asyncHandler(async (req, res, next) => {
  const { channelIds } = req.body;
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return next(new BadRequestError("channelIds array is required"));
  }

  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.workspaceId, createdBy: req.user._id, type: 'custom' },
    { $addToSet: { channelIds: { $each: channelIds } }, lastActivity: new Date() },
    { new: true }
  ).populate('departmentId');

  if (!category) return next(new NotFoundError("Custom Category"));

  req.app.get("io")?.to(req.workspaceId.toString()).emit("category:updated", category);
  res.status(200).json({ success: true, data: category });
});
