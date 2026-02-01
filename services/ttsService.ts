/**
 * TTS (Text-to-Speech) Service
 * ElevenLabs via fal.ai 백엔드 API와 통신
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export interface Voice {
  id: string;
  name: string;
  description: string;
  gender: 'male' | 'female';
}

export interface TTSRequest {
  text: string;
  voice?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
}

export interface TTSResult {
  success: boolean;
  audioUrl?: string;
  requestId?: string;
  error?: string;
}

export interface BatchTTSRequest {
  scenes: Array<{ id: string; text: string }>;
  voice?: string;
  speed?: number;
}

export interface BatchTTSResult {
  success: boolean;
  totalCount: number;
  successCount: number;
  results: Array<{
    sceneId: string;
    success: boolean;
    audioUrl?: string;
    error?: string;
  }>;
}

/**
 * 음성 미리듣기 (샘플 문장으로 TTS 생성)
 */
export async function previewVoiceTTS(voice: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/tts/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || 'Voice preview failed');
  }

  const data = await response.json();
  if (!data.success || !data.audioUrl) {
    throw new Error(data.error || 'No audio URL returned');
  }

  return data.audioUrl;
}

/**
 * 지원 음성 목록 가져오기
 */
export async function getSupportedVoices(): Promise<Voice[]> {
  const response = await fetch(`${API_BASE_URL}/api/tts/voices`);

  if (!response.ok) {
    throw new Error('Failed to fetch voices');
  }

  const data = await response.json();
  return data.voices;
}

/**
 * 단일 TTS 생성 (동기 방식)
 */
export async function generateTTS(request: TTSRequest): Promise<TTSResult> {
  const response = await fetch(`${API_BASE_URL}/api/tts/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || 'TTS generation failed');
  }

  return response.json();
}

/**
 * 여러 장면 일괄 TTS 생성
 */
export async function generateBatchTTS(request: BatchTTSRequest): Promise<BatchTTSResult> {
  const response = await fetch(`${API_BASE_URL}/api/tts/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || 'Batch TTS generation failed');
  }

  return response.json();
}

/**
 * 장면 스크립트들로부터 TTS 생성
 */
export async function generateTTSForScenes(
  scenes: Array<{ id: string; script: string }>,
  voice: string = 'Rachel',
  speed: number = 1.0,
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, string>> {
  const audioMap = new Map<string, string>();

  // 스크립트가 있는 장면만 필터링
  const scenesWithScript = scenes.filter(s => s.script && s.script.trim().length > 0);

  if (scenesWithScript.length === 0) {
    return audioMap;
  }

  const batchRequest: BatchTTSRequest = {
    scenes: scenesWithScript.map(s => ({
      id: s.id,
      text: s.script
    })),
    voice,
    speed
  };

  const result = await generateBatchTTS(batchRequest);

  result.results.forEach((r, index) => {
    if (onProgress) {
      onProgress(index + 1, result.totalCount);
    }
    if (r.success && r.audioUrl) {
      audioMap.set(r.sceneId, r.audioUrl);
    }
  });

  return audioMap;
}

/**
 * Whisper STT로 오디오 전사 (자막 자동 싱크용)
 */
export interface TranscribeSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface TranscribeResult {
  success: boolean;
  segments: TranscribeSegment[];
  fullText: string;
  error?: string;
}

export async function transcribeAudio(audioUrl: string, language: string = 'ko'): Promise<TranscribeResult> {
  const response = await fetch(`${API_BASE_URL}/api/tts/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioUrl, language })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || 'Transcription failed');
  }

  return response.json();
}

// 기본 음성 목록 (오프라인 폴백용)
export const DEFAULT_VOICES: Voice[] = [
  { id: 'Rachel', name: 'Rachel', description: '여성, 차분하고 전문적인 목소리', gender: 'female' },
  { id: 'Aria', name: 'Aria', description: '여성, 밝고 친근한 목소리', gender: 'female' },
  { id: 'Sarah', name: 'Sarah', description: '여성, 부드럽고 따뜻한 목소리', gender: 'female' },
  { id: 'Laura', name: 'Laura', description: '여성, 자연스럽고 편안한 목소리', gender: 'female' },
  { id: 'Domi', name: 'Domi', description: '여성, 젊고 활기찬 목소리', gender: 'female' },
  { id: 'Adam', name: 'Adam', description: '남성, 깊고 전문적인 목소리', gender: 'male' },
  { id: 'Antoni', name: 'Antoni', description: '남성, 따뜻하고 친근한 목소리', gender: 'male' },
  { id: 'Josh', name: 'Josh', description: '남성, 젊고 역동적인 목소리', gender: 'male' },
  { id: 'Arnold', name: 'Arnold', description: '남성, 깊고 무게감 있는 목소리', gender: 'male' },
  { id: 'Sam', name: 'Sam', description: '남성, 차분하고 안정적인 목소리', gender: 'male' },
];
