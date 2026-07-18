import CustomGroup from "./CustomGroup.model.js";
import { emitToWorkspace } from "../../sockets/socketManager.js";
import { BadRequestError, NotFoundError } from "../../middleware/errorHandler.js";
import mongoose from "mongoose";

// GET /api/custom-groups
export const getGroups = async (req, res, next) => {
  try {
    const { workspaceId } = req;
    
    const groups = await CustomGroup.find({ workspaceId }).populate('channels');
    
    res.status(200).json({
      success: true,
      data: groups,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/custom-groups
export const createGroup = async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const { name, channels = [] } = req.body;
    
    if (!name) {
      throw new BadRequestError("Group name is required");
    }
    
    const group = await CustomGroup.create({
      name,
      workspaceId,
      createdBy: req.user._id,
      channels,
    });
    
    await group.populate('channels');
    
    // Broadcast creation to workspace
    emitToWorkspace(workspaceId, "customGroup:created", group);
    
    res.status(201).json({
      success: true,
      data: group,
    });
  } catch (error) {
    if (error.code === 11000) {
      next(new BadRequestError("A group with this name already exists"));
    } else {
      next(error);
    }
  }
};

// PUT /api/custom-groups/:id
export const updateGroup = async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const { id } = req.params;
    const { name, channels } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError("Invalid group ID");
    }
    
    const group = await CustomGroup.findOne({ _id: id, workspaceId });
    if (!group) {
      throw new NotFoundError("Custom group not found");
    }
    
    if (name) group.name = name;
    if (channels) group.channels = channels;
    
    await group.save();
    await group.populate('channels');
    
    // Broadcast update
    emitToWorkspace(workspaceId, "customGroup:updated", group);
    
    res.status(200).json({
      success: true,
      data: group,
    });
  } catch (error) {
    if (error.code === 11000) {
      next(new BadRequestError("A group with this name already exists"));
    } else {
      next(error);
    }
  }
};

// DELETE /api/custom-groups/:id
export const deleteGroup = async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError("Invalid group ID");
    }
    
    const group = await CustomGroup.findOneAndDelete({ _id: id, workspaceId });
    if (!group) {
      throw new NotFoundError("Custom group not found");
    }
    
    // Broadcast deletion
    emitToWorkspace(workspaceId, "customGroup:deleted", { _id: id, workspaceId });
    
    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
