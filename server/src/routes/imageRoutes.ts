import { Router } from 'express';
import { generateImageFromPrompt } from '../controllers/imageController.js';

const router = Router();

// POST /api/image/generate - 이미지 생성
router.post('/generate', generateImageFromPrompt);

export default router;
