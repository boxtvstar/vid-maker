import type { Request, Response, NextFunction } from 'express';
import { fal } from '@fal-ai/client';
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
 * 음성 미리듣기 (짧은 샘플 생성)
 * POST /api/tts/preview
 */
export async function previewVoice(
  req: Request<{}, {}, { voice: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { voice } = req.body;

    if (!voice) {
      return res.status(400).json({ error: 'voice is required' });
    }

    console.log(`TTS preview requested: voice=${voice}`);

    const result = await elevenLabsTTS.generate({
      text: '안녕하세요, 저는 AI 음성입니다. 이 목소리로 영상 나레이션을 만들어 드릴게요.',
      voice,
      speed: 1.0,
    });

    if (result.status === 'failed') {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      audioUrl: result.audioUrl,
    });
  } catch (error) {
    next(error);
  }
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

/**
 * 오디오 파일을 Whisper로 전사 (단어별 타임스탬프 포함)
 * POST /api/tts/transcribe
 */
export async function transcribeAudio(
  req: Request<{}, {}, { audioUrl: string; language?: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { audioUrl, language } = req.body;

    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl is required' });
    }

    console.log(`Whisper transcription requested: ${audioUrl.substring(0, 80)}...`);

    const result = await fal.subscribe('fal-ai/whisper', {
      input: {
        audio_url: audioUrl,
        task: 'transcribe',
        language: (language || 'ko') as any,
        chunk_level: 'segment',
        version: '3',
      },
      logs: true,
    }) as any;

    const chunks = result?.data?.chunks || [];

    // 세그먼트(chunks)를 반환 — 각 chunk: { text, timestamp: [start, end] }
    const segments = chunks.map((chunk: any, idx: number) => ({
      id: `whisper-seg-${idx}`,
      text: (chunk.text || '').trim(),
      startTime: chunk.timestamp?.[0] ?? 0,
      endTime: chunk.timestamp?.[1] ?? 0,
    })).filter((seg: any) => seg.text.length > 0);

    res.json({
      success: true,
      segments,
      fullText: result?.data?.text || '',
    });

  } catch (error) {
    console.error('Whisper transcription error:', error);
    next(error);
  }
}

/**
 * ElevenLabs Voice 정보 가져오기
 * GET /api/tts/voice/:voiceId
 */
export async function getVoiceInfo(
  req: Request<{ voiceId: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { voiceId } = req.params;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return res.status(503).json({ 
        error: '⚠️ 정보 불러오기 실패: 서버에 ElevenLabs Key가 설정되지 않아 상세 정보를 가져올 수 없습니다. 하지만 입력하신 ID로 음성 생성은 정상적으로 가능하므로, 이름과 성격을 직접 입력하고 저장하시면 됩니다.' 
      });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs API Error:', response.status, errText);
      
      let clientMsg = `ElevenLabs API 오류 (${response.status})`;
      if (response.status === 401) {
        clientMsg = '서버의 ElevenLabs API Key가 유효하지 않습니다. .env 설정을 확인하세요.';
      } else if (response.status === 404) {
        clientMsg = '해당 Voice ID를 찾을 수 없습니다. 아이디를 다시 확인해주세요.';
      } else {
         try {
             const errJson = JSON.parse(errText);
             if (errJson.detail && errJson.detail.message) clientMsg = errJson.detail.message;
         } catch {}
      }
      
      return res.status(response.status).json({ error: clientMsg });
    }

    const data = await response.json();
    
    // 라벨 정보 조합 (accent, description, age, gender, use case)
    const labels = data.labels || {};
    const descriptionParts = [];
    if (labels.accent) descriptionParts.push(labels.accent);
    if (labels.description) descriptionParts.push(labels.description);
    if (labels.gender) descriptionParts.push(labels.gender);
    if (labels.age) descriptionParts.push(labels.age);
    if (labels.use_case) descriptionParts.push(labels.use_case);

    const typeDesc = descriptionParts.length > 0 ? descriptionParts.join(', ') : (data.category || 'Custom Voice');

    res.json({
      success: true,
      voice: {
        id: data.voice_id,
        name: data.name,
        type: typeDesc,
        previewUrl: data.preview_url
      }
    });

  } catch (error) {
    console.error('getVoiceInfo error:', error);
    next(error);
  }
}
