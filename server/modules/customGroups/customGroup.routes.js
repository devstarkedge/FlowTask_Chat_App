import express from "express";
import { getGroups, createGroup, updateGroup, deleteGroup } from "./customGroup.controller.js";
import { protect } from "../auth/auth.middleware.js";
import { resolveWorkspace, requireWorkspaceRole } from "../../middleware/workspaceContext.js";

const router = express.Router();

// All custom group routes require authentication + workspace context
router.use(protect, resolveWorkspace);

// Only admins, owners, and managers can access custom groups
router.get("/", requireWorkspaceRole("owner", "admin", "manager"), getGroups);

// Only admins, owners, and managers can create, update, or delete custom groups
router.post("/", requireWorkspaceRole("owner", "admin", "manager"), createGroup);
router.put("/:id", requireWorkspaceRole("owner", "admin", "manager"), updateGroup);
router.delete("/:id", requireWorkspaceRole("owner", "admin", "manager"), deleteGroup);

export default router;
