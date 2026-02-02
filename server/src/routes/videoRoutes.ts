import { Router } from 'express';
import {
  submitVideoGeneration,
  getVideoStatus,
  getVideoResult,
  getSupportedProviders
} from '../controllers/videoController.js';
import { renderVideo } from '../controllers/renderController.js';

const router = Router();

// POST /api/video/generate - 비디오 생성 요청
router.post('/generate', submitVideoGeneration);

// POST /api/video/render - 최종 비디오 렌더링 (병합)
router.post('/render', renderVideo);

// GET /api/video/status/:requestId - 상태 확인
router.get('/status/:requestId', getVideoStatus);

// GET /api/video/result/:requestId - 결과 가져오기
router.get('/result/:requestId', getVideoResult);

// GET /api/video/providers - 지원 Provider 목록
router.get('/providers', getSupportedProviders);

export default router;
