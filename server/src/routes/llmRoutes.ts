import { Router } from 'express';
import { generateLLMResponse } from '../controllers/llmController.js';

const router = Router();

// POST /api/llm/generate - LLM 텍스트 생성
router.post('/generate', generateLLMResponse);

export default router;
