import express from "express";
import {
  syncExternalDepartments,
  getDepartments,
  getCategories,
  clearAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  suggestChannels,
  addChannelToCategory,
  addBulkChannelsToCategory,
  removeChannelFromCategory,
} from "./category.controller.js";
import { protect } from "../auth/auth.middleware.js";
import { resolveWorkspace } from "../../middleware/workspaceContext.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);
router.use(resolveWorkspace);

router.post("/sync-departments", syncExternalDepartments);
router.get("/departments", getDepartments);

router.get("/", getCategories);
router.post("/", createCategory);
router.delete("/", clearAllCategories);
router.post("/suggest-channels", suggestChannels);
router.put("/reorder", reorderCategories);

router
  .route("/:id")
  .put(updateCategory)
  .delete(deleteCategory);

// Note: Channels in custom categories are user-specific, so users can add/remove channels to their own categories
router.post("/:id/channels", addChannelToCategory);
router.post("/:id/bulk-channels", addBulkChannelsToCategory);
router.delete("/:id/channels/:channelId", removeChannelFromCategory);

export default router;
