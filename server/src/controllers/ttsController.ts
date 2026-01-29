import type { Request, Response, NextFunction } from 'express';
import { elevenLabsTTS, type TTSRequest } from '../providers/ElevenLabsTTSProvider.js';

interface GenerateTTSRequestBody extends TTSRequest {}

/**
 * TTS 생성 (동기 방식 - 짧은 텍스트용)
 * POST /api/tts/generate
 */
export async function generateTTS(
  req: Request<{}, {}, GenerateTTSRequestBody>,
  res: Response,
  next: NextFunction
) {
  try {
    const { text, voice, stability, similarityBoost, speed } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    console.log(`TTS generation requested: voice=${voice}, text length=${text.length}`);

    const result = await elevenLabsTTS.generate({
      text,
      voice,
      stability,
      similarityBoost,
      speed
    });

    if (result.status === 'failed') {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      audioUrl: result.audioUrl,
      requestId: result.requestId
    });

  } catch (error) {
    next(error);
  }
}

/**
 * TTS 생성 요청 제출 (비동기 방식 - 긴 텍스트용)
 * POST /api/tts/submit
 */
export async function submitTTS(
  req: Request<{}, {}, GenerateTTSRequestBody>,
  res: Response,
  next: NextFunction
) {
  try {
    const { text, voice, stability, similarityBoost, speed } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const result = await elevenLabsTTS.submitGeneration({
      text,
      voice,
      stability,
      similarityBoost,
      speed
    });

    res.json({
      success: true,
      requestId: result.requestId
    });

  } catch (error) {
    next(error);
  }
}

/**
 * TTS 상태 확인
 * GET /api/tts/status/:requestId
 */
export async function getTTSStatus(
  req: Request<{ requestId: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { requestId } = req.params;
    const status = await elevenLabsTTS.checkStatus(requestId);
    res.json(status);
  } catch (error) {
    next(error);
  }
}

/**
 * TTS 결과 가져오기
 * GET /api/tts/result/:requestId
 */
export async function getTTSResult(
  req: Request<{ requestId: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { requestId } = req.params;
    const result = await elevenLabsTTS.getResult(requestId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * 지원 음성 목록
 * GET /api/tts/voices
 */
export function getSupportedVoices(req: Request, res: Response) {
  res.json({
    voices: elevenLabsTTS.getSupportedVoices()
  });
}

/**
 * 여러 장면의 TTS 일괄 생성
 * POST /api/tts/batch
 */
export async function generateBatchTTS(
  req: Request<{}, {}, { scenes: Array<{ id: string; text: string }>; voice?: string; speed?: number }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { scenes, voice, speed } = req.body;

    if (!scenes || !Array.isArray(scenes)) {
      return res.status(400).json({ error: 'scenes array is required' });
    }

    console.log(`Batch TTS requested: ${scenes.length} scenes, voice=${voice}`);

    const results = await Promise.all(
      scenes.map(async (scene) => {
        try {
          const result = await elevenLabsTTS.generate({
            text: scene.text,
            voice,
            speed
          });
          return {
            sceneId: scene.id,
            success: result.status === 'completed',
            audioUrl: result.audioUrl,
            error: result.error
          };
        } catch (error) {
          return {
            sceneId: scene.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: successCount === scenes.length,
      totalCount: scenes.length,
      successCount,
      results
    });

  } catch (error) {
    next(error);
  }
}
