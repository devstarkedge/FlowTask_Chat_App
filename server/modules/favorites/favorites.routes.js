import { Router } from "express";
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  toggleFavorite,
  checkFavorite,
} from "./favorites.controller.js";
import { protect } from "../auth/auth.middleware.js";
import { resolveWorkspace } from "../../middleware/workspaceContext.js";

const router = Router();

/**
 * Favorites Routes — all protected
 *
 * GET    /api/chat/favorites        — List user's favorites
 * POST   /api/chat/favorites        — Add favorite
 * POST   /api/chat/favorites/toggle — Toggle favorite
 * DELETE /api/chat/favorites/:id    — Remove favorite by id
 * GET    /api/chat/favorites/check  — Check if target is favorited
 */

router.use(protect);
router.use(resolveWorkspace);

router.get("/", getFavorites);
router.post("/", addFavorite);
router.post("/toggle", toggleFavorite);
router.delete("/:id", removeFavorite);
router.get("/check", checkFavorite);

export default router;