import { Router } from 'express';
import {
  generateTTS,
  submitTTS,
  getTTSStatus,
  getTTSResult,
  getSupportedVoices,
  generateBatchTTS,
  previewVoice,
  transcribeAudio,
  getVoiceInfo
} from '../controllers/ttsController.js';

const router = Router();

// 음성 목록 조회
router.get('/voices', getSupportedVoices);

// Voice 상세 정보 가져오기 (관리자용) - ElevenLabs API 직접 조회를 위함
router.get('/voice/:voiceId', getVoiceInfo);

// 음성 미리듣기 (짧은 샘플)
router.post('/preview', previewVoice);

// TTS 동기 생성 (짧은 텍스트)
router.post('/generate', generateTTS);

// TTS 비동기 제출 (긴 텍스트)
router.post('/submit', submitTTS);

// 일괄 TTS 생성
router.post('/batch', generateBatchTTS);

// Whisper 음성 전사 (자막 자동 싱크)
router.post('/transcribe', transcribeAudio);

// 상태 확인
router.get('/status/:requestId', getTTSStatus);

// 결과 가져오기
router.get('/result/:requestId', getTTSResult);

export default router;
