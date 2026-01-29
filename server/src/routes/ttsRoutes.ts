import { Router } from 'express';
import {
  generateTTS,
  submitTTS,
  getTTSStatus,
  getTTSResult,
  getSupportedVoices,
  generateBatchTTS
} from '../controllers/ttsController.js';

const router = Router();

// 음성 목록 조회
router.get('/voices', getSupportedVoices);

// TTS 동기 생성 (짧은 텍스트)
router.post('/generate', generateTTS);

// TTS 비동기 제출 (긴 텍스트)
router.post('/submit', submitTTS);

// 일괄 TTS 생성
router.post('/batch', generateBatchTTS);

// 상태 확인
router.get('/status/:requestId', getTTSStatus);

// 결과 가져오기
router.get('/result/:requestId', getTTSResult);

export default router;
