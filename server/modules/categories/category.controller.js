import Category from "./Category.model.js";
import Department from "./Department.model.js";
import Channel from "../channels/Channel.model.js";
import channelService from "../channels/channel.service.js";
import { syncDepartments } from "./syncDepartmentsService.js";
import asyncHandler from "../../middleware/asyncHandler.js";
import { AppError, NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "../../middleware/errorHandler.js";

async function validateAccessibleCategoryChannels(req, channelIds) {
  const requestedIds = [...new Set(channelIds.map((channelId) => String(channelId)).filter(Boolean))];
  if (requestedIds.length === 0) return [];

  const accessibleChannels = await channelService.getChannelsForUser(
    req.user._id,
    req.workspaceId,
    req.membership?.role || null,
  );
  const accessibleIds = new Set(
    accessibleChannels
      .filter((channel) => channel.type !== 'dm' && channel.type !== 'self' && !channel.isArchived)
      .map((channel) => String(channel._id)),
  );

  if (requestedIds.some((channelId) => !accessibleIds.has(channelId))) {
    throw new ForbiddenError('One or more selected channels are not accessible to this user');
  }

  return requestedIds;
}

// @desc    Sync external departments
// @route   POST /api/categories/sync-departments
// @access  Private (imports FlowTask's public active-department directory)
export const syncExternalDepartments = asyncHandler(async (req, res, next) => {
  const result = await syncDepartments(req.workspaceId);
  if (!result.success) {
    return next(new AppError(
      result.error || result.message || 'FlowTask department synchronization failed',
      502,
      'FLOWTASK_DEPARTMENT_SYNC_FAILED',
    ));
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

  if (!['department', 'custom'].includes(type)) {
    return next(new BadRequestError('Category type must be department or custom'));
  }

  let resolvedDepartmentId = null;
  if (type === 'department') {
    if (!departmentId) {
      return next(new BadRequestError('A department is required for a department category'));
    }
    const department = await Department.findOne({ _id: departmentId, workspaceId: req.workspaceId });
    if (!department) return next(new BadRequestError('Selected department is not available in this workspace'));

    const existingDepartmentCategory = await Category.findOne({
      workspaceId: req.workspaceId,
      createdBy: req.user._id,
      type: 'department',
      departmentId: department._id,
    });
    if (existingDepartmentCategory) {
      return next(new ConflictError('This department is already imported as a category', 'DEPARTMENT_CATEGORY_EXISTS'));
    }
    resolvedDepartmentId = department._id;
  }

  // Get max order
  const lastCategory = await Category.findOne({ workspaceId: req.workspaceId }).sort({ order: -1 });
  const nextOrder = lastCategory ? (lastCategory.order || 0) + 1 : 0;

  const category = await Category.create({
    workspaceId: req.workspaceId,
    name,
    type,
    departmentId: resolvedDepartmentId,
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
  const category = await Category.findOne({
    _id: req.params.id,
    workspaceId: req.workspaceId,
    createdBy: req.user._id,
  });

  if (!category) {
    return next(new NotFoundError("Category"));
  }

  const requestedType = req.body.type ?? category.type;
  if (!['department', 'custom'].includes(requestedType)) {
    return next(new BadRequestError('Category type must be department or custom'));
  }

  const update = {
    type: requestedType,
    lastActivity: new Date(),
  };

  for (const field of ['name', 'icon', 'color', 'description']) {
    if (req.body[field] !== undefined) update[field] = req.body[field];
  }
  if (update.name !== undefined) {
    update.name = String(update.name).trim();
    if (!update.name) return next(new BadRequestError('Category name is required'));
  }

  if (requestedType === 'department') {
    const requestedDepartmentId = req.body.departmentId
      || category.departmentId?._id
      || category.departmentId;
    if (!requestedDepartmentId) {
      return next(new BadRequestError('A department is required for a department category'));
    }

    const department = await Department.findOne({
      _id: requestedDepartmentId,
      workspaceId: req.workspaceId,
    });
    if (!department) return next(new BadRequestError('Selected department is not available in this workspace'));

    const duplicate = await Category.findOne({
      _id: { $ne: category._id },
      workspaceId: req.workspaceId,
      createdBy: req.user._id,
      type: 'department',
      departmentId: department._id,
    });
    if (duplicate) {
      return next(new ConflictError('This department is already imported as a category', 'DEPARTMENT_CATEGORY_EXISTS'));
    }

    update.departmentId = department._id;
    update.channelIds = [];
  } else {
    update.departmentId = null;
    if (req.body.channelIds !== undefined) {
      if (!Array.isArray(req.body.channelIds)) {
        return next(new BadRequestError('channelIds must be an array'));
      }
      update.channelIds = await validateAccessibleCategoryChannels(req, req.body.channelIds);
      
      const previousCategories = await Category.find({
        workspaceId: req.workspaceId,
        createdBy: req.user._id,
        _id: { $ne: category._id },
        channelIds: { $in: update.channelIds }
      });

      if (previousCategories.length > 0) {
        await Category.updateMany(
          { _id: { $in: previousCategories.map(c => c._id) } },
          { $pullAll: { channelIds: update.channelIds } }
        );
        const updatedPrevious = await Category.find({ _id: { $in: previousCategories.map(c => c._id) } }).populate('departmentId');
        for (const cat of updatedPrevious) {
          req.app.get("io")?.to(req.workspaceId.toString()).emit("category:updated", cat);
        }
      }
    }
  }

  const updatedCategory = await Category.findOneAndUpdate(
    { _id: category._id, workspaceId: req.workspaceId, createdBy: req.user._id },
    { $set: update },
    { new: true, runValidators: true }
  ).populate('departmentId');

  req.app.get("io")
    ?.to(req.workspaceId.toString())
    .emit("category:updated", updatedCategory);

  res.status(200).json({ success: true, data: updatedCategory });
});

// @desc    Remove all personal category groupings and return channels to normal lists
// @route   DELETE /api/categories
// @access  Private
export const clearAllCategories = asyncHandler(async (req, res) => {
  const ownerFilter = {
    workspaceId: req.workspaceId,
    createdBy: req.user._id,
  };
  const categoryIds = await Category.find(ownerFilter).distinct('_id');
  const result = await Category.deleteMany(ownerFilter);

  if (categoryIds.length > 0) {
    // Clear legacy channel-side category references. Current custom mappings
    // live on Category.channelIds, so deleting the personal categories is the
    // authoritative ungroup operation and never deletes channel data.
    await Channel.updateMany(
      { workspaceId: req.workspaceId, categoryId: { $in: categoryIds } },
      { $set: { categoryId: null } },
    );
  }

  req.app.get('io')
    ?.to(`ws:${req.workspaceId}:user:${req.user._id}`)
    .emit('channel:list:invalidated', { reason: 'categories-cleared' });

  res.status(200).json({
    success: true,
    data: { deletedCount: result.deletedCount || 0 },
    message: 'Categories removed. Channels are now shown in the regular lists.',
  });
});

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private (Admin/Manager)
export const deleteCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findOne({
    _id: req.params.id,
    workspaceId: req.workspaceId,
    createdBy: req.user._id,
  });

  if (!category) {
    return next(new NotFoundError("Category"));
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

  const [accessibleChannelId] = await validateAccessibleCategoryChannels(req, [channelId]);

  const previousCategories = await Category.find({
    workspaceId: req.workspaceId,
    createdBy: req.user._id,
    _id: { $ne: req.params.id },
    channelIds: accessibleChannelId
  });

  if (previousCategories.length > 0) {
    await Category.updateMany(
      { _id: { $in: previousCategories.map(c => c._id) } },
      { $pull: { channelIds: accessibleChannelId } }
    );
    const updatedPrevious = await Category.find({ _id: { $in: previousCategories.map(c => c._id) } }).populate('departmentId');
    for (const cat of updatedPrevious) {
      req.app.get("io")?.to(req.workspaceId.toString()).emit("category:updated", cat);
    }
  }

  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.workspaceId, createdBy: req.user._id },
    { $addToSet: { channelIds: accessibleChannelId }, lastActivity: new Date() },
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
  const [accessibleChannelId] = await validateAccessibleCategoryChannels(req, [req.params.channelId]);

  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.workspaceId, createdBy: req.user._id },
    { $pull: { channelIds: accessibleChannelId }, lastActivity: new Date() },
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

  const accessibleChannelIds = await validateAccessibleCategoryChannels(req, channelIds);

  const previousCategories = await Category.find({
    workspaceId: req.workspaceId,
    createdBy: req.user._id,
    _id: { $ne: req.params.id },
    channelIds: { $in: accessibleChannelIds }
  });

  if (previousCategories.length > 0) {
    await Category.updateMany(
      { _id: { $in: previousCategories.map(c => c._id) } },
      { $pullAll: { channelIds: accessibleChannelIds } }
    );
    const updatedPrevious = await Category.find({ _id: { $in: previousCategories.map(c => c._id) } }).populate('departmentId');
    for (const cat of updatedPrevious) {
      req.app.get("io")?.to(req.workspaceId.toString()).emit("category:updated", cat);
    }
  }

  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.workspaceId, createdBy: req.user._id, type: 'custom' },
    { $addToSet: { channelIds: { $each: accessibleChannelIds } }, lastActivity: new Date() },
    { new: true }
  ).populate('departmentId');

  if (!category) return next(new NotFoundError("Custom Category"));

  req.app.get("io")?.to(req.workspaceId.toString()).emit("category:updated", category);
  res.status(200).json({ success: true, data: category });
});
