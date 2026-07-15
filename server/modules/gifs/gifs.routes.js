import { Router } from 'express';
import { gifsController } from './gifs.controller.js';
import { protect } from '../auth/auth.middleware.js';

const router = Router();

// All GIF routes require authentication
router.use(protect);

router.get('/search', gifsController.search);
router.get('/trending', gifsController.getTrending);
router.get('/categories', gifsController.getCategories);

export default router;
